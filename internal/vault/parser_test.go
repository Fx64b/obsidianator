package vault

import (
	"os"
	"path/filepath"
	"testing"
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
