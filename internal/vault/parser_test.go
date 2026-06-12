package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ── pathToID ─────────────────────────────────────────────────────────────────

func TestPathToID(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Welcome.md", "welcome"},
		{"Getting Started.md", "getting-started"},
		{"Links/Wikilinks.md", "links-wikilinks"},
		{"Folders/Level 1/Level 2/Deep Note.md", "folders-level-1-level-2-deep-note"},
		{"Advanced/Long Document.md", "advanced-long-document"},
		// Special chars stripped
		{"My Note (draft).md", "my-note-draft"},
		// Already-clean id passthrough
		{"simple.md", "simple"},
		// Collapse consecutive dashes
		{"a--b.md", "a-b"},
	}
	for _, c := range cases {
		got := pathToID(c.in)
		if got != c.want {
			t.Errorf("pathToID(%q) = %q; want %q", c.in, got, c.want)
		}
	}
}

// ── slugify ───────────────────────────────────────────────────────────────────

func TestSlugify(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Hello World", "hello-world"},
		{"Getting Started", "getting-started"},
		{"C++ Tips & Tricks", "c-tips-tricks"},
		{"  Leading and trailing  ", "leading-and-trailing"},
		{"Already-slugged", "already-slugged"},
		// Collapse consecutive dashes
		{"a  b", "a-b"},
	}
	for _, c := range cases {
		got := slugify(c.in)
		if got != c.want {
			t.Errorf("slugify(%q) = %q; want %q", c.in, got, c.want)
		}
	}
}

// ── resolveLinks ──────────────────────────────────────────────────────────────

func TestResolveLinks(t *testing.T) {
	titleToID := map[string]string{
		"Welcome":         "welcome",
		"Getting Started": "getting-started",
		"Deep Note":       "folders-level-1-level-2-deep-note",
	}
	lowerTitleToID := map[string]string{
		"welcome":         "welcome",
		"getting started": "getting-started",
		"deep note":       "folders-level-1-level-2-deep-note",
	}

	t.Run("exact match", func(t *testing.T) {
		got := resolveLinks([]string{"Welcome"}, titleToID, lowerTitleToID)
		if len(got) != 1 || got[0] != "welcome" {
			t.Errorf("got %v; want [welcome]", got)
		}
	})

	t.Run("case-insensitive match", func(t *testing.T) {
		got := resolveLinks([]string{"getting started"}, titleToID, lowerTitleToID)
		if len(got) != 1 || got[0] != "getting-started" {
			t.Errorf("got %v; want [getting-started]", got)
		}
	})

	t.Run("suffix slug match", func(t *testing.T) {
		got := resolveLinks([]string{"deep-note"}, titleToID, lowerTitleToID)
		if len(got) != 1 || got[0] != "folders-level-1-level-2-deep-note" {
			t.Errorf("got %v; want [folders-level-1-level-2-deep-note]", got)
		}
	})

	t.Run("unresolved link dropped", func(t *testing.T) {
		got := resolveLinks([]string{"Nonexistent Note"}, titleToID, lowerTitleToID)
		if len(got) != 0 {
			t.Errorf("expected empty slice, got %v", got)
		}
	})

	t.Run("deduplication", func(t *testing.T) {
		got := resolveLinks([]string{"Welcome", "Welcome"}, titleToID, lowerTitleToID)
		if len(got) != 1 {
			t.Errorf("expected 1 result after dedup, got %d: %v", len(got), got)
		}
	})

	t.Run("empty input", func(t *testing.T) {
		got := resolveLinks(nil, titleToID, lowerTitleToID)
		if len(got) != 0 {
			t.Errorf("expected empty, got %v", got)
		}
	})
}

// ── stripMarkdown ─────────────────────────────────────────────────────────────

func TestStripMarkdown(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string // should be contained in output (trimmed)
	}{
		{
			"bold stripped",
			"**bold text** here",
			"bold text here",
		},
		{
			"italic stripped",
			"*italic* word",
			"italic word",
		},
		{
			"heading prefix stripped",
			"## My Heading",
			"My Heading",
		},
		{
			"wikilink display text kept",
			"[[Note Title|Display Text]]",
			"Display Text",
		},
		{
			"wikilink plain title kept",
			"[[Note Title]]",
			"Note Title",
		},
		{
			"inline code stripped",
			"Use `code` here",
			"Use here",
		},
		{
			"markdown link text kept",
			"[click here](https://example.com)",
			"click here",
		},
		{
			"html tags stripped",
			"<span>hello</span>",
			"hello",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := stripMarkdown(c.in)
			if got != c.want {
				t.Errorf("stripMarkdown(%q)\n  got:  %q\n  want: %q", c.in, got, c.want)
			}
		})
	}

	t.Run("fenced code block stripped", func(t *testing.T) {
		in := "```go\nfunc main() {}\n```"
		got := stripMarkdown(in)
		if got == "" {
			return // acceptable: block fully stripped
		}
		// should not contain code keywords
		if got == "func main() {}" {
			t.Errorf("fenced code block content should be stripped, got %q", got)
		}
	})
}

// ── buildFolders ──────────────────────────────────────────────────────────────

func TestBuildFolders(t *testing.T) {
	notes := []Note{
		{ID: "a", Folder: "Animals"},
		{ID: "b", Folder: "Animals"},
		{ID: "c", Folder: "Animals/Mammals"},
		{ID: "d", Folder: ""},
	}
	folders := buildFolders(notes)

	byPath := map[string]*Folder{}
	for i := range folders {
		byPath[folders[i].Path] = &folders[i]
	}

	t.Run("animals folder exists", func(t *testing.T) {
		f, ok := byPath["Animals"]
		if !ok {
			t.Fatal("Animals folder not found")
		}
		if f.Parent != "" {
			t.Errorf("Animals parent should be empty, got %q", f.Parent)
		}
	})

	t.Run("mammals folder exists with correct parent", func(t *testing.T) {
		f, ok := byPath["Animals/Mammals"]
		if !ok {
			t.Fatal("Animals/Mammals folder not found")
		}
		if f.Parent != "Animals" {
			t.Errorf("Mammals parent = %q; want Animals", f.Parent)
		}
	})

	t.Run("animals has mammals as child", func(t *testing.T) {
		f := byPath["Animals"]
		found := false
		for _, ch := range f.Children {
			if ch == "Animals/Mammals" {
				found = true
			}
		}
		if !found {
			t.Errorf("Animals.Children = %v; expected Animals/Mammals", f.Children)
		}
	})

	t.Run("notes in correct folders", func(t *testing.T) {
		f := byPath["Animals"]
		noteIDs := map[string]bool{}
		for _, n := range f.Notes {
			noteIDs[n] = true
		}
		if !noteIDs["a"] || !noteIDs["b"] {
			t.Errorf("Animals notes = %v; expected a and b", f.Notes)
		}
		if noteIDs["c"] {
			t.Errorf("note c should be in Mammals, not Animals")
		}
	})

	t.Run("root note not in any folder", func(t *testing.T) {
		for _, f := range folders {
			for _, n := range f.Notes {
				if n == "d" {
					t.Errorf("root note d should not appear in folder %q", f.Path)
				}
			}
		}
	})
}

// ── FilterVaultData ───────────────────────────────────────────────────────────

func TestFilterVaultData(t *testing.T) {
	data := &VaultData{
		Name: "test",
		Notes: []Note{
			{ID: "a", Path: "A.md", Folder: "", Links: []string{"b"}, Backlinks: []string{}, Tags: []string{}},
			{ID: "b", Path: "B.md", Folder: "", Links: []string{}, Backlinks: []string{"a"}, Tags: []string{}},
			{ID: "c", Path: "Sub/C.md", Folder: "Sub", Links: []string{"a"}, Backlinks: []string{}, Tags: []string{}},
		},
		Edges: []Edge{
			{Source: "a", Target: "b"},
			{Source: "c", Target: "a"},
		},
		Tags:        []string{},
		Attachments: map[string]string{},
	}
	data.Folders = buildFolders(data.Notes)

	t.Run("no filter returns original", func(t *testing.T) {
		got := FilterVaultData(data, nil)
		if len(got.Notes) != 3 {
			t.Errorf("expected 3 notes, got %d", len(got.Notes))
		}
	})

	t.Run("filter to single file", func(t *testing.T) {
		got := FilterVaultData(data, []string{"A.md"})
		if len(got.Notes) != 1 || got.Notes[0].ID != "a" {
			t.Errorf("expected only note a, got %v", got.Notes)
		}
		if len(got.Edges) != 0 {
			t.Errorf("edges should be empty when target not included, got %v", got.Edges)
		}
	})

	t.Run("filter to folder includes all notes inside", func(t *testing.T) {
		got := FilterVaultData(data, []string{"Sub"})
		if len(got.Notes) != 1 || got.Notes[0].ID != "c" {
			t.Errorf("expected only note c, got %v", got.Notes)
		}
	})

	t.Run("backlinks pruned to included notes only", func(t *testing.T) {
		// Include only a and b; c links to a but c is excluded
		got := FilterVaultData(data, []string{"A.md", "B.md"})
		noteMap := map[string]*Note{}
		for i := range got.Notes {
			noteMap[got.Notes[i].ID] = &got.Notes[i]
		}
		// a's backlinks from c should be gone (c excluded)
		aBL := noteMap["a"].Backlinks
		for _, bl := range aBL {
			if bl == "c" {
				t.Errorf("note a should not have backlink from c (c excluded)")
			}
		}
	})
}

// ── ParseVault integration ────────────────────────────────────────────────────

func TestParseVaultIntegration(t *testing.T) {
	// Locate the test vault relative to this package
	vaultPath := filepath.Join("..", "..", "data", "test")
	if _, err := os.Stat(vaultPath); os.IsNotExist(err) {
		t.Skip("test vault not found at", vaultPath)
	}

	data, err := ParseVault(vaultPath)
	if err != nil {
		t.Fatalf("ParseVault failed: %v", err)
	}

	t.Run("at least 15 notes parsed", func(t *testing.T) {
		if len(data.Notes) < 15 {
			t.Errorf("expected ≥15 notes, got %d", len(data.Notes))
		}
	})

	t.Run("edges exist between linked notes", func(t *testing.T) {
		if len(data.Edges) == 0 {
			t.Error("expected at least some edges, got 0")
		}
	})

	t.Run("folders built", func(t *testing.T) {
		if len(data.Folders) == 0 {
			t.Error("expected at least one folder")
		}
	})

	t.Run("no note has nil slices", func(t *testing.T) {
		for _, n := range data.Notes {
			if n.Links == nil {
				t.Errorf("note %s has nil Links", n.ID)
			}
			if n.Backlinks == nil {
				t.Errorf("note %s has nil Backlinks", n.ID)
			}
			if n.Tags == nil {
				t.Errorf("note %s has nil Tags", n.ID)
			}
			if n.Headers == nil {
				t.Errorf("note %s has nil Headers", n.ID)
			}
		}
	})

	t.Run("IDs are unique", func(t *testing.T) {
		seen := map[string]bool{}
		for _, n := range data.Notes {
			if seen[n.ID] {
				t.Errorf("duplicate note ID: %s", n.ID)
			}
			seen[n.ID] = true
		}
	})

	t.Run("backlinks are consistent with edges", func(t *testing.T) {
		// Every edge source should be in the target's backlinks
		backlinkMap := map[string]map[string]bool{}
		for _, n := range data.Notes {
			m := map[string]bool{}
			for _, bl := range n.Backlinks {
				m[bl] = true
			}
			backlinkMap[n.ID] = m
		}
		for _, e := range data.Edges {
			if !backlinkMap[e.Target][e.Source] {
				t.Errorf("edge %s→%s: %s not in %s.Backlinks", e.Source, e.Target, e.Source, e.Target)
			}
		}
	})
}

// ── parseNote ─────────────────────────────────────────────────────────────────

// writeNote writes content to a relative path under dir and returns the absolute path.
func writeNote(t *testing.T, dir, rel, content string) string {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestParseNote(t *testing.T) {
	dir := t.TempDir()

	t.Run("basic note without frontmatter", func(t *testing.T) {
		p := writeNote(t, dir, "Simple Note.md", "# Hello\n\nSome text.\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if n.ID != "simple-note" {
			t.Errorf("ID = %q", n.ID)
		}
		if n.Title != "Simple Note" {
			t.Errorf("Title = %q; want filename-derived title", n.Title)
		}
		if n.Folder != "" {
			t.Errorf("Folder = %q; want empty for root note", n.Folder)
		}
		if len(n.Aliases) != 0 {
			t.Errorf("Aliases = %v; want empty", n.Aliases)
		}
		if n.Modified == "" || n.Created == "" {
			t.Error("Modified/Created should be populated from file modtime")
		}
	})

	t.Run("frontmatter title override", func(t *testing.T) {
		p := writeNote(t, dir, "fm-title.md", "---\ntitle: Custom Title\n---\n\nBody.\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if n.Title != "Custom Title" {
			t.Errorf("Title = %q; want Custom Title", n.Title)
		}
	})

	t.Run("aliases as list and string", func(t *testing.T) {
		p := writeNote(t, dir, "alias-list.md", "---\naliases:\n  - First Alias\n  - Second Alias\n---\nBody.\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(n.Aliases) != 2 || n.Aliases[0] != "First Alias" || n.Aliases[1] != "Second Alias" {
			t.Errorf("Aliases = %v", n.Aliases)
		}

		p = writeNote(t, dir, "alias-str.md", "---\naliases: Only One\n---\nBody.\n")
		n, err = parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(n.Aliases) != 1 || n.Aliases[0] != "Only One" {
			t.Errorf("Aliases = %v", n.Aliases)
		}
	})

	t.Run("tags from frontmatter list, string, and inline are merged and deduped", func(t *testing.T) {
		content := "---\ntags:\n  - alpha\n  - \"#beta\"\n---\n\nInline #alpha and #gamma plus #nested/tag here.\n"
		p := writeNote(t, dir, "tags.md", content)
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"alpha", "beta", "gamma", "nested/tag"}
		if len(n.Tags) != len(want) {
			t.Fatalf("Tags = %v; want %v", n.Tags, want)
		}
		for i, w := range want {
			if n.Tags[i] != w {
				t.Errorf("Tags[%d] = %q; want %q", i, n.Tags[i], w)
			}
		}

		p = writeNote(t, dir, "tags-str.md", "---\ntags: solo\n---\nBody.\n")
		n, err = parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(n.Tags) != 1 || n.Tags[0] != "solo" {
			t.Errorf("Tags = %v; want [solo]", n.Tags)
		}
	})

	t.Run("headers extracted with levels and slugs, code fences ignored", func(t *testing.T) {
		content := "# Top\n\n## Sub Section!\n\n```bash\n# not a heading\necho hi\n```\n\n### Deep One\n"
		p := writeNote(t, dir, "headers.md", content)
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(n.Headers) != 3 {
			t.Fatalf("Headers = %+v; want 3 headers", n.Headers)
		}
		checks := []Header{
			{Level: 1, Text: "Top", Slug: "top"},
			{Level: 2, Text: "Sub Section!", Slug: "sub-section"},
			{Level: 3, Text: "Deep One", Slug: "deep-one"},
		}
		for i, w := range checks {
			if n.Headers[i] != w {
				t.Errorf("Headers[%d] = %+v; want %+v", i, n.Headers[i], w)
			}
		}
	})

	t.Run("wikilinks extracted with anchors and aliases stripped, deduped", func(t *testing.T) {
		content := "See [[Target]], [[Target|alias]], [[Target#Section]], [[Other Note#A|B]], and [[#Self Anchor]].\n"
		p := writeNote(t, dir, "links.md", content)
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"Target", "Other Note"}
		if len(n.Links) != len(want) {
			t.Fatalf("Links = %v; want %v", n.Links, want)
		}
		for i, w := range want {
			if n.Links[i] != w {
				t.Errorf("Links[%d] = %q; want %q", i, n.Links[i], w)
			}
		}
	})

	t.Run("created date from frontmatter", func(t *testing.T) {
		p := writeNote(t, dir, "dated.md", "---\ncreated: 2024-01-15\n---\nBody.\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if n.Created != "2024-01-15T00:00:00Z" {
			t.Errorf("Created = %q; want 2024-01-15T00:00:00Z", n.Created)
		}
	})

	t.Run("subfolder note gets folder and path-derived ID", func(t *testing.T) {
		p := writeNote(t, dir, "Sub Folder/Nested Note.md", "Body.\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if n.Folder != "Sub Folder" {
			t.Errorf("Folder = %q", n.Folder)
		}
		if n.ID != "sub-folder-nested-note" {
			t.Errorf("ID = %q", n.ID)
		}
		if n.Path != "Sub Folder/Nested Note.md" {
			t.Errorf("Path = %q", n.Path)
		}
	})

	t.Run("plainText strips markdown", func(t *testing.T) {
		p := writeNote(t, dir, "plain.md", "---\ntitle: X\n---\n# Heading\n\n**Bold** and [[Linked Note]].\n")
		n, err := parseNote(p, dir)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(n.PlainText, "**") || strings.Contains(n.PlainText, "[[") {
			t.Errorf("PlainText still contains markdown: %q", n.PlainText)
		}
		for _, want := range []string{"Heading", "Bold", "Linked Note"} {
			if !strings.Contains(n.PlainText, want) {
				t.Errorf("PlainText missing %q: %q", want, n.PlainText)
			}
		}
	})
}

// ── parseFrontmatterDate ──────────────────────────────────────────────────────

func TestParseFrontmatterDate(t *testing.T) {
	const fallback = "2000-01-01T00:00:00Z"
	cases := []struct {
		name string
		fm   map[string]interface{}
		want string
	}{
		{"date string YYYY-MM-DD", map[string]interface{}{"date": "2024-03-20"}, "2024-03-20T00:00:00Z"},
		{"created string RFC3339", map[string]interface{}{"created": "2024-03-20T10:30:00Z"}, "2024-03-20T10:30:00Z"},
		{"created_at datetime", map[string]interface{}{"created_at": "2024-03-20 10:30:00"}, "2024-03-20T10:30:00Z"},
		{"time.Time value", map[string]interface{}{"created": time.Date(2023, 6, 1, 12, 0, 0, 0, time.UTC)}, "2023-06-01T12:00:00Z"},
		{"date has priority over created", map[string]interface{}{"date": "2024-01-01", "created": "2020-01-01"}, "2024-01-01T00:00:00Z"},
		{"unparseable falls back", map[string]interface{}{"date": "not a date"}, fallback},
		{"empty string falls back", map[string]interface{}{"date": ""}, fallback},
		{"missing keys fall back", map[string]interface{}{}, fallback},
		{"nil value falls back", map[string]interface{}{"date": nil}, fallback},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := parseFrontmatterDate(c.fm, fallback); got != c.want {
				t.Errorf("got %q; want %q", got, c.want)
			}
		})
	}
}

// ── matchesAnyInclude ─────────────────────────────────────────────────────────

func TestMatchesAnyInclude(t *testing.T) {
	cases := []struct {
		path     string
		includes []string
		want     bool
	}{
		{"Notes/Foo.md", []string{"Notes"}, true},
		{"Notes/Foo.md", []string{"Notes/Foo.md"}, true},
		{"Notes/Foo.md", []string{"Notes/Foo"}, true}, // extension optional
		{"Notes/Sub/Bar.md", []string{"Notes"}, true},
		{"NotesExtra/Foo.md", []string{"Notes"}, false}, // prefix must be a path segment
		{"Other/Foo.md", []string{"Notes"}, false},
		{"Foo.md", []string{"Foo.md"}, true},
		{"Foo.md", []string{"Bar.md", "Foo"}, true},
	}
	for _, c := range cases {
		if got := matchesAnyInclude(c.path, c.includes); got != c.want {
			t.Errorf("matchesAnyInclude(%q, %v) = %v; want %v", c.path, c.includes, got, c.want)
		}
	}
}

// ── ParseVault edge cases ─────────────────────────────────────────────────────

func TestParseVaultErrors(t *testing.T) {
	t.Run("nonexistent path", func(t *testing.T) {
		if _, err := ParseVault(filepath.Join(t.TempDir(), "missing")); err == nil {
			t.Error("expected error for nonexistent path")
		}
	})

	t.Run("file instead of directory", func(t *testing.T) {
		f := writeNote(t, t.TempDir(), "file.md", "x")
		if _, err := ParseVault(f); err == nil {
			t.Error("expected error for non-directory vault path")
		}
	})
}

func TestParseVaultSkipsHiddenDirs(t *testing.T) {
	dir := t.TempDir()
	writeNote(t, dir, "Visible.md", "# Visible\n")
	writeNote(t, dir, ".obsidian/Hidden.md", "# Hidden\n")
	writeNote(t, dir, ".trash/Deleted.md", "# Deleted\n")

	data, err := ParseVault(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Notes) != 1 || data.Notes[0].ID != "visible" {
		t.Errorf("Notes = %+v; hidden dirs should be skipped", data.Notes)
	}
}

func TestParseVaultCollectsAttachments(t *testing.T) {
	dir := t.TempDir()
	writeNote(t, dir, "Note.md", "![[Diagram.PNG]]\n")
	writeNote(t, dir, "assets/Diagram.PNG", "png-bytes")
	writeNote(t, dir, "assets/script.sh", "#!/bin/sh") // not an attachment type

	data, err := ParseVault(dir)
	if err != nil {
		t.Fatal(err)
	}
	// Keyed by lowercase basename, value is the vault-relative slash path
	if got := data.Attachments["diagram.png"]; got != "assets/Diagram.PNG" {
		t.Errorf("Attachments[diagram.png] = %q; want assets/Diagram.PNG", got)
	}
	if len(data.Attachments) != 1 {
		t.Errorf("Attachments = %v; want exactly 1", data.Attachments)
	}
}

func TestParseVaultAliasResolution(t *testing.T) {
	dir := t.TempDir()
	writeNote(t, dir, "Target.md", "---\naliases:\n  - My Nickname\n---\n# Target\n")
	writeNote(t, dir, "Source.md", "Link via alias: [[My Nickname]] and lowercase [[my nickname]].\n")

	data, err := ParseVault(dir)
	if err != nil {
		t.Fatal(err)
	}
	var source *Note
	for i := range data.Notes {
		if data.Notes[i].ID == "source" {
			source = &data.Notes[i]
		}
	}
	if source == nil {
		t.Fatal("source note not found")
	}
	if len(source.Links) != 1 || source.Links[0] != "target" {
		t.Errorf("Links = %v; want [target] resolved via alias", source.Links)
	}
}

// ── ParseVault against the example vault (data/test) ──────────────────────────

func TestParseVaultExampleVaultContent(t *testing.T) {
	vaultPath := filepath.Join("..", "..", "data", "test")
	if _, err := os.Stat(vaultPath); os.IsNotExist(err) {
		t.Skip("test vault not found at", vaultPath)
	}
	data, err := ParseVault(vaultPath)
	if err != nil {
		t.Fatalf("ParseVault failed: %v", err)
	}

	noteByID := map[string]*Note{}
	for i := range data.Notes {
		noteByID[data.Notes[i].ID] = &data.Notes[i]
	}
	mustNote := func(id string) *Note {
		t.Helper()
		n, ok := noteByID[id]
		if !ok {
			t.Fatalf("note %q not found in example vault", id)
		}
		return n
	}

	t.Run("welcome note parsed with frontmatter tags and links", func(t *testing.T) {
		w := mustNote("welcome")
		if w.Title != "Welcome" {
			t.Errorf("Title = %q", w.Title)
		}
		wantTags := map[string]bool{"getting-started": true, "obsidianator": true}
		for tag := range wantTags {
			found := false
			for _, got := range w.Tags {
				if got == tag {
					found = true
				}
			}
			if !found {
				t.Errorf("welcome missing tag %q (got %v)", tag, w.Tags)
			}
		}
		hasLink := false
		for _, l := range w.Links {
			if l == "getting-started" {
				hasLink = true
			}
		}
		if !hasLink {
			t.Errorf("welcome should link to getting-started, got %v", w.Links)
		}
	})

	t.Run("wikilinks note resolves links across folders and case", func(t *testing.T) {
		wl := mustNote("links-wikilinks")
		want := []string{"welcome", "formatting-basic-formatting", "formatting-code-blocks", "folders-level-1-level-2-deep-note"}
		linkSet := map[string]int{}
		for _, l := range wl.Links {
			linkSet[l]++
		}
		for _, w := range want {
			if linkSet[w] == 0 {
				t.Errorf("links-wikilinks missing resolved link %q (got %v)", w, wl.Links)
			}
		}
		// [[Welcome]], [[welcome]], [[WELCOME]], [[Welcome|Start here]] must all
		// collapse into a single resolved link.
		if linkSet["welcome"] > 1 {
			t.Errorf("welcome resolved %d times; want deduplication", linkSet["welcome"])
		}
		// Broken links must be dropped entirely
		for id := range linkSet {
			if strings.Contains(id, "does-not-exist") || strings.Contains(id, "also-missing") {
				t.Errorf("broken link %q should not resolve", id)
			}
		}
	})

	t.Run("orphan note has no outgoing links except hub backlink", func(t *testing.T) {
		orphan := mustNote("graph-orphan-note")
		// Orphan links to [[Hub Note]] in its body, which resolves
		for _, bl := range orphan.Backlinks {
			if bl != "graph-hub-note" {
				t.Errorf("unexpected backlink %q on orphan note", bl)
			}
		}
		hasHubBacklink := false
		for _, bl := range orphan.Backlinks {
			if bl == "graph-hub-note" {
				hasHubBacklink = true
			}
		}
		if !hasHubBacklink {
			t.Errorf("orphan note should have backlink from hub note, got %v", orphan.Backlinks)
		}
	})

	t.Run("hub note has high out-degree", func(t *testing.T) {
		hub := mustNote("graph-hub-note")
		if len(hub.Links) < 10 {
			t.Errorf("hub note should link to most of the vault, got %d links", len(hub.Links))
		}
	})

	t.Run("frontmatter note exposes aliases, created date, and metadata", func(t *testing.T) {
		fm := mustNote("obsidian-frontmatter")
		if fm.Title != "Frontmatter" {
			t.Errorf("Title = %q", fm.Title)
		}
		foundAlias := false
		for _, a := range fm.Aliases {
			if a == "YAML frontmatter" {
				foundAlias = true
			}
		}
		if !foundAlias {
			t.Errorf("Aliases = %v; want YAML frontmatter", fm.Aliases)
		}
		if !strings.HasPrefix(fm.Created, "2024-01-15") {
			t.Errorf("Created = %q; want 2024-01-15 from frontmatter", fm.Created)
		}
		if fm.Frontmatter["author"] != "Fx64b" {
			t.Errorf("Frontmatter[author] = %v", fm.Frontmatter["author"])
		}
	})

	t.Run("deeply nested folders all created with correct parents", func(t *testing.T) {
		byPath := map[string]*Folder{}
		for i := range data.Folders {
			byPath[data.Folders[i].Path] = &data.Folders[i]
		}
		l2, ok := byPath["Folders/Level 1/Level 2"]
		if !ok {
			t.Fatal("Folders/Level 1/Level 2 not found")
		}
		if l2.Parent != "Folders/Level 1" {
			t.Errorf("Level 2 parent = %q", l2.Parent)
		}
		l1, ok := byPath["Folders/Level 1"]
		if !ok {
			t.Fatal("Folders/Level 1 not found")
		}
		if l1.Parent != "Folders" {
			t.Errorf("Level 1 parent = %q", l1.Parent)
		}
		hasDeepNote := false
		for _, id := range l2.Notes {
			if id == "folders-level-1-level-2-deep-note" {
				hasDeepNote = true
			}
		}
		if !hasDeepNote {
			t.Errorf("Level 2 notes = %v; want deep note", l2.Notes)
		}
	})

	t.Run("inline and nested tags collected globally", func(t *testing.T) {
		tagSet := map[string]bool{}
		for _, tag := range data.Tags {
			tagSet[tag] = true
		}
		for _, want := range []string{"inline-tag", "test/nested", "obsidian"} {
			if !tagSet[want] {
				t.Errorf("global tags missing %q", want)
			}
		}
	})

	t.Run("headers extracted with slugs", func(t *testing.T) {
		w := mustNote("welcome")
		found := false
		for _, h := range w.Headers {
			if h.Text == "What it does" && h.Level == 2 && h.Slug == "what-it-does" {
				found = true
			}
		}
		if !found {
			t.Errorf("welcome headers = %+v; want level-2 'What it does'", w.Headers)
		}
	})

	t.Run("include filter on example vault", func(t *testing.T) {
		filtered := FilterVaultData(data, []string{"Graph"})
		if len(filtered.Notes) != 2 {
			t.Errorf("expected 2 Graph notes, got %d", len(filtered.Notes))
		}
		// Hub note's links to excluded notes must be pruned
		for _, n := range filtered.Notes {
			for _, l := range n.Links {
				if l != "graph-hub-note" && l != "graph-orphan-note" {
					t.Errorf("filtered note %s still links to excluded %s", n.ID, l)
				}
			}
		}
	})
}
