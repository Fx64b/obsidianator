package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Fx64b/obsidianator/internal/vault"
)

// ── makeFilteredParser ────────────────────────────────────────────────────────

func TestMakeFilteredParser(t *testing.T) {
	vaultPath := filepath.Join("data", "test")
	if _, err := os.Stat(vaultPath); os.IsNotExist(err) {
		t.Skip("test vault not found")
	}

	t.Run("no includes returns full vault", func(t *testing.T) {
		full, err := makeFilteredParser(nil)(vaultPath)
		if err != nil {
			t.Fatal(err)
		}
		if len(full.Notes) < 15 {
			t.Errorf("expected full vault, got %d notes", len(full.Notes))
		}
	})

	t.Run("includes restrict to folder", func(t *testing.T) {
		filtered, err := makeFilteredParser([]string{"Graph"})(vaultPath)
		if err != nil {
			t.Fatal(err)
		}
		if len(filtered.Notes) != 2 {
			t.Errorf("expected 2 notes in Graph/, got %d", len(filtered.Notes))
		}
		for _, n := range filtered.Notes {
			if n.Folder != "Graph" {
				t.Errorf("unexpected note %s in folder %q", n.ID, n.Folder)
			}
		}
	})
}

// ── export command end-to-end ─────────────────────────────────────────────────

func TestExportCommand(t *testing.T) {
	vaultPath := filepath.Join("data", "test")
	if _, err := os.Stat(vaultPath); os.IsNotExist(err) {
		t.Skip("test vault not found")
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	rootCmd.SetArgs([]string{"export", vaultPath, "--output", outDir})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("export command failed: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(outDir, "vault-data.json"))
	if err != nil {
		t.Fatalf("vault-data.json not written: %v", err)
	}
	var data vault.VaultData
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatalf("vault-data.json invalid: %v", err)
	}
	if len(data.Notes) < 15 {
		t.Errorf("exported vault has %d notes; want ≥15", len(data.Notes))
	}
	if data.Name != "test" {
		t.Errorf("vault name = %q; want test", data.Name)
	}
	if len(data.Edges) == 0 {
		t.Error("exported vault has no edges")
	}
}

func TestExportCommandWithInclude(t *testing.T) {
	vaultPath := filepath.Join("data", "test")
	if _, err := os.Stat(vaultPath); os.IsNotExist(err) {
		t.Skip("test vault not found")
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	rootCmd.SetArgs([]string{"export", vaultPath, "--output", outDir, "--include", "Graph"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("export command failed: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(outDir, "vault-data.json"))
	if err != nil {
		t.Fatal(err)
	}
	var data vault.VaultData
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Notes) != 2 {
		t.Errorf("filtered export has %d notes; want 2", len(data.Notes))
	}
}
