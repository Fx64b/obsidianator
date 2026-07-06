package vault

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// parseCanvas reads and decodes a .canvas file. ID/Name/Path/Folder are
// derived from the file location; node/edge data comes from the JSON Canvas
// document. NoteIDs for file nodes are resolved later (see resolveCanvasNotes)
// once the full note set is known.
func parseCanvas(path, vaultPath string) (*Canvas, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var c Canvas
	// An empty .canvas file is valid in Obsidian; treat it as a blank canvas
	// rather than a parse error.
	if len(strings.TrimSpace(string(raw))) > 0 {
		if err := json.Unmarshal(raw, &c); err != nil {
			return nil, fmt.Errorf("invalid canvas JSON: %w", err)
		}
	}

	relPath, _ := filepath.Rel(vaultPath, path)
	relPath = filepath.ToSlash(relPath)
	c.Path = relPath
	c.ID = pathToID(strings.TrimSuffix(relPath, ".canvas"))
	c.Name = strings.TrimSuffix(filepath.Base(path), ".canvas")
	folder := filepath.ToSlash(filepath.Dir(relPath))
	if folder == "." {
		folder = ""
	}
	c.Folder = folder

	if c.Nodes == nil {
		c.Nodes = []CanvasNode{}
	}
	if c.Edges == nil {
		c.Edges = []CanvasEdge{}
	}
	return &c, nil
}

// resolveCanvasNotes fills in NoteID for every file node that points at a
// markdown note present in noteIDs. Non-markdown file nodes (images, PDFs)
// and links to missing notes are left with an empty NoteID.
func resolveCanvasNotes(canvases []Canvas, noteIDs map[string]struct{}) {
	for ci := range canvases {
		for ni := range canvases[ci].Nodes {
			n := &canvases[ci].Nodes[ni]
			if n.Type != "file" || n.File == "" {
				continue
			}
			if strings.ToLower(filepath.Ext(n.File)) != ".md" {
				continue
			}
			id := pathToID(strings.TrimSuffix(filepath.ToSlash(n.File), ".md"))
			if _, ok := noteIDs[id]; ok {
				n.NoteID = id
			}
		}
	}
}

// filterCanvases reconstructs the canvas list for a filtered note subset:
//   - file nodes whose resolved NoteID is no longer in noteSet are dropped
//     (along with any edges touching them) so excluded notes never leak via a
//     canvas — even just their path or title
//   - canvases left without any nodes are removed entirely
//
// keepCanvas decides, before node-level pruning, whether a canvas is in scope
// at all (used by the include filter to match canvas paths). A nil keepCanvas
// keeps every canvas.
func filterCanvases(canvases []Canvas, noteSet map[string]struct{}, keepCanvas func(Canvas) bool) []Canvas {
	out := []Canvas{}
	for _, c := range canvases {
		if keepCanvas != nil && !keepCanvas(c) {
			continue
		}

		dropped := map[string]struct{}{}
		nodes := make([]CanvasNode, 0, len(c.Nodes))
		for _, n := range c.Nodes {
			if n.Type == "file" && n.NoteID != "" {
				if _, ok := noteSet[n.NoteID]; !ok {
					dropped[n.ID] = struct{}{}
					continue
				}
			}
			nodes = append(nodes, n)
		}

		edges := make([]CanvasEdge, 0, len(c.Edges))
		for _, e := range c.Edges {
			if _, ok := dropped[e.FromNode]; ok {
				continue
			}
			if _, ok := dropped[e.ToNode]; ok {
				continue
			}
			edges = append(edges, e)
		}

		if len(nodes) == 0 {
			continue
		}
		c.Nodes = nodes
		c.Edges = edges
		out = append(out, c)
	}
	return out
}
