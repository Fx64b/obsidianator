package export

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"html"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/Fx64b/obsidianator/internal/vault"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

// SEOOptions control the publishing-grade and packaging artifacts written on
// export.
type SEOOptions struct {
	// BaseURL is the absolute URL the site will be hosted at, without a
	// trailing slash (e.g. "https://notes.example.com"). When set, note pages
	// get canonical/og:url tags and sitemap.xml + robots.txt are written.
	BaseURL string
	// Feed writes an RSS feed.xml from note created dates (requires BaseURL).
	Feed bool
	// Chunked splits vault-data.json into a metadata-only index plus per-note
	// content chunks and a search index, for large vaults.
	Chunked bool
	// Password, when set, encrypts vault-data.json so the site can only be read
	// after entering the password in the browser. Incompatible with chunking
	// and with the SEO/pre-render artifacts (which would leak plaintext).
	Password string
}

// NotePageFilename returns the flat root-level .html filename a note page is
// exported under. Flat files keep the SPA's relative fetches
// (./vault-data.json, ./files/...) working unchanged from any note URL. A
// note whose id would collide with the SPA entry point gets a -note suffix —
// the frontend mirrors this rule in lib/routing.ts.
func NotePageFilename(id string) string {
	if id == "index" {
		return "index-note.html"
	}
	return id + ".html"
}

// ---------------------------------------------------------------------------
// Pre-rendered article HTML
// ---------------------------------------------------------------------------

// seoMarkdown renders with GFM but WITHOUT html.WithUnsafe: raw HTML in vault
// content (including the Go parser's callout sentinel spans) is omitted from
// the pre-rendered output rather than emitted verbatim.
var seoMarkdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

var (
	frontmatterRe   = regexp.MustCompile(`(?s)^---\r?\n.*?\r?\n---\r?\n?`)
	embedRe         = regexp.MustCompile(`!\[\[([^\]]+?)\]\]`)
	wikilinkRe      = regexp.MustCompile(`\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]`)
	blockMarkerRe   = regexp.MustCompile(`(?m)(^|[ \t])\^[A-Za-z0-9-]+[ \t]*$`)
	titleTagRe      = regexp.MustCompile(`<title>.*?</title>`)
	imageExtensions = map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
		".svg": true, ".webp": true,
	}
)

// noteResolver resolves wikilink targets to note IDs for the pre-rendered
// pages, mirroring the frontend's findNote tiers: exact/case-insensitive
// title → alias → id slug suffix.
type noteResolver struct {
	byTitle map[string]string
	byAlias map[string]string
	ids     []string
}

func newNoteResolver(data *vault.VaultData) *noteResolver {
	r := &noteResolver{
		byTitle: map[string]string{},
		byAlias: map[string]string{},
		ids:     make([]string, 0, len(data.Notes)),
	}
	for _, n := range data.Notes {
		key := strings.ToLower(n.Title)
		if _, exists := r.byTitle[key]; !exists {
			r.byTitle[key] = n.ID
		}
		for _, a := range n.Aliases {
			akey := strings.ToLower(a)
			if _, exists := r.byAlias[akey]; !exists {
				r.byAlias[akey] = n.ID
			}
		}
		r.ids = append(r.ids, n.ID)
	}
	return r
}

func (r *noteResolver) resolve(target string) (string, bool) {
	t := strings.ToLower(strings.TrimSpace(target))
	if id, ok := r.byTitle[t]; ok {
		return id, true
	}
	if id, ok := r.byAlias[t]; ok {
		return id, true
	}
	var b strings.Builder
	for _, c := range strings.ReplaceAll(t, " ", "-") {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			b.WriteRune(c)
		}
	}
	if slug := b.String(); slug != "" {
		for _, id := range r.ids {
			if strings.HasSuffix(id, slug) {
				return id, true
			}
		}
	}
	return "", false
}

// renderNoteArticle renders a crawlable HTML version of a note for the
// pre-rendered page shell. Fidelity is intentionally approximate — the React
// app replaces this content on hydration; what matters for SEO is the text
// and a followable internal link graph.
func renderNoteArticle(note *vault.Note, data *vault.VaultData, res *noteResolver) string {
	src := frontmatterRe.ReplaceAllString(note.Content, "")
	src = blockMarkerRe.ReplaceAllString(src, "")

	// Embeds: images become <img> via files/, PDFs become links, note embeds
	// degrade to plain wikilinks (converted to crawlable links below).
	src = embedRe.ReplaceAllStringFunc(src, func(m string) string {
		inner := strings.TrimSuffix(strings.TrimPrefix(m, "![["), "]]")
		name := strings.TrimSpace(strings.SplitN(inner, "|", 2)[0])
		base := name
		if i := strings.Index(base, "#"); i >= 0 {
			base = strings.TrimSpace(base[:i])
		}
		ext := strings.ToLower(path.Ext(base))
		if imageExtensions[ext] || ext == ".pdf" {
			rel, ok := data.Attachments[strings.ToLower(base)]
			if !ok {
				return ""
			}
			href := "files/" + strings.ReplaceAll(rel, " ", "%20")
			if ext == ".pdf" {
				return fmt.Sprintf("[%s](%s)", base, href)
			}
			return fmt.Sprintf("![%s](%s)", base, href)
		}
		return "[[" + inner + "]]"
	})

	// Wikilinks → markdown links to the per-note pages.
	src = wikilinkRe.ReplaceAllStringFunc(src, func(m string) string {
		g := wikilinkRe.FindStringSubmatch(m)
		target, anchor, alias := strings.TrimSpace(g[1]), strings.TrimSpace(g[2]), strings.TrimSpace(g[3])
		display := alias
		if display == "" {
			display = target
		}
		if display == "" {
			display = anchor
		}
		if target == "" {
			return display // same-note [[#anchor]] link
		}
		if id, ok := res.resolve(target); ok {
			return fmt.Sprintf("[%s](%s)", display, NotePageFilename(id))
		}
		return display
	})

	var buf bytes.Buffer
	if err := seoMarkdown.Convert([]byte(src), &buf); err != nil {
		return ""
	}
	return "<article>\n<h1>" + html.EscapeString(note.Title) + "</h1>\n" + buf.String() + "</article>"
}

// ---------------------------------------------------------------------------
// Note page shell
// ---------------------------------------------------------------------------

// noteDescription returns the meta description: frontmatter `description`
// when present, else a ~160-char excerpt of the note's plain text.
func noteDescription(note *vault.Note) string {
	if d, ok := note.Frontmatter["description"].(string); ok && strings.TrimSpace(d) != "" {
		return strings.TrimSpace(d)
	}
	text := strings.Join(strings.Fields(note.PlainText), " ")
	if runes := []rune(text); len(runes) > 160 {
		text = string(runes[:157]) + "…"
	}
	return text
}

// BuildNotePage turns the SPA index.html shell into a standalone page for one
// note: per-note <title>, description/OpenGraph/canonical tags, and the
// pre-rendered article inside #root. The page info travels as data attributes
// on #root (not an inline <script>) so the serve-mode CSP, which disallows
// inline scripts, still applies unchanged. All injections are best-effort —
// a shell missing the expected markers just gets fewer enhancements.
func BuildNotePage(indexHTML []byte, note *vault.Note, data *vault.VaultData, res *noteResolver, baseURL string) []byte {
	page := string(indexHTML)

	siteName := data.Name
	if siteName == "" {
		siteName = "Obsidianator"
	}
	fullTitle := html.EscapeString(note.Title + " — " + siteName)
	page = titleTagRe.ReplaceAllLiteralString(page, "<title>"+fullTitle+"</title>")

	desc := html.EscapeString(noteDescription(note))
	var meta strings.Builder
	writeMeta := func(format string, args ...any) {
		meta.WriteString("    " + fmt.Sprintf(format, args...) + "\n")
	}
	writeMeta(`<meta name="description" content="%s" />`, desc)
	writeMeta(`<meta property="og:type" content="article" />`)
	writeMeta(`<meta property="og:title" content="%s" />`, html.EscapeString(note.Title))
	writeMeta(`<meta property="og:description" content="%s" />`, desc)
	writeMeta(`<meta property="og:site_name" content="%s" />`, html.EscapeString(siteName))
	if baseURL != "" {
		u := baseURL + "/" + NotePageFilename(note.ID)
		writeMeta(`<link rel="canonical" href="%s" />`, html.EscapeString(u))
		writeMeta(`<meta property="og:url" content="%s" />`, html.EscapeString(u))
	}
	if note.Created != "" {
		writeMeta(`<meta property="article:published_time" content="%s" />`, html.EscapeString(note.Created))
	}
	if note.Modified != "" {
		writeMeta(`<meta property="article:modified_time" content="%s" />`, html.EscapeString(note.Modified))
	}
	page = strings.Replace(page, "</head>", meta.String()+"  </head>", 1)

	rootTag := fmt.Sprintf(
		`<div id="root" data-note-id="%s" data-routing="path">%s</div>`,
		html.EscapeString(note.ID),
		renderNoteArticle(note, data, res),
	)
	page = strings.Replace(page, `<div id="root"></div>`, rootTag, 1)

	return []byte(page)
}

// ---------------------------------------------------------------------------
// sitemap.xml / robots.txt / feed.xml
// ---------------------------------------------------------------------------

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// Sitemap renders a sitemap.xml for all notes under baseURL.
func Sitemap(data *vault.VaultData, baseURL string) ([]byte, error) {
	set := sitemapURLSet{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	set.URLs = append(set.URLs, sitemapURL{Loc: baseURL + "/"})
	for _, n := range data.Notes {
		u := sitemapURL{Loc: baseURL + "/" + NotePageFilename(n.ID)}
		if t, err := time.Parse(time.RFC3339, n.Modified); err == nil {
			u.LastMod = t.Format("2006-01-02")
		}
		set.URLs = append(set.URLs, u)
	}
	out, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), append(out, '\n')...), nil
}

// RobotsTxt renders a robots.txt pointing crawlers at the sitemap.
func RobotsTxt(baseURL string) []byte {
	return []byte("User-agent: *\nAllow: /\n\nSitemap: " + baseURL + "/sitemap.xml\n")
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	PubDate     string `xml:"pubDate,omitempty"`
	Description string `xml:"description,omitempty"`
}

type rssChannel struct {
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Items       []rssItem `xml:"item"`
}

type rssDoc struct {
	XMLName xml.Name   `xml:"rss"`
	Version string     `xml:"version,attr"`
	Channel rssChannel `xml:"channel"`
}

const feedItemLimit = 20

// Feed renders an RSS 2.0 feed.xml of the most recently created notes.
func Feed(data *vault.VaultData, baseURL string) ([]byte, error) {
	siteName := data.Name
	if siteName == "" {
		siteName = "Obsidianator"
	}

	notes := make([]vault.Note, len(data.Notes))
	copy(notes, data.Notes)
	created := func(n *vault.Note) time.Time {
		t, err := time.Parse(time.RFC3339, n.Created)
		if err != nil {
			return time.Time{} // unparsable dates sort last
		}
		return t
	}
	sort.SliceStable(notes, func(i, j int) bool {
		return created(&notes[i]).After(created(&notes[j]))
	})
	if len(notes) > feedItemLimit {
		notes = notes[:feedItemLimit]
	}

	doc := rssDoc{
		Version: "2.0",
		Channel: rssChannel{
			Title:       siteName,
			Link:        baseURL + "/",
			Description: siteName + " — published notes",
		},
	}
	for i := range notes {
		n := &notes[i]
		link := baseURL + "/" + NotePageFilename(n.ID)
		item := rssItem{
			Title:       n.Title,
			Link:        link,
			GUID:        link,
			Description: noteDescription(n),
		}
		if t := created(n); !t.IsZero() {
			item.PubDate = t.Format(time.RFC1123Z)
		}
		doc.Channel.Items = append(doc.Channel.Items, item)
	}
	out, err := xml.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), append(out, '\n')...), nil
}
