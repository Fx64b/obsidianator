package vault

// VaultData is the top-level structure exported to vault-data.json.
type VaultData struct {
	Name       string `json:"name"`
	AppVersion string `json:"appVersion,omitempty"` // obsidianator version that generated this file
	Chunked    bool   `json:"chunked,omitempty"`    // true when note content lives in per-note chunk files

	Notes       []Note            `json:"notes"`
	Tags        []string          `json:"tags"`
	Folders     []Folder          `json:"folders"`
	Edges       []Edge            `json:"edges"`
	Attachments map[string]string `json:"attachments"` // lowercase-basename → vault-relative-path
	Canvases    []Canvas          `json:"canvases"`     // parsed .canvas files (JSON Canvas spec)
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

// Canvas represents a parsed Obsidian .canvas file. The on-disk format is the
// open JSON Canvas spec (https://jsoncanvas.org): a top-level object with
// "nodes" and "edges" arrays. ID/Name/Path/Folder are populated by the parser
// and are not part of the file itself.
type Canvas struct {
	ID     string       `json:"id"`
	Name   string       `json:"name"`
	Path   string       `json:"path"`
	Folder string       `json:"folder"`
	Nodes  []CanvasNode `json:"nodes"`
	Edges  []CanvasEdge `json:"edges"`
}

// CanvasNode is one node on a canvas. Field presence depends on Type:
//   - "text":  Text (markdown)
//   - "file":  File (vault-relative path), Subpath; NoteID is resolved by the
//     parser when File points at a markdown note
//   - "link":  URL
//   - "group": Label, Background, BackgroundStyle
//
// Color is either a hex string ("#FF0000") or a preset digit "1".."6"; the
// frontend maps presets to theme colors.
type CanvasNode struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Color  string `json:"color,omitempty"`

	Text string `json:"text,omitempty"`

	File    string `json:"file,omitempty"`
	Subpath string `json:"subpath,omitempty"`
	NoteID  string `json:"noteId,omitempty"` // resolved note id for .md file nodes

	URL string `json:"url,omitempty"`

	Label           string `json:"label,omitempty"`
	Background      string `json:"background,omitempty"`
	BackgroundStyle string `json:"backgroundStyle,omitempty"`
}

// CanvasEdge connects two nodes. FromSide/ToSide are "top"|"right"|"bottom"|
// "left"; FromEnd/ToEnd are "none"|"arrow" (default toEnd is an arrow).
type CanvasEdge struct {
	ID       string `json:"id"`
	FromNode string `json:"fromNode"`
	FromSide string `json:"fromSide,omitempty"`
	FromEnd  string `json:"fromEnd,omitempty"`
	ToNode   string `json:"toNode"`
	ToSide   string `json:"toSide,omitempty"`
	ToEnd    string `json:"toEnd,omitempty"`
	Color    string `json:"color,omitempty"`
	Label    string `json:"label,omitempty"`
}
