package export

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Fx64b/obsidianator/internal/vault"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plaintext := []byte(`{"name":"secret vault","notes":[]}`)
	envelope, err := encryptVaultData(plaintext, "hunter2")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	// Envelope is valid JSON with the expected marker and no plaintext leak.
	var env encEnvelope
	if err := json.Unmarshal(envelope, &env); err != nil {
		t.Fatalf("envelope not JSON: %v", err)
	}
	if !env.Encrypted || env.KDF != "pbkdf2-sha256" {
		t.Errorf("envelope marker/kdf wrong: %+v", env)
	}
	if strings.Contains(string(envelope), "secret vault") {
		t.Error("plaintext leaked into envelope")
	}

	got, err := decryptVaultData(envelope, "hunter2")
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if string(got) != string(plaintext) {
		t.Errorf("round trip mismatch: %s", got)
	}
}

func TestDecryptWrongPasswordFails(t *testing.T) {
	envelope, err := encryptVaultData([]byte("data"), "right")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decryptVaultData(envelope, "wrong"); err == nil {
		t.Error("expected decryption to fail with the wrong password")
	}
}

func TestExportEncrypted(t *testing.T) {
	vaultDir := writeTestVault(t)
	data, err := vault.ParseVault(vaultDir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	if err := Export(data, vaultDir, outDir, testStaticFS(), SEOOptions{Password: "pw"}); err != nil {
		t.Fatalf("Export: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(outDir, "vault-data.json"))
	if err != nil {
		t.Fatal(err)
	}

	t.Run("vault-data.json is an encrypted envelope", func(t *testing.T) {
		var env encEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			t.Fatal(err)
		}
		if !env.Encrypted {
			t.Error("expected encrypted envelope")
		}
		// Note content must not appear in plaintext anywhere in the file.
		if strings.Contains(string(raw), "Note Two") {
			t.Error("note content leaked into encrypted export")
		}
	})

	t.Run("decrypts back to the real vault data", func(t *testing.T) {
		plain, err := decryptVaultData(raw, "pw")
		if err != nil {
			t.Fatalf("decrypt: %v", err)
		}
		var d vault.VaultData
		if err := json.Unmarshal(plain, &d); err != nil {
			t.Fatal(err)
		}
		if len(d.Notes) != 2 {
			t.Errorf("expected 2 notes after decrypt, got %d", len(d.Notes))
		}
	})

	t.Run("no leaky SEO pages or note chunks written", func(t *testing.T) {
		for _, f := range []string{"note-one.html", "sitemap.xml", "feed.xml", "notes"} {
			if _, err := os.Stat(filepath.Join(outDir, f)); !os.IsNotExist(err) {
				t.Errorf("%s should not exist in an encrypted export", f)
			}
		}
	})
}
