package export

import (
	"encoding/xml"
	"strings"
	"testing"

	"github.com/Fx64b/obsidianator/internal/vault"
)

func seoTestData() *vault.VaultData {
	return &vault.VaultData{
		Name: "My Vault",
		Notes: []vault.Note{
			{
				ID:        "welcome",
				Title:     "Welcome <Home>",
				Content:   "---\ntitle: Welcome\n---\n# Hello\n\nSee [[Second Note|the second]] and [[Nope]].\n\nTagged line. ^block-1\n\n![[Photo.png]]",
				PlainText: "Hello See the second and Nope Tagged line.",
				Aliases:   []string{"Start"},
				Created:   "2026-01-02T10:00:00Z",
				Modified:  "2026-02-03T10:00:00Z",
				Frontmatter: map[string]interface{}{
					"description": "A \"welcoming\" page",
				},
			},
			{
				ID:        "second-note",
				Title:     "Second Note",
				Content:   "Body text only.",
				PlainText: "Body text only.",
				Aliases:   []string{},
				Created:   "2026-03-04T10:00:00Z",
			},
			{
				ID:      "index",
				Title:   "Index",
				Content: "A note literally named index.",
				Aliases: []string{},
			},
		},
		Attachments: map[string]string{"photo.png": "assets/My Photo.png"},
	}
}

const testShell = `<!doctype html>
<html><head><title>Obsidianator</title></head><body><div id="root"></div></body></html>`

func TestNotePageFilename(t *testing.T) {
	if got := NotePageFilename("welcome"); got != "welcome.html" {
		t.Errorf("got %q", got)
	}
	if got := NotePageFilename("index"); got != "index-note.html" {
		t.Errorf("reserved id: got %q", got)
	}
}

func TestBuildNotePage(t *testing.T) {
	data := seoTestData()
	res := newNoteResolver(data)
	page := string(BuildNotePage([]byte(testShell), &data.Notes[0], data, res, "https://example.com"))

	t.Run("title is replaced and escaped", func(t *testing.T) {
		if !strings.Contains(page, "<title>Welcome &lt;Home&gt; — My Vault</title>") {
			t.Errorf("title not injected:\n%s", page)
		}
	})

	t.Run("meta description uses frontmatter, escaped", func(t *testing.T) {
		if !strings.Contains(page, `<meta name="description" content="A &#34;welcoming&#34; page" />`) {
			t.Errorf("description missing:\n%s", page)
		}
	})

	t.Run("canonical and og:url use the base URL", func(t *testing.T) {
		if !strings.Contains(page, `<link rel="canonical" href="https://example.com/welcome.html" />`) {
			t.Error("canonical missing")
		}
		if !strings.Contains(page, `<meta property="og:url" content="https://example.com/welcome.html" />`) {
			t.Error("og:url missing")
		}
	})

	t.Run("article timestamps from note dates", func(t *testing.T) {
		if !strings.Contains(page, `article:published_time" content="2026-01-02T10:00:00Z"`) {
			t.Error("published_time missing")
		}
	})

	t.Run("root div carries routing data attributes", func(t *testing.T) {
		if !strings.Contains(page, `<div id="root" data-note-id="welcome" data-routing="path">`) {
			t.Error("root data attributes missing")
		}
	})

	t.Run("prerendered article with crawlable wikilinks", func(t *testing.T) {
		if !strings.Contains(page, `<a href="second-note.html">the second</a>`) {
			t.Errorf("resolved wikilink missing:\n%s", page)
		}
		if !strings.Contains(page, "Nope") || strings.Contains(page, "[[Nope]]") {
			t.Error("unresolved wikilink should degrade to plain text")
		}
	})

	t.Run("frontmatter and block markers stripped from article", func(t *testing.T) {
		if strings.Contains(page, "title: Welcome") {
			t.Error("frontmatter leaked into article")
		}
		if strings.Contains(page, "^block-1") {
			t.Error("block marker leaked into article")
		}
	})

	t.Run("image embeds point at files/", func(t *testing.T) {
		if !strings.Contains(page, `src="files/assets/My%20Photo.png"`) {
			t.Errorf("image embed missing:\n%s", page)
		}
	})

	t.Run("no base URL → no canonical", func(t *testing.T) {
		p := string(BuildNotePage([]byte(testShell), &data.Notes[1], data, res, ""))
		if strings.Contains(p, "canonical") {
			t.Error("canonical must be omitted without base URL")
		}
		if !strings.Contains(p, "<title>Second Note — My Vault</title>") {
			t.Error("title still expected")
		}
	})
}

func TestSitemap(t *testing.T) {
	data := seoTestData()
	out, err := Sitemap(data, "https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	var parsed sitemapURLSet
	if err := xml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("sitemap is not valid XML: %v\n%s", err, out)
	}
	if len(parsed.URLs) != 4 { // root + 3 notes
		t.Errorf("expected 4 urls, got %d", len(parsed.URLs))
	}
	if parsed.URLs[1].Loc != "https://example.com/welcome.html" {
		t.Errorf("loc = %q", parsed.URLs[1].Loc)
	}
	if parsed.URLs[1].LastMod != "2026-02-03" {
		t.Errorf("lastmod = %q", parsed.URLs[1].LastMod)
	}
	// reserved filename respected
	if parsed.URLs[3].Loc != "https://example.com/index-note.html" {
		t.Errorf("reserved loc = %q", parsed.URLs[3].Loc)
	}
}

func TestFeed(t *testing.T) {
	data := seoTestData()
	out, err := Feed(data, "https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	var parsed rssDoc
	if err := xml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("feed is not valid XML: %v\n%s", err, out)
	}
	if parsed.Version != "2.0" {
		t.Errorf("version = %q", parsed.Version)
	}
	if len(parsed.Channel.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(parsed.Channel.Items))
	}
	// newest created first
	if parsed.Channel.Items[0].Link != "https://example.com/second-note.html" {
		t.Errorf("first item = %q", parsed.Channel.Items[0].Link)
	}
	// unparsable created date sorts last and has no pubDate
	if parsed.Channel.Items[2].Link != "https://example.com/index-note.html" {
		t.Errorf("last item = %q", parsed.Channel.Items[2].Link)
	}
	if parsed.Channel.Items[2].PubDate != "" {
		t.Errorf("expected empty pubDate, got %q", parsed.Channel.Items[2].PubDate)
	}
}

func TestRobotsTxt(t *testing.T) {
	got := string(RobotsTxt("https://example.com"))
	if !strings.Contains(got, "Sitemap: https://example.com/sitemap.xml") {
		t.Errorf("robots.txt = %q", got)
	}
}
