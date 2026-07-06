package vault

import "testing"

func publishNote(id, title string, publish interface{}, content string, links []string) Note {
	fm := map[string]interface{}{}
	if publish != nil {
		fm["publish"] = publish
	}
	return Note{
		ID:          id,
		Title:       title,
		Content:     content,
		Frontmatter: fm,
		Links:       links,
		Backlinks:   []string{},
		Tags:        []string{},
		Aliases:     []string{},
		Headers:     []Header{},
	}
}

func TestIsPublished(t *testing.T) {
	cases := []struct {
		name  string
		value interface{}
		want  bool
	}{
		{"bool true", true, true},
		{"bool false", false, false},
		{"string true", "true", true},
		{"string TRUE", "TRUE", true},
		{"string yes", "yes", true},
		{"string no", "no", false},
		{"number", 1, false},
		{"missing", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			n := publishNote("a", "A", tc.value, "", nil)
			if tc.value == nil {
				n.Frontmatter = map[string]interface{}{}
			}
			if got := IsPublished(&n); got != tc.want {
				t.Errorf("IsPublished(%v) = %v; want %v", tc.value, got, tc.want)
			}
		})
	}
}

func TestFilterPublished(t *testing.T) {
	data := &VaultData{
		Name: "v",
		Notes: []Note{
			publishNote("pub-a", "Pub A", true, "Links to [[Secret]] and ![[photo.png]]", []string{"secret", "pub-b"}),
			publishNote("pub-b", "Pub B", "true", "Body", []string{"pub-a"}),
			publishNote("secret", "Secret", nil, "Private ![[private.pdf]]", []string{"pub-a"}),
		},
		Tags: []string{"x"},
		Edges: []Edge{
			{Source: "pub-a", Target: "secret"},
			{Source: "pub-a", Target: "pub-b"},
			{Source: "secret", Target: "pub-a"},
		},
		Attachments: map[string]string{
			"photo.png":   "assets/Photo.png",
			"private.pdf": "docs/Private.pdf",
		},
	}
	got := FilterPublished(data)

	t.Run("keeps only published notes", func(t *testing.T) {
		if len(got.Notes) != 2 {
			t.Fatalf("expected 2 notes, got %d", len(got.Notes))
		}
		for _, n := range got.Notes {
			if n.ID == "secret" {
				t.Error("unpublished note leaked")
			}
		}
	})

	t.Run("strips edges touching unpublished notes", func(t *testing.T) {
		if len(got.Edges) != 1 || got.Edges[0].Target != "pub-b" {
			t.Errorf("edges = %v; want only pub-a→pub-b", got.Edges)
		}
	})

	t.Run("strips links and backlinks to unpublished notes", func(t *testing.T) {
		for _, n := range got.Notes {
			for _, l := range append(append([]string{}, n.Links...), n.Backlinks...) {
				if l == "secret" {
					t.Errorf("note %s still references secret", n.ID)
				}
			}
		}
	})

	t.Run("keeps only attachments referenced by published content", func(t *testing.T) {
		if _, ok := got.Attachments["photo.png"]; !ok {
			t.Error("photo.png should be kept (referenced by pub-a)")
		}
		if _, ok := got.Attachments["private.pdf"]; ok {
			t.Error("private.pdf leaked (only referenced by unpublished note)")
		}
	})

	t.Run("empty vault when nothing is published", func(t *testing.T) {
		empty := FilterPublished(&VaultData{Notes: []Note{publishNote("a", "A", false, "", nil)}})
		if len(empty.Notes) != 0 || empty.Notes == nil {
			t.Errorf("expected empty non-nil notes, got %v", empty.Notes)
		}
	})
}
