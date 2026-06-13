package export

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// Encryption parameters. These must stay in sync with the frontend decryptor
// (web/src/lib/decrypt.ts): PBKDF2-SHA256 → AES-256-GCM with a 12-byte nonce
// and the GCM tag appended to the ciphertext (Web Crypto's expected layout).
const (
	pbkdf2Iterations = 200_000
	saltLen          = 16
	nonceLen         = 12
	keyLen           = 32 // AES-256
)

// encEnvelope is the JSON written to vault-data.json when --password is used.
// It carries everything the browser needs to derive the key and decrypt,
// except the password itself. The "encrypted" marker lets the frontend tell an
// envelope apart from a plaintext VaultData.
type encEnvelope struct {
	Encrypted  bool   `json:"encrypted"`
	KDF        string `json:"kdf"`
	Iterations int    `json:"iterations"`
	Salt       string `json:"salt"`
	IV         string `json:"iv"`
	Ciphertext string `json:"ciphertext"`
}

// encryptVaultData encrypts plaintext under a password and returns the JSON
// envelope bytes. A fresh random salt and nonce are generated per call.
func encryptVaultData(plaintext []byte, password string) ([]byte, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("generating salt: %w", err)
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, pbkdf2Iterations, keyLen)
	if err != nil {
		return nil, fmt.Errorf("deriving key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("creating cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating gcm: %w", err)
	}
	nonce := make([]byte, nonceLen)
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("generating nonce: %w", err)
	}
	// Seal appends the GCM tag to the ciphertext, matching Web Crypto's layout.
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	env := encEnvelope{
		Encrypted:  true,
		KDF:        "pbkdf2-sha256",
		Iterations: pbkdf2Iterations,
		Salt:       base64.StdEncoding.EncodeToString(salt),
		IV:         base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
	}
	return json.MarshalIndent(&env, "", "  ")
}

// decryptVaultData reverses encryptVaultData; used in tests to verify the
// round trip (the real decryption happens in the browser).
func decryptVaultData(envelope []byte, password string) ([]byte, error) {
	var env encEnvelope
	if err := json.Unmarshal(envelope, &env); err != nil {
		return nil, err
	}
	salt, err := base64.StdEncoding.DecodeString(env.Salt)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.StdEncoding.DecodeString(env.IV)
	if err != nil {
		return nil, err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(env.Ciphertext)
	if err != nil {
		return nil, err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, env.Iterations, keyLen)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ciphertext, nil)
}
