package export

import (
	"io"
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Fx64b/obsidianator/internal/vault"
)

// testStaticFS mimics the embedded frontend build output. index.html uses the
// same markers (title tag, #root div) as the real Vite build so the per-note
// page generation is exercised.
func testStaticFS() fstest.MapFS {
	return fstest.MapFS{
		"static/index.html":      {Data: []byte(testShell)},
		"static/assets/app.js":   {Data: []byte("console.log('app')")},
		"static/placeholder.txt": {Data: []byte("placeholder")},
		// Stale embedded vault-data.json that must be overwritten by the real one
		"static/vault-data.json": {Data: []byte(`{"stale":true}`)},
	}
}

// writeTestVault creates a small on-disk vault with a note and attachments.
func writeTestVault(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	mustWrite := func(rel, content string) {
		t.Helper()
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite("Note One.md", "# Note One\n\nLinks to [[Note Two]].\n")
	mustWrite("Sub/Note Two.md", "# Note Two\n\nBody with #atag.\n")
	mustWrite("Sub/image.png", "fake-png-bytes")
	mustWrite("archive.zip", "fake-zip-bytes") // tracked attachment, but not exportable/servable
	return dir
}

// ── Export ────────────────────────────────────────────────────────────────────

func TestExport(t *testing.T) {
	vaultDir := writeTestVault(t)
	data, err := vault.ParseVault(vaultDir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	if err := Export(data, vaultDir, outDir, testStaticFS(), SEOOptions{}); err != nil {
		t.Fatalf("Export: %v", err)
	}

	t.Run("static assets copied", func(t *testing.T) {
		got, err := os.ReadFile(filepath.Join(outDir, "index.html"))
		if err != nil {
			t.Fatalf("index.html missing: %v", err)
		}
		if string(got) != testShell {
			t.Errorf("index.html content = %q", got)
		}
		if _, err := os.Stat(filepath.Join(outDir, "assets", "app.js")); err != nil {
			t.Errorf("assets/app.js missing: %v", err)
		}
	})

	t.Run("per-note pages written", func(t *testing.T) {
		got, err := os.ReadFile(filepath.Join(outDir, "note-one.html"))
		if err != nil {
			t.Fatalf("note page missing: %v", err)
		}
		if !strings.Contains(string(got), `data-note-id="note-one"`) {
			t.Errorf("note page lacks routing attributes:\n%s", got)
		}
		if !strings.Contains(string(got), `<a href="sub-note-two.html">`) {
			t.Errorf("note page lacks crawlable wikilink:\n%s", got)
		}
	})

	t.Run("no sitemap or feed without base URL", func(t *testing.T) {
		for _, f := range []string{"sitemap.xml", "robots.txt", "feed.xml"} {
			if _, err := os.Stat(filepath.Join(outDir, f)); !os.IsNotExist(err) {
				t.Errorf("%s should not exist without --base-url", f)
			}
		}
	})

	t.Run("placeholder skipped", func(t *testing.T) {
		if _, err := os.Stat(filepath.Join(outDir, "placeholder.txt")); !os.IsNotExist(err) {
			t.Error("placeholder.txt should not be exported")
		}
	})

	t.Run("vault-data.json overwrites stale embedded copy", func(t *testing.T) {
		raw, err := os.ReadFile(filepath.Join(outDir, "vault-data.json"))
		if err != nil {
			t.Fatalf("vault-data.json missing: %v", err)
		}
		var got vault.VaultData
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(got.Notes) != 2 {
			t.Errorf("expected 2 notes in exported JSON, got %d", len(got.Notes))
		}
		if strings.Contains(string(raw), `"stale"`) {
			t.Error("stale embedded vault-data.json was not overwritten")
		}
	})

	t.Run("allowed attachments copied under files/", func(t *testing.T) {
		got, err := os.ReadFile(filepath.Join(outDir, "files", "Sub", "image.png"))
		if err != nil {
			t.Fatalf("attachment not copied: %v", err)
		}
		if string(got) != "fake-png-bytes" {
			t.Errorf("attachment content = %q", got)
		}
	})

	t.Run("disallowed attachment extension skipped", func(t *testing.T) {
		if _, err := os.Stat(filepath.Join(outDir, "files", "archive.zip")); !os.IsNotExist(err) {
			t.Error("archive.zip should not be exported (.zip is not an allowed extension)")
		}
	})
}

func TestExportSEOFiles(t *testing.T) {
	vaultDir := writeTestVault(t)
	data, err := vault.ParseVault(vaultDir)
	if err != nil {
		t.Fatalf("ParseVault: %v", err)
	}

	outDir := filepath.Join(t.TempDir(), "dist")
	seo := SEOOptions{BaseURL: "https://example.com", Feed: true}
	if err := Export(data, vaultDir, outDir, testStaticFS(), seo); err != nil {
		t.Fatalf("Export: %v", err)
	}

	t.Run("sitemap, robots and feed written", func(t *testing.T) {
		sitemap, err := os.ReadFile(filepath.Join(outDir, "sitemap.xml"))
		if err != nil {
			t.Fatalf("sitemap.xml missing: %v", err)
		}
		if !strings.Contains(string(sitemap), "https://example.com/note-one.html") {
			t.Errorf("sitemap content:\n%s", sitemap)
		}
		robots, err := os.ReadFile(filepath.Join(outDir, "robots.txt"))
		if err != nil {
			t.Fatalf("robots.txt missing: %v", err)
		}
		if !strings.Contains(string(robots), "https://example.com/sitemap.xml") {
			t.Errorf("robots content: %s", robots)
		}
		feed, err := os.ReadFile(filepath.Join(outDir, "feed.xml"))
		if err != nil {
			t.Fatalf("feed.xml missing: %v", err)
		}
		if !strings.Contains(string(feed), "<rss version=\"2.0\"") {
			t.Errorf("feed content:\n%s", feed)
		}
	})

	t.Run("note pages carry canonical URLs", func(t *testing.T) {
		page, err := os.ReadFile(filepath.Join(outDir, "note-one.html"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(page), `<link rel="canonical" href="https://example.com/note-one.html" />`) {
			t.Errorf("canonical missing:\n%s", page)
		}
	})
}

func TestExportRejectsPathTraversalAttachment(t *testing.T) {
	vaultDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(vaultDir, "note.md"), []byte("# n"), 0644); err != nil {
		t.Fatal(err)
	}
	// Secret file outside the vault that a malicious attachment path points at
	outside := filepath.Join(filepath.Dir(vaultDir), "secret.png")
	if err := os.WriteFile(outside, []byte("secret"), 0644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(outside)

	data, err := vault.ParseVault(vaultDir)
	if err != nil {
		t.Fatal(err)
	}
	data.Attachments["secret.png"] = "../secret.png"

	outDir := filepath.Join(t.TempDir(), "dist")
	if err := Export(data, vaultDir, outDir, testStaticFS(), SEOOptions{}); err != nil {
		t.Fatalf("Export: %v", err)
	}

	var leaked []string
	_ = filepath.Walk(outDir, func(p string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && info.Name() == "secret.png" {
			leaked = append(leaked, p)
		}
		return nil
	})
	if len(leaked) > 0 {
		t.Errorf("path-traversal attachment was exported: %v", leaked)
	}
}

// ── listenInfo ────────────────────────────────────────────────────────────────

func TestListenInfo(t *testing.T) {
	cases := []struct {
		host        string
		port        int
		wantAddr    string
		wantDisplay string // substring
	}{
		{"", 3000, "127.0.0.1:3000", "http://localhost:3000"},
		{"127.0.0.1", 3000, "127.0.0.1:3000", "http://localhost:3000"},
		{"localhost", 8080, "localhost:8080", "http://localhost:8080"},
		{"0.0.0.0", 3000, "0.0.0.0:3000", "ALL interfaces"},
		{"::", 3000, "[::]:3000", "ALL interfaces"},
		{"192.168.1.5", 4000, "192.168.1.5:4000", "http://192.168.1.5:4000"},
	}
	for _, c := range cases {
		addr, display := listenInfo(c.host, c.port)
		if addr != c.wantAddr {
			t.Errorf("listenInfo(%q, %d) addr = %q; want %q", c.host, c.port, addr, c.wantAddr)
		}
		if !strings.Contains(display, c.wantDisplay) {
			t.Errorf("listenInfo(%q, %d) display = %q; want substring %q", c.host, c.port, display, c.wantDisplay)
		}
	}
}

// ── isVaultFile ───────────────────────────────────────────────────────────────

func TestIsVaultFile(t *testing.T) {
	yes := []string{"note.md", "NOTE.MD", "a/b/c.png", "doc.PDF", "x.csv"}
	no := []string{"script.sh", "page.html", "binary.exe", "noext", ".hidden"}
	for _, p := range yes {
		if !isVaultFile(p) {
			t.Errorf("isVaultFile(%q) = false; want true", p)
		}
	}
	for _, p := range no {
		if isVaultFile(p) {
			t.Errorf("isVaultFile(%q) = true; want false", p)
		}
	}
}

// ── securityHeaders ───────────────────────────────────────────────────────────

func TestSecurityHeaders(t *testing.T) {
	h := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	want := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
	}
	for k, v := range want {
		if got := rec.Header().Get(k); got != v {
			t.Errorf("header %s = %q; want %q", k, got, v)
		}
	}
	if csp := rec.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'self'") {
		t.Errorf("CSP = %q; want default-src 'self'", csp)
	}
}

// ── sseBroker ─────────────────────────────────────────────────────────────────

func TestSSEBroker(t *testing.T) {
	t.Run("broadcast reaches all subscribers", func(t *testing.T) {
		b := newSSEBroker()
		ch1, ok1 := b.subscribe()
		ch2, ok2 := b.subscribe()
		if !ok1 || !ok2 {
			t.Fatal("subscribe failed")
		}
		b.broadcast("reload")
		for i, ch := range []chan string{ch1, ch2} {
			select {
			case msg := <-ch:
				if msg != "reload" {
					t.Errorf("subscriber %d got %q", i, msg)
				}
			default:
				t.Errorf("subscriber %d received nothing", i)
			}
		}
	})

	t.Run("unsubscribed channel no longer receives", func(t *testing.T) {
		b := newSSEBroker()
		ch, _ := b.subscribe()
		b.unsubscribe(ch)
		b.broadcast("reload")
		select {
		case msg := <-ch:
			t.Errorf("unsubscribed channel got %q", msg)
		default:
		}
	})

	t.Run("subscriber limit enforced", func(t *testing.T) {
		b := newSSEBroker()
		for i := 0; i < maxSSESubscribers; i++ {
			if _, ok := b.subscribe(); !ok {
				t.Fatalf("subscribe %d unexpectedly rejected", i)
			}
		}
		if _, ok := b.subscribe(); ok {
			t.Error("subscribe beyond limit should be rejected")
		}
	})

	t.Run("slow subscriber does not block broadcast", func(t *testing.T) {
		b := newSSEBroker()
		ch, _ := b.subscribe()
		b.broadcast("one") // fills the buffered channel
		done := make(chan struct{})
		go func() {
			b.broadcast("two") // must not block even though ch is full
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("broadcast blocked on a full subscriber channel")
		}
		_ = ch
	})
}

// ── ServeInMemory integration ─────────────────────────────────────────────────

// freePort grabs an available TCP port. There is a small race between closing
// the listener and the server binding it, which is acceptable for tests.
func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return port
}

// waitForServer polls until the server responds or the deadline passes.
func waitForServer(t *testing.T, url string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("server at %s did not come up", url)
}

func startInMemoryServer(t *testing.T, vaultDir string, watch bool) string {
	t.Helper()
	port := freePort(t)
	go func() {
		err := ServeInMemory(vaultDir, "127.0.0.1", port, watch, testStaticFS(), vault.ParseVault)
		if err != nil && !strings.Contains(err.Error(), "Server closed") {
			fmt.Fprintf(os.Stderr, "ServeInMemory exited: %v\n", err)
		}
	}()
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	waitForServer(t, base+"/vault-data.json")
	return base
}

func TestServeInMemory(t *testing.T) {
	vaultDir := writeTestVault(t)
	base := startInMemoryServer(t, vaultDir, false)

	t.Run("serves vault-data.json from memory", func(t *testing.T) {
		resp, err := http.Get(base + "/vault-data.json")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q", ct)
		}
		var data vault.VaultData
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(data.Notes) != 2 {
			t.Errorf("expected 2 notes, got %d", len(data.Notes))
		}
		if len(data.Edges) != 1 {
			t.Errorf("expected 1 edge (Note One → Note Two), got %d", len(data.Edges))
		}
	})

	t.Run("serves embedded index.html", func(t *testing.T) {
		resp, err := http.Get(base + "/")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body := make([]byte, 64)
		n, _ := resp.Body.Read(body)
		if !strings.Contains(string(body[:n]), "<title>Obsidianator</title>") {
			t.Errorf("index body = %q", body[:n])
		}
	})

	t.Run("serves per-note page shells", func(t *testing.T) {
		resp, err := http.Get(base + "/sub-note-two.html")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if !strings.Contains(string(body), `data-note-id="sub-note-two"`) {
			t.Errorf("note page body:\n%s", body)
		}
		if !strings.Contains(string(body), "<title>Note Two — ") {
			t.Errorf("note page title missing:\n%s", body)
		}
	})

	t.Run("unknown .html paths fall through to 404", func(t *testing.T) {
		resp, err := http.Get(base + "/no-such-note.html")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d; want 404", resp.StatusCode)
		}
	})

	t.Run("serves allowed attachment from vault", func(t *testing.T) {
		resp, err := http.Get(base + "/files/Sub/image.png")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d", resp.StatusCode)
		}
	})

	t.Run("blocks disallowed extensions", func(t *testing.T) {
		for _, p := range []string{"/files/Note One.md", "/files/archive.zip"} {
			resp, err := http.Get(base + p)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("GET %s status = %d; want 404", p, resp.StatusCode)
			}
		}
	})

	t.Run("blocks path traversal", func(t *testing.T) {
		// Place a real allowed-extension file just outside the vault
		outside := filepath.Join(filepath.Dir(vaultDir), "outside.png")
		if err := os.WriteFile(outside, []byte("outside"), 0644); err != nil {
			t.Fatal(err)
		}
		defer os.Remove(outside)

		// Send raw request to bypass Go client path normalization
		conn, err := net.Dial("tcp", strings.TrimPrefix(base, "http://"))
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		fmt.Fprintf(conn, "GET /files/../outside.png HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
		status, err := bufio.NewReader(conn).ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(status, "200") {
			t.Errorf("path traversal returned %q; want non-200", strings.TrimSpace(status))
		}
	})

	t.Run("sets security headers", func(t *testing.T) {
		resp, err := http.Get(base + "/vault-data.json")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if got := resp.Header.Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("X-Content-Type-Options = %q", got)
		}
	})
}

func TestServeInMemoryWatchLiveReload(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping watch test in -short mode")
	}
	vaultDir := writeTestVault(t)
	base := startInMemoryServer(t, vaultDir, true)

	// Subscribe to SSE reload stream
	req, _ := http.NewRequest(http.MethodGet, base+"/reload", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	reader := bufio.NewReader(resp.Body)

	// First event is the connection ping
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(line, "connected") {
		t.Fatalf("first SSE line = %q; want connected ping", line)
	}

	// Give the fsnotify watcher a moment to establish watches, then change the vault
	time.Sleep(300 * time.Millisecond)
	newNote := filepath.Join(vaultDir, "Brand New.md")
	if err := os.WriteFile(newNote, []byte("# Brand New\n\nFresh content.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Expect a "reload" event within the debounce window + margin
	reloadCh := make(chan string, 1)
	go func() {
		for {
			l, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			if strings.Contains(l, "reload") {
				reloadCh <- l
				return
			}
		}
	}()
	select {
	case <-reloadCh:
	case <-time.After(10 * time.Second):
		t.Fatal("no reload event received after vault change")
	}

	// The in-memory JSON must now include the new note
	deadline := time.Now().Add(5 * time.Second)
	for {
		resp, err := http.Get(base + "/vault-data.json")
		if err != nil {
			t.Fatal(err)
		}
		var data vault.VaultData
		err = json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if err == nil && len(data.Notes) == 3 {
			return // success
		}
		if time.Now().After(deadline) {
			t.Fatalf("vault-data.json not updated after reload: %d notes", len(data.Notes))
		}
		time.Sleep(100 * time.Millisecond)
	}
}
