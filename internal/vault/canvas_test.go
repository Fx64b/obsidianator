package vault

import (
	"os"
	"path/filepath"
	"testing"
)

const sampleCanvas = `{
  "nodes": [
    {"id":"n1","type":"text","x":0,"y":0,"width":200,"height":100,"text":"# Hello\n\nSome **text** node.","color":"4"},
    {"id":"n2","type":"file","x":300,"y":0,"width":250,"height":120,"file":"Sub/Note Two.md"},
    {"id":"n3","type":"link","x":0,"y":200,"width":200,"height":80,"url":"https://obsidian.md"},
    {"id":"n4","type":"file","x":300,"y":200,"width":200,"height":150,"file":"Sub/image.png"},
    {"id":"g1","type":"group","x":-20,"y":-20,"width":600,"height":400,"label":"My Group"}
  ],
  "edges": [
    {"id":"e1","fromNode":"n1","fromSide":"right","toNode":"n2","toSide":"left","toEnd":"arrow","label":"links"},
    {"id":"e2","fromNode":"n3","toNode":"n4"}
  ]
}`

func writeCanvasVault(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write := func(rel, content string) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	write("Sub/Note Two.md", "# Note Two\n\nBody.\n")
	write("Sub/image.png", "fake-png")
	write("Board.canvas", sampleCanvas)
	return dir
}

func TestParseCanvasIntegration(t *testing.T) {
	dir := writeCanvasVault(t)
	data, err := ParseVault(dir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}
	if len(data.Canvases) != 1 {
		t.Fatalf("expected 1 canvas, got %d", len(data.Canvases))
	}
	c := data.Canvases[0]

	t.Run("metadata derived from path", func(t *testing.T) {
		if c.Name != "Board" {
			t.Errorf("Name = %q", c.Name)
		}
		if c.ID != "board" {
			t.Errorf("ID = %q", c.ID)
		}
		if c.Path != "Board.canvas" {
			t.Errorf("Path = %q", c.Path)
		}
	})

	t.Run("nodes and edges decoded", func(t *testing.T) {
		if len(c.Nodes) != 5 {
			t.Fatalf("expected 5 nodes, got %d", len(c.Nodes))
		}
		if len(c.Edges) != 2 {
			t.Fatalf("expected 2 edges, got %d", len(c.Edges))
		}
		if c.Edges[0].Label != "links" || c.Edges[0].ToEnd != "arrow" {
			t.Errorf("edge fields not decoded: %+v", c.Edges[0])
		}
	})

	t.Run("file node resolved to note id", func(t *testing.T) {
		var fileNode *CanvasNode
		for i := range c.Nodes {
			if c.Nodes[i].ID == "n2" {
				fileNode = &c.Nodes[i]
			}
		}
		if fileNode == nil {
			t.Fatal("n2 missing")
		}
		if fileNode.NoteID != "sub-note-two" {
			t.Errorf("NoteID = %q; want sub-note-two", fileNode.NoteID)
		}
	})

	t.Run("image file node left unresolved", func(t *testing.T) {
		for _, n := range c.Nodes {
			if n.ID == "n4" && n.NoteID != "" {
				t.Errorf("image node should have empty NoteID, got %q", n.NoteID)
			}
		}
	})
}

func TestParseCanvasEmptyFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Empty.canvas"), []byte(""), 0644); err != nil {
		t.Fatal(err)
	}
	data, err := ParseVault(dir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}
	if len(data.Canvases) != 1 {
		t.Fatalf("expected 1 canvas, got %d", len(data.Canvases))
	}
	if data.Canvases[0].Nodes == nil || data.Canvases[0].Edges == nil {
		t.Error("empty canvas should have non-nil nodes/edges slices")
	}
}

func TestParseCanvasInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Bad.canvas"), []byte("{not json"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseVault(dir); err == nil {
		t.Error("expected error for invalid canvas JSON")
	}
}

func TestFilterCanvasesDropsUnpublishedFileNodes(t *testing.T) {
	canvases := []Canvas{
		{
			ID:   "board",
			Path: "Board.canvas",
			Nodes: []CanvasNode{
				{ID: "a", Type: "text", Text: "hi"},
				{ID: "b", Type: "file", File: "Secret.md", NoteID: "secret"},
				{ID: "c", Type: "file", File: "Pub.md", NoteID: "pub"},
			},
			Edges: []CanvasEdge{
				{ID: "e1", FromNode: "a", ToNode: "b"}, // touches dropped node
				{ID: "e2", FromNode: "a", ToNode: "c"}, // survives
			},
		},
	}
	noteSet := map[string]struct{}{"pub": {}}
	out := filterCanvases(canvases, noteSet, nil)

	if len(out) != 1 {
		t.Fatalf("expected canvas kept, got %d", len(out))
	}
	if len(out[0].Nodes) != 2 {
		t.Errorf("expected secret node dropped, nodes = %d", len(out[0].Nodes))
	}
	for _, n := range out[0].Nodes {
		if n.ID == "b" {
			t.Error("unpublished file node leaked")
		}
	}
	if len(out[0].Edges) != 1 || out[0].Edges[0].ID != "e2" {
		t.Errorf("edge touching dropped node should be removed: %+v", out[0].Edges)
	}
}

func TestFilterCanvasesDropsEmptyCanvas(t *testing.T) {
	canvases := []Canvas{
		{ID: "x", Nodes: []CanvasNode{{ID: "a", Type: "file", NoteID: "gone"}}},
	}
	out := filterCanvases(canvases, map[string]struct{}{}, nil)
	if len(out) != 0 {
		t.Errorf("canvas with only dropped nodes should be removed, got %d", len(out))
	}
}
