package export

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Fx64b/obsidianator/internal/vault"
)

func TestExportChunked(t *testing.T) {
	vaultDir := writeTestVault(t)
	data, err := vault.ParseVault(vaultDir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	if err := Export(data, vaultDir, outDir, testStaticFS(), SEOOptions{Chunked: true}); err != nil {
		t.Fatalf("Export: %v", err)
	}

	t.Run("index omits content but keeps metadata", func(t *testing.T) {
		raw, err := os.ReadFile(filepath.Join(outDir, "vault-data.json"))
		if err != nil {
			t.Fatal(err)
		}
		var idx vault.VaultData
		if err := json.Unmarshal(raw, &idx); err != nil {
			t.Fatalf("invalid index JSON: %v", err)
		}
		if !idx.Chunked {
			t.Error("index should be flagged chunked")
		}
		if len(idx.Notes) != 2 {
			t.Fatalf("expected 2 notes, got %d", len(idx.Notes))
		}
		for _, n := range idx.Notes {
			if n.Content != "" || n.PlainText != "" {
				t.Errorf("note %s still carries content in the index", n.ID)
			}
			if n.Title == "" {
				t.Errorf("note %s lost its title", n.ID)
			}
		}
		// edges/links preserved so graph + sidebar work from the index alone
		if len(idx.Edges) != 1 {
			t.Errorf("expected 1 edge in index, got %d", len(idx.Edges))
		}
	})

	t.Run("per-note chunks carry content", func(t *testing.T) {
		raw, err := os.ReadFile(filepath.Join(outDir, "notes", "note-one.json"))
		if err != nil {
			t.Fatalf("chunk missing: %v", err)
		}
		var chunk noteChunk
		if err := json.Unmarshal(raw, &chunk); err != nil {
			t.Fatal(err)
		}
		if chunk.ID != "note-one" {
			t.Errorf("chunk id = %q", chunk.ID)
		}
		if chunk.Content == "" {
			t.Error("chunk should carry content")
		}
	})

	t.Run("search index lists every note", func(t *testing.T) {
		raw, err := os.ReadFile(filepath.Join(outDir, "search-index.json"))
		if err != nil {
			t.Fatal(err)
		}
		var entries []searchEntry
		if err := json.Unmarshal(raw, &entries); err != nil {
			t.Fatal(err)
		}
		if len(entries) != 2 {
			t.Fatalf("expected 2 search entries, got %d", len(entries))
		}
		for _, e := range entries {
			if e.Title == "" || e.PlainText == "" {
				t.Errorf("search entry %s missing title/plainText", e.ID)
			}
		}
	})

	t.Run("non-chunked export writes no chunk files", func(t *testing.T) {
		plainDir := filepath.Join(t.TempDir(), "plain")
		if err := Export(data, vaultDir, plainDir, testStaticFS(), SEOOptions{}); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(plainDir, "notes")); !os.IsNotExist(err) {
			t.Error("non-chunked export should not create notes/ dir")
		}
		raw, _ := os.ReadFile(filepath.Join(plainDir, "vault-data.json"))
		var d vault.VaultData
		_ = json.Unmarshal(raw, &d)
		if d.Chunked {
			t.Error("non-chunked index should not set chunked flag")
		}
		if d.Notes[0].Content == "" {
			t.Error("non-chunked export should keep content inline")
		}
	})
}
