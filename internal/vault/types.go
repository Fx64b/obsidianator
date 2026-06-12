package vault

// VaultData is the top-level structure exported to vault-data.json.
type VaultData struct {
	Name       string `json:"name"`
	AppVersion string `json:"appVersion,omitempty"` // obsidianator version that generated this file

	Notes       []Note            `json:"notes"`
	Tags        []string          `json:"tags"`
	Folders     []Folder          `json:"folders"`
	Edges       []Edge            `json:"edges"`
	Attachments map[string]string `json:"attachments"` // lowercase-basename → vault-relative-path
}

// Note represents a single markdown note in the vault.
type Note struct {
	ID          string                 `json:"id"`
	Title       string                 `json:"title"`
	Aliases     []string               `json:"aliases"`
	Path        string                 `json:"path"`
	Content     string                 `json:"content"`
	PlainText   string                 `json:"plainText"`
	Tags        []string               `json:"tags"`
	Links       []string               `json:"links"`
	Backlinks   []string               `json:"backlinks"`
	Frontmatter map[string]interface{} `json:"frontmatter"`
	Headers     []Header               `json:"headers"`
	Folder      string                 `json:"folder"`
	Modified    string                 `json:"modified"`
	Created     string                 `json:"created"`
}

// Edge represents a directed link between two notes.
type Edge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// Folder represents a directory in the vault.
type Folder struct {
	Name     string   `json:"name"`
	Path     string   `json:"path"`
	Parent   string   `json:"parent"`
	Children []string `json:"children"`
	Notes    []string `json:"notes"`
}

// Header represents a heading within a note.
type Header struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	Slug  string `json:"slug"`
}
