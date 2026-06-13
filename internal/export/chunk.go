package export

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Fx64b/obsidianator/internal/vault"
)

// noteChunk is the per-note payload fetched on demand in chunked mode: just
// the heavy fields the index omits.
type noteChunk struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	PlainText string `json:"plainText"`
}

// searchEntry is one record in the lazily-loaded full-text search index.
type searchEntry struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	PlainText string `json:"plainText"`
}

// writeChunkedData writes the chunked representation of a vault:
//   - vault-data.json: a metadata-only index (every note keeps its structure —
//     title, links, tags, headers, dates — but Content/PlainText are blanked),
//     flagged chunked:true so the frontend knows to fetch content lazily
//   - notes/<id>.json: the content + plainText for one note, fetched when that
//     note (or a transclusion/preview of it) is shown
//   - search-index.json: id/title/plainText for every note, loaded on first
//     search so the index itself stays small
//
// This lets large vaults become interactive (sidebar, graph, title search,
// canvases) as soon as the small index loads, without downloading every note's
// body up front.
func writeChunkedData(data *vault.VaultData, outputDir string) error {
	notesDir := filepath.Join(outputDir, "notes")
	if err := os.MkdirAll(notesDir, 0755); err != nil {
		return fmt.Errorf("creating notes dir: %w", err)
	}

	search := make([]searchEntry, 0, len(data.Notes))
	for i := range data.Notes {
		n := &data.Notes[i]
		chunk := noteChunk{ID: n.ID, Content: n.Content, PlainText: n.PlainText}
		b, err := json.Marshal(chunk)
		if err != nil {
			return fmt.Errorf("marshaling chunk %s: %w", n.ID, err)
		}
		if err := os.WriteFile(filepath.Join(notesDir, n.ID+".json"), b, 0644); err != nil {
			return fmt.Errorf("writing chunk %s: %w", n.ID, err)
		}
		search = append(search, searchEntry{ID: n.ID, Title: n.Title, PlainText: n.PlainText})
	}

	searchBytes, err := json.Marshal(search)
	if err != nil {
		return fmt.Errorf("marshaling search index: %w", err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "search-index.json"), searchBytes, 0644); err != nil {
		return fmt.Errorf("writing search index: %w", err)
	}

	// Build the metadata-only index. Copy notes by value and blank the heavy
	// fields; the original data (used by SEO pre-rendering) keeps its content.
	index := *data
	index.Chunked = true
	index.Notes = make([]vault.Note, len(data.Notes))
	copy(index.Notes, data.Notes)
	for i := range index.Notes {
		index.Notes[i].Content = ""
		index.Notes[i].PlainText = ""
	}

	indexBytes, err := json.MarshalIndent(&index, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling index: %w", err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "vault-data.json"), indexBytes, 0644); err != nil {
		return fmt.Errorf("writing index: %w", err)
	}
	return nil
}
