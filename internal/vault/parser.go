package vault

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"gopkg.in/yaml.v3"
)

var (
	frontmatterRe = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---\r?\n?`)
	wikilinkRe    = regexp.MustCompile(`\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]`)
	inlineTagRe   = regexp.MustCompile(`(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)`)
	headerRe      = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)
	fencedTickRe  = regexp.MustCompile("(?m)^`{3,}[^\\n]*\\n[\\s\\S]*?\\n`{3,}[ \\t]*$")
	fencedTildeRe = regexp.MustCompile("(?m)^~{3,}[^\\n]*\\n[\\s\\S]*?\\n~{3,}[ \\t]*$")

	// stripMarkdown regexes
	stripWikilinkRe  = regexp.MustCompile(`\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]`)
	stripMdImageRe   = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	stripMdLinkRe    = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	inlineCodeRe     = regexp.MustCompile("`[^`\n]+`")
	htmlTagRe        = regexp.MustCompile(`<[^>]+>`)
	mdHeaderPrefixRe = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	blockquoteRe     = regexp.MustCompile(`(?m)^>\s*`)
	boldItalicRe     = regexp.MustCompile(`\*{1,3}([^*\n]*)\*{1,3}`)
	underItalicRe    = regexp.MustCompile(`\b_([^_\n]+)_\b`)
	multiSpaceRe     = regexp.MustCompile(`[ \t]{2,}`)
)

// imageExts and attachmentExts are file extensions tracked as attachments.
var attachmentExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".svg": true, ".webp": true, ".pdf": true, ".mp4": true,
	".mp3": true, ".wav": true, ".ogg": true, ".mov": true,
	".zip": true, ".csv": true, ".xlsx": true,
}

// isWithinVault reports whether targetPath resolves (via any symlinks) to a
// location inside vaultRoot. Returns false for unresolvable paths.
func isWithinVault(vaultRoot, targetPath string) bool {
	resolvedVault, err := filepath.EvalSymlinks(vaultRoot)
	if err != nil {
		return false
	}
	resolved, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(resolvedVault, resolved)
	if err != nil {
		return false
	}
	return !strings.HasPrefix(rel, "..")
}

// ParseVault walks vaultPath and returns a populated VaultData.
func ParseVault(vaultPath string) (*VaultData, error) {
	vaultPath = filepath.Clean(vaultPath)
	info, err := os.Stat(vaultPath)
	if err != nil {
		return nil, fmt.Errorf("cannot access vault path: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", vaultPath)
	}

	vaultName := filepath.Base(vaultPath)

	var notes []Note
	var canvases []Canvas
	attachments := map[string]string{}    // lowercase-basename → vault-relative-slash-path
	titleToID := map[string]string{}      // exact title → id
	lowerTitleToID := map[string]string{} // lowercase title → id

	// --- Walk: parse notes and collect attachments ---
	err = filepath.WalkDir(vaultPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		// Skip hidden directories (e.g., .obsidian)
		if d.IsDir() && strings.HasPrefix(d.Name(), ".") {
			return filepath.SkipDir
		}
		if d.IsDir() {
			return nil
		}

		relPath, _ := filepath.Rel(vaultPath, path)
		relPath = filepath.ToSlash(relPath)
		ext := strings.ToLower(filepath.Ext(d.Name()))

		if ext == ".md" {
			if !isWithinVault(vaultPath, path) {
				return nil // skip symlinks pointing outside vault
			}
			note, err := parseNote(path, vaultPath)
			if err != nil {
				relErr, _ := filepath.Rel(vaultPath, path)
				return fmt.Errorf("parsing %s: %w", relErr, err)
			}
			notes = append(notes, *note)
			titleToID[note.Title] = note.ID
			lowerTitleToID[strings.ToLower(note.Title)] = note.ID
			// Register aliases so [[Alias]] resolves to this note
			for _, alias := range note.Aliases {
				if _, exists := titleToID[alias]; !exists {
					titleToID[alias] = note.ID
				}
				lower := strings.ToLower(alias)
				if _, exists := lowerTitleToID[lower]; !exists {
					lowerTitleToID[lower] = note.ID
				}
			}
		} else if ext == ".canvas" {
			if !isWithinVault(vaultPath, path) {
				return nil // skip symlinks pointing outside vault
			}
			canvas, err := parseCanvas(path, vaultPath)
			if err != nil {
				relErr, _ := filepath.Rel(vaultPath, path)
				return fmt.Errorf("parsing %s: %w", relErr, err)
			}
			canvases = append(canvases, *canvas)
		} else if attachmentExts[ext] {
			if !isWithinVault(vaultPath, path) {
				return nil // skip symlinks pointing outside vault
			}
			key := strings.ToLower(d.Name())
			attachments[key] = relPath
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// --- Resolve wikilinks, build backlinks + edges ---
	backlinkMap := map[string][]string{}
	var edges []Edge

	for i, note := range notes {
		resolved := resolveLinks(note.Links, titleToID, lowerTitleToID)
		notes[i].Links = resolved
		for _, target := range resolved {
			backlinkMap[target] = append(backlinkMap[target], note.ID)
			edges = append(edges, Edge{Source: note.ID, Target: target})
		}
	}
	for i, note := range notes {
		notes[i].Backlinks = backlinkMap[note.ID]
		if notes[i].Backlinks == nil {
			notes[i].Backlinks = []string{}
		}
		if notes[i].Links == nil {
			notes[i].Links = []string{}
		}
		if notes[i].Tags == nil {
			notes[i].Tags = []string{}
		}
		if notes[i].Headers == nil {
			notes[i].Headers = []Header{}
		}
		_ = note
	}

	// --- Collect global tag set ---
	tagSet := map[string]struct{}{}
	for _, n := range notes {
		for _, t := range n.Tags {
			tagSet[t] = struct{}{}
		}
	}
	var tags []string
	for t := range tagSet {
		tags = append(tags, t)
	}

	// --- Resolve canvas file-node references to note ids ---
	noteIDSet := make(map[string]struct{}, len(notes))
	for _, n := range notes {
		noteIDSet[n.ID] = struct{}{}
	}
	resolveCanvasNotes(canvases, noteIDSet)
	if canvases == nil {
		canvases = []Canvas{}
	}

	// --- 4-pass folder algorithm ---
	folders := buildFolders(notes)

	if edges == nil {
		edges = []Edge{}
	}
	if tags == nil {
		tags = []string{}
	}

	return &VaultData{
		Name:        vaultName,
		Notes:       notes,
		Tags:        tags,
		Folders:     folders,
		Edges:       edges,
		Attachments: attachments,
		Canvases:    canvases,
	}, nil
}

// buildFolders uses a 4-pass algorithm to build a correct folder tree.
func buildFolders(notes []Note) []Folder {
	// Pass 1: discover all ancestor folder paths from note paths
	pathSet := map[string]struct{}{}
	for _, n := range notes {
		if n.Folder == "" {
			continue
		}
		parts := strings.Split(n.Folder, "/")
		for i := 1; i <= len(parts); i++ {
			pathSet[strings.Join(parts[:i], "/")] = struct{}{}
		}
	}

	// Pass 2: create all folder entries
	folderMap := map[string]*Folder{}
	for p := range pathSet {
		name := filepath.Base(p)
		parent := filepath.ToSlash(filepath.Dir(p))
		if parent == "." {
			parent = ""
		}
		folderMap[p] = &Folder{
			Name:     name,
			Path:     p,
			Parent:   parent,
			Children: []string{},
			Notes:    []string{},
		}
	}

	// Pass 3: assign notes to their immediate parent folder
	for _, n := range notes {
		if n.Folder != "" {
			if f, ok := folderMap[n.Folder]; ok {
				f.Notes = append(f.Notes, n.ID)
			}
		}
	}

	// Pass 4: link parent ↔ children
	for path, f := range folderMap {
		if f.Parent != "" {
			if parent, ok := folderMap[f.Parent]; ok {
				parent.Children = append(parent.Children, path)
			}
		}
	}

	var result []Folder
	for _, f := range folderMap {
		result = append(result, *f)
	}
	if result == nil {
		result = []Folder{}
	}
	return result
}

func parseNote(path, vaultRoot string) (*Note, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	content := string(raw)

	fileInfo, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	relPath, _ := filepath.Rel(vaultRoot, path)
	relPath = filepath.ToSlash(relPath)

	id := pathToID(relPath)
	title := strings.TrimSuffix(filepath.Base(path), ".md")
	folder := filepath.ToSlash(filepath.Dir(relPath))
	if folder == "." {
		folder = ""
	}

	// Parse frontmatter
	frontmatter := map[string]interface{}{}
	body := content
	if m := frontmatterRe.FindStringSubmatchIndex(content); m != nil {
		yamlStr := content[m[2]:m[3]]
		_ = yaml.Unmarshal([]byte(yamlStr), &frontmatter)
		body = content[m[1]:]

		// Title override from frontmatter
		if t, ok := frontmatter["title"].(string); ok && t != "" {
			title = t
		}
	}

	// Extract aliases from frontmatter
	var aliases []string
	if raw, ok := frontmatter["aliases"]; ok {
		switch v := raw.(type) {
		case []interface{}:
			for _, a := range v {
				if s, ok := a.(string); ok && s != "" {
					aliases = append(aliases, s)
				}
			}
		case string:
			if v != "" {
				aliases = append(aliases, v)
			}
		}
	}

	// Extract tags from frontmatter
	var tags []string
	tagSet := map[string]struct{}{}

	if fm, ok := frontmatter["tags"]; ok {
		switch v := fm.(type) {
		case []interface{}:
			for _, t := range v {
				if s, ok := t.(string); ok {
					s = strings.TrimPrefix(s, "#")
					if _, seen := tagSet[s]; !seen {
						tags = append(tags, s)
						tagSet[s] = struct{}{}
					}
				}
			}
		case string:
			s := strings.TrimPrefix(v, "#")
			if _, seen := tagSet[s]; !seen {
				tags = append(tags, s)
				tagSet[s] = struct{}{}
			}
		}
	}

	// Extract inline tags from body
	for _, m := range inlineTagRe.FindAllStringSubmatch(body, -1) {
		t := m[1]
		if _, seen := tagSet[t]; !seen {
			tags = append(tags, t)
			tagSet[t] = struct{}{}
		}
	}

	// Extract wikilinks (raw title-based targets; resolved later)
	var links []string
	linkSet := map[string]struct{}{}
	for _, m := range wikilinkRe.FindAllStringSubmatch(content, -1) {
		target := strings.TrimSpace(m[1])
		// Strip anchor fragment
		target = strings.SplitN(target, "#", 2)[0]
		target = strings.TrimSpace(target)
		if target == "" {
			continue
		}
		if _, seen := linkSet[target]; !seen {
			links = append(links, target)
			linkSet[target] = struct{}{}
		}
	}

	// Extract headers — strip fenced code blocks first so # comments aren't detected as headings
	bodyForHeaders := fencedTickRe.ReplaceAllString(body, "")
	bodyForHeaders = fencedTildeRe.ReplaceAllString(bodyForHeaders, "")
	var headers []Header
	for _, m := range headerRe.FindAllStringSubmatch(bodyForHeaders, -1) {
		level := len(m[1])
		text := strings.TrimSpace(m[2])
		headers = append(headers, Header{
			Level: level,
			Text:  text,
			Slug:  slugify(text),
		})
	}

	modTime := fileInfo.ModTime().UTC().Format(time.RFC3339)
	createdTime := parseFrontmatterDate(frontmatter, modTime)

	if aliases == nil {
		aliases = []string{}
	}

	return &Note{
		ID:          id,
		Title:       title,
		Aliases:     aliases,
		Path:        relPath,
		Content:     content,
		PlainText:   stripMarkdown(body),
		Tags:        tags,
		Links:       links,
		Frontmatter: frontmatter,
		Headers:     headers,
		Folder:      folder,
		Modified:    modTime,
		Created:     createdTime,
	}, nil
}

// parseFrontmatterDate looks for a creation date in common Obsidian frontmatter
// keys ("date", "created", "created_at") and returns it as RFC3339. Falls back
// to fallback (the file's modtime) if no valid date is found.
func parseFrontmatterDate(fm map[string]interface{}, fallback string) string {
	// Candidate keys in priority order
	for _, key := range []string{"date", "created", "created_at"} {
		val, ok := fm[key]
		if !ok || val == nil {
			continue
		}

		switch v := val.(type) {
		case time.Time:
			return v.UTC().Format(time.RFC3339)
		case string:
			if v == "" {
				continue
			}
			// Try common date formats
			for _, layout := range []string{
				time.RFC3339,
				"2006-01-02T15:04:05",
				"2006-01-02 15:04:05",
				"2006-01-02",
				"02/01/2006",
				"01/02/2006",
			} {
				if t, err := time.Parse(layout, v); err == nil {
					return t.UTC().Format(time.RFC3339)
				}
			}
		}
	}
	return fallback
}

// resolveLinks converts title-based wikilink targets to note IDs using 3-tier lookup.
func resolveLinks(links []string, titleToID, lowerTitleToID map[string]string) []string {
	var resolved []string
	seen := map[string]struct{}{}

	for _, link := range links {
		target := strings.TrimSpace(link)
		if target == "" {
			continue
		}

		var id string

		// Tier 1: exact title match
		if v, ok := titleToID[target]; ok {
			id = v
		}

		// Tier 2: case-insensitive title match
		if id == "" {
			if v, ok := lowerTitleToID[strings.ToLower(target)]; ok {
				id = v
			}
		}

		// Tier 3: basename match — check if any note ID ends with the slugified target.
		// Several IDs may match; pick the lexicographically smallest so resolution
		// is deterministic (map iteration order is randomized).
		if id == "" {
			slugTarget := pathToID(target)
			for _, noteID := range titleToID {
				if strings.HasSuffix(noteID, slugTarget) && (id == "" || noteID < id) {
					id = noteID
				}
			}
		}

		if id != "" {
			if _, dup := seen[id]; !dup {
				resolved = append(resolved, id)
				seen[id] = struct{}{}
			}
		}
	}
	return resolved
}

// FilterVaultData returns a new VaultData containing only notes (and attachments)
// that match the given include paths. Each entry in includes may be:
//   - a folder path (e.g. "Notes" or "Notes/") → includes all notes under it
//   - a file path with or without .md extension (e.g. "Notes/Foo.md" or "Notes/Foo")
//
// If includes is empty, the original data is returned unchanged.
// Edges and backlinks are pruned to only reference included notes.
func FilterVaultData(data *VaultData, includes []string) *VaultData {
	if len(includes) == 0 {
		return data
	}

	// Normalize: clean path separators, strip trailing slash
	normalized := make([]string, 0, len(includes))
	for _, inc := range includes {
		inc = filepath.ToSlash(filepath.Clean(inc))
		normalized = append(normalized, inc)
	}

	// Filter notes
	var filteredNotes []Note
	for _, note := range data.Notes {
		if matchesAnyInclude(note.Path, normalized) {
			filteredNotes = append(filteredNotes, note)
		}
	}

	// Filter attachments to those inside included folders/paths
	filteredAttachments := map[string]string{}
	for key, relPath := range data.Attachments {
		if matchesAnyInclude(relPath, normalized) {
			filteredAttachments[key] = relPath
		}
	}

	out := rebuildVaultData(data, filteredNotes, filteredAttachments)
	noteSet := make(map[string]struct{}, len(filteredNotes))
	for _, n := range filteredNotes {
		noteSet[n.ID] = struct{}{}
	}
	out.Canvases = filterCanvases(data.Canvases, noteSet, func(c Canvas) bool {
		return matchesAnyInclude(c.Path, normalized)
	})
	return out
}

// rebuildVaultData reconstructs the derived structures (edges, backlinks,
// per-note links, tags, folders) for a filtered subset of notes, so that
// nothing references a note outside the subset.
func rebuildVaultData(data *VaultData, filteredNotes []Note, attachments map[string]string) *VaultData {
	if filteredNotes == nil {
		filteredNotes = []Note{}
	}
	noteSet := map[string]struct{}{}
	for _, note := range filteredNotes {
		noteSet[note.ID] = struct{}{}
	}

	// Rebuild edges (only between included notes)
	var edges []Edge
	for _, e := range data.Edges {
		_, srcOK := noteSet[e.Source]
		_, dstOK := noteSet[e.Target]
		if srcOK && dstOK {
			edges = append(edges, e)
		}
	}
	if edges == nil {
		edges = []Edge{}
	}

	// Rebuild backlink map from pruned edges
	backlinkMap := map[string][]string{}
	for _, e := range edges {
		backlinkMap[e.Target] = append(backlinkMap[e.Target], e.Source)
	}

	// Update links/backlinks in each note to only reference included notes
	for i, note := range filteredNotes {
		var resolvedLinks []string
		for _, link := range note.Links {
			if _, ok := noteSet[link]; ok {
				resolvedLinks = append(resolvedLinks, link)
			}
		}
		if resolvedLinks == nil {
			resolvedLinks = []string{}
		}
		filteredNotes[i].Links = resolvedLinks
		if bl := backlinkMap[note.ID]; bl != nil {
			filteredNotes[i].Backlinks = bl
		} else {
			filteredNotes[i].Backlinks = []string{}
		}
	}

	// Rebuild global tag set
	tagSet := map[string]struct{}{}
	for _, n := range filteredNotes {
		for _, t := range n.Tags {
			tagSet[t] = struct{}{}
		}
	}
	var tags []string
	for t := range tagSet {
		tags = append(tags, t)
	}
	if tags == nil {
		tags = []string{}
	}

	return &VaultData{
		Name:        data.Name,
		Notes:       filteredNotes,
		Tags:        tags,
		Folders:     buildFolders(filteredNotes),
		Edges:       edges,
		Attachments: attachments,
		Canvases:    []Canvas{},
	}
}

// matchesAnyInclude reports whether notePath is covered by any of the include patterns.
// A pattern matches if it equals the path (with/without .md) or is a folder prefix.
func matchesAnyInclude(notePath string, includes []string) bool {
	for _, inc := range includes {
		if notePath == inc || notePath == inc+".md" {
			return true
		}
		if strings.HasPrefix(notePath, inc+"/") {
			return true
		}
	}
	return false
}

// pathToID converts a relative file path to a stable ID.
func pathToID(relPath string) string {
	id := strings.TrimSuffix(relPath, ".md")
	id = strings.ToLower(id)
	id = strings.ReplaceAll(id, "/", "-")
	id = strings.ReplaceAll(id, " ", "-")
	var b strings.Builder
	for _, r := range id {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			b.WriteRune(r)
		}
	}
	result := b.String()
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}
	return strings.Trim(result, "-")
}

// stripMarkdown returns a plain-text version of a markdown body suitable for
// full-text search. It removes fenced code blocks, inline code, images, links
// (keeping link text), wikilinks (keeping display text), heading markers,
// blockquote markers, bold/italic markers, and HTML tags.
func stripMarkdown(body string) string {
	s := fencedTickRe.ReplaceAllString(body, " ")
	s = fencedTildeRe.ReplaceAllString(s, " ")
	s = inlineCodeRe.ReplaceAllString(s, " ")
	s = stripMdImageRe.ReplaceAllString(s, " ")
	s = stripMdLinkRe.ReplaceAllString(s, "$1")
	s = stripWikilinkRe.ReplaceAllString(s, "$1")
	s = mdHeaderPrefixRe.ReplaceAllString(s, "")
	s = blockquoteRe.ReplaceAllString(s, "")
	s = boldItalicRe.ReplaceAllString(s, "$1")
	s = underItalicRe.ReplaceAllString(s, "$1")
	s = htmlTagRe.ReplaceAllString(s, " ")
	s = multiSpaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// slugify creates a URL-safe slug from a heading string.
func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else if unicode.IsSpace(r) || r == '-' {
			b.WriteRune('-')
		}
	}
	result := b.String()
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}
	return strings.Trim(result, "-")
}
