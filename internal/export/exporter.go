package export

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Fx64b/obsidianator/internal/vault"
	"github.com/fsnotify/fsnotify"
)

var banner = `
   ____  __         _     ___                   __
  / __ \/ /_  _____(_)___/ (_)___ _____  ____ _/ /_____  _____
 / / / / __ \/ ___/ / __  / / __ '/ __ \/ __ '/ __/ __ \/ ___/
/ /_/ / /_/ (__  ) / /_/ / / /_/ / / / / /_/ / /_/ /_/ / /
\____/_.___/____/_/\__,_/_/\__,_/_/ /_/\__,_/\__/\____/_/

------------------ By Fx64b -------------------------------
                https://fx64b.dev

`

// Export writes vault-data.json and the embedded static assets to outputDir.
// Attachment files are copied to outputDir/files/<vault-relative-path>.
// vault-data.json is written LAST to ensure it is never overwritten by stale embedded copy.
// A pre-rendered <id>.html page is written per note (plus sitemap.xml,
// robots.txt and feed.xml depending on seo) when the embedded frontend build
// is present.
func Export(data *vault.VaultData, vaultPath, outputDir string, staticFS fs.FS, seo SEOOptions) error {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("creating output dir: %w", err)
	}

	// Copy embedded static assets first
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		return fmt.Errorf("accessing embedded static dir: %w", err)
	}

	err = fs.WalkDir(sub, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == "." || path == "placeholder.txt" {
			return nil
		}
		destPath := filepath.Join(outputDir, filepath.FromSlash(path))
		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}
		srcFile, err := sub.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()
		destFile, err := os.Create(destPath)
		if err != nil {
			return err
		}
		defer destFile.Close()
		_, err = io.Copy(destFile, srcFile)
		return err
	})
	if err != nil {
		return fmt.Errorf("copying static assets: %w", err)
	}

	// Copy vault attachment files to outputDir/files/
	if vaultPath != "" && len(data.Attachments) > 0 {
		for _, relPath := range data.Attachments {
			cleaned := filepath.Clean(filepath.FromSlash(relPath))
			if strings.HasPrefix(cleaned, "..") {
				continue
			}
			if !allowedAttachmentExt[strings.ToLower(filepath.Ext(cleaned))] {
				continue
			}
			src := filepath.Join(vaultPath, cleaned)
			dst := filepath.Join(outputDir, "files", cleaned)

			if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
				continue // best-effort
			}
			if err := copyFile(src, dst); err != nil {
				continue // best-effort
			}
		}
	}

	// Write vault-data.json LAST (so it overwrites any stale embedded copy)
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling vault data: %w", err)
	}
	jsonPath := filepath.Join(outputDir, "vault-data.json")
	if err := os.WriteFile(jsonPath, jsonBytes, 0644); err != nil {
		return fmt.Errorf("writing vault-data.json: %w", err)
	}

	return writeSEOFiles(data, outputDir, sub, seo)
}

// writeSEOFiles writes the publishing-grade artifacts: one pre-rendered
// .html page per note, and (when a base URL is configured) sitemap.xml,
// robots.txt and optionally feed.xml. Skipped silently when the embedded
// frontend build is absent (placeholder-only builds, e.g. plain `go test`).
func writeSEOFiles(data *vault.VaultData, outputDir string, staticDir fs.FS, seo SEOOptions) error {
	indexHTML, err := fs.ReadFile(staticDir, "index.html")
	if err != nil {
		return nil
	}

	res := newNoteResolver(data)
	for i := range data.Notes {
		note := &data.Notes[i]
		page := BuildNotePage(indexHTML, note, data, res, seo.BaseURL)
		dst := filepath.Join(outputDir, NotePageFilename(note.ID))
		if err := os.WriteFile(dst, page, 0644); err != nil {
			return fmt.Errorf("writing note page %s: %w", NotePageFilename(note.ID), err)
		}
	}

	if seo.BaseURL == "" {
		return nil
	}
	sitemap, err := Sitemap(data, seo.BaseURL)
	if err != nil {
		return fmt.Errorf("building sitemap: %w", err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "sitemap.xml"), sitemap, 0644); err != nil {
		return fmt.Errorf("writing sitemap.xml: %w", err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "robots.txt"), RobotsTxt(seo.BaseURL), 0644); err != nil {
		return fmt.Errorf("writing robots.txt: %w", err)
	}
	if seo.Feed {
		feed, err := Feed(data, seo.BaseURL)
		if err != nil {
			return fmt.Errorf("building feed: %w", err)
		}
		if err := os.WriteFile(filepath.Join(outputDir, "feed.xml"), feed, 0644); err != nil {
			return fmt.Errorf("writing feed.xml: %w", err)
		}
	}
	return nil
}

// securityHeaders wraps a handler and sets security-related HTTP response headers.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "+
				"worker-src 'self' blob:; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// allowedAttachmentExt is the set of file extensions that may be served from the vault's
// /files/ endpoint. Restricting this prevents serving .html (XSS) or other active content.
var allowedAttachmentExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".svg": true,
	".webp": true, ".bmp": true, ".ico": true, ".avif": true,
	".pdf": true,
	".mp3": true, ".ogg": true, ".wav": true, ".m4a": true, ".flac": true,
	".mp4": true, ".webm": true, ".ogv": true,
	".ttf": true, ".otf": true, ".woff": true, ".woff2": true,
}

// newServer returns an http.Server with timeouts that protect against slow or
// stalled connections (Slowloris). ReadTimeout and WriteTimeout are deliberately
// left unset: /reload is a long-lived SSE stream that must stay open indefinitely,
// and IdleTimeout only applies between requests so it does not affect it.
func newServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           securityHeaders(handler),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
}

// listenInfo returns the address to bind to and a human-readable URL for the
// startup banner that reflects how the server is actually reachable.
func listenInfo(host string, port int) (addr, display string) {
	if host == "" {
		host = "127.0.0.1"
	}
	addr = net.JoinHostPort(host, strconv.Itoa(port))
	switch host {
	case "0.0.0.0", "::":
		display = fmt.Sprintf("http://localhost:%d — listening on ALL interfaces; the vault is reachable from the network", port)
	case "127.0.0.1", "localhost", "::1":
		display = fmt.Sprintf("http://localhost:%d", port)
	default:
		display = "http://" + addr
	}
	return addr, display
}

// Serve starts a simple HTTP file server serving outputDir on host:port.
func Serve(outputDir, host string, port int) error {
	addr, display := listenInfo(host, port)
	fmt.Printf("Serving at %s\n", display)
	return newServer(addr, http.FileServer(http.Dir(outputDir))).ListenAndServe()
}

// ServeInMemory serves an Obsidian vault directly without writing any files to disk.
// Static assets are served from the embedded FS, vault-data.json is generated in-memory,
// and attachment files are served directly from the original vault path.
func ServeInMemory(
	vaultPath, host string,
	port int,
	watchMode bool,
	staticFS fs.FS,
	parseVault func(string) (*vault.VaultData, error),
) error {
	t0 := time.Now()
	fmt.Print(banner)
	data, err := parseVault(vaultPath)
	if err != nil {
		return fmt.Errorf("parsing vault: %w", err)
	}
	fmt.Printf("Found %d notes · %d folders · %d tags · %d edges · %d attachments (parsed in %s)\n",
		len(data.Notes), len(data.Folders), len(data.Tags), len(data.Edges), len(data.Attachments),
		time.Since(t0).Round(time.Millisecond))

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling vault data: %w", err)
	}

	live := &liveVault{}
	live.set(data, jsonBytes)

	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		return fmt.Errorf("accessing embedded static dir: %w", err)
	}

	broker := newSSEBroker()
	mux := http.NewServeMux()

	// vault-data.json served from memory (no disk write)
	mux.HandleFunc("/vault-data.json", func(w http.ResponseWriter, r *http.Request) {
		live.mu.RLock()
		j := live.json
		live.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(j) //nolint:errcheck
	})

	// Attachment files served directly from the vault directory.
	// Resolve vaultPath once so the prefix check is accurate even if vaultPath
	// itself was specified as a symlink.
	resolvedVaultPath, err := filepath.EvalSymlinks(vaultPath)
	if err != nil {
		resolvedVaultPath = vaultPath
	}
	mux.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
		rel := strings.TrimPrefix(r.URL.Path, "/files/")
		abs := filepath.Join(vaultPath, filepath.FromSlash(rel))
		resolved, err := filepath.EvalSymlinks(abs)
		if err != nil || (!strings.HasPrefix(resolved, resolvedVaultPath+string(os.PathSeparator)) && resolved != resolvedVaultPath) {
			http.NotFound(w, r)
			return
		}
		if !allowedAttachmentExt[strings.ToLower(filepath.Ext(resolved))] {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, resolved)
	})

	if watchMode {
		// SSE reload endpoint
		mux.HandleFunc("/reload", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")

			ch, ok := broker.subscribe()
			if !ok {
				http.Error(w, "too many connections", http.StatusServiceUnavailable)
				return
			}
			defer broker.unsubscribe(ch)

			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "streaming not supported", http.StatusInternalServerError)
				return
			}
			fmt.Fprintf(w, "data: connected\n\n")
			flusher.Flush()

			ctx := r.Context()
			for {
				select {
				case <-ctx.Done():
					return
				case msg := <-ch:
					fmt.Fprintf(w, "data: %s\n\n", msg)
					flusher.Flush()
				}
			}
		})

		// Start watcher that updates in-memory JSON on vault changes
		go func() {
			if err := watchVaultInMemory(vaultPath, parseVault, broker, live); err != nil {
				fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
			}
		}()

		fmt.Printf("Watching vault: %s\n", vaultPath)
	}

	addr, display := listenInfo(host, port)
	if watchMode {
		fmt.Printf("Serving at %s (with live reload)\n", display)
	} else {
		fmt.Printf("Serving at %s\n", display)
	}

	// Embedded static assets (index.html, JS, CSS), with per-note page shells
	// generated on the fly so path-routed note URLs (/<id>.html) work in
	// serve mode exactly like in an export.
	fileServer := http.FileServer(http.FS(sub))
	indexHTML, indexErr := fs.ReadFile(sub, "index.html")
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if indexErr == nil {
			name := strings.TrimPrefix(r.URL.Path, "/")
			if strings.HasSuffix(name, ".html") && !strings.Contains(name, "/") && name != "index.html" {
				live.mu.RLock()
				note, ok := live.pages[name]
				d, res := live.data, live.resolver
				live.mu.RUnlock()
				if ok {
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					w.Header().Set("Cache-Control", "no-store")
					w.Write(BuildNotePage(indexHTML, note, d, res, "")) //nolint:errcheck
					return
				}
			}
		}
		fileServer.ServeHTTP(w, r)
	})

	return newServer(addr, mux).ListenAndServe()
}

// liveVault holds the current in-memory parse result for serve mode: the
// marshaled JSON, the structured data, and derived lookups for the per-note
// page shells. Updated atomically by the watcher on re-parse.
type liveVault struct {
	mu       sync.RWMutex
	json     []byte
	data     *vault.VaultData
	resolver *noteResolver
	pages    map[string]*vault.Note // page filename → note
}

func (l *liveVault) set(data *vault.VaultData, jsonBytes []byte) {
	pages := make(map[string]*vault.Note, len(data.Notes))
	for i := range data.Notes {
		pages[NotePageFilename(data.Notes[i].ID)] = &data.Notes[i]
	}
	resolver := newNoteResolver(data)
	l.mu.Lock()
	l.json = jsonBytes
	l.data = data
	l.resolver = resolver
	l.pages = pages
	l.mu.Unlock()
}

func watchVaultInMemory(
	vaultPath string,
	parseVault func(string) (*vault.VaultData, error),
	broker *sseBroker,
	live *liveVault,
) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("creating watcher: %w", err)
	}
	defer watcher.Close()

	err = filepath.WalkDir(vaultPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && !strings.HasPrefix(d.Name(), ".") {
			return watcher.Add(path)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("setting up watches: %w", err)
	}

	var debounce *time.Timer
	const debounceDelay = 400 * time.Millisecond

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			// Watch newly created subdirectories so notes added later are picked up.
			if event.Has(fsnotify.Create) {
				watchNewDir(watcher, event.Name)
			}
			if !isVaultFile(event.Name) {
				continue
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) ||
				event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				if debounce != nil {
					debounce.Stop()
				}
				debounce = time.AfterFunc(debounceDelay, func() {
					fmt.Printf("Vault changed, re-parsing...\n")
					data, err := parseVault(vaultPath)
					if err != nil {
						fmt.Fprintf(os.Stderr, "re-parse error: %v\n", err)
						return
					}
					j, err := json.MarshalIndent(data, "", "  ")
					if err != nil {
						fmt.Fprintf(os.Stderr, "marshal error: %v\n", err)
						return
					}
					live.set(data, j)
					fmt.Printf("Re-parsed: %d notes\n", len(data.Notes))
					broker.broadcast("reload")
				})
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		}
	}
}

// Watch starts a file watcher on vaultPath, re-exports on .md changes,
// and serves outputDir with an SSE /reload endpoint.
func Watch(
	vaultPath, outputDir, host string,
	port int,
	staticFS fs.FS,
	parseVault func(string) (*vault.VaultData, error),
	seo SEOOptions,
) error {
	addr, display := listenInfo(host, port)

	// SSE broker
	broker := newSSEBroker()

	mux := http.NewServeMux()

	// SSE reload endpoint
	mux.HandleFunc("/reload", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		ch, ok := broker.subscribe()
		if !ok {
			http.Error(w, "too many connections", http.StatusServiceUnavailable)
			return
		}
		defer broker.unsubscribe(ch)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		// Send initial ping
		fmt.Fprintf(w, "data: connected\n\n")
		flusher.Flush()

		ctx := r.Context()
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-ch:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				flusher.Flush()
			}
		}
	})

	// All other routes → static files
	fileServer := http.FileServer(http.Dir(outputDir))
	mux.Handle("/", fileServer)

	// Start watcher in background
	go func() {
		if err := watchVault(vaultPath, outputDir, staticFS, parseVault, broker, seo); err != nil {
			fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		}
	}()

	fmt.Printf("Watching vault: %s\n", vaultPath)
	fmt.Printf("Serving at %s (with live reload)\n", display)
	return newServer(addr, mux).ListenAndServe()
}

func watchVault(
	vaultPath, outputDir string,
	staticFS fs.FS,
	parseVault func(string) (*vault.VaultData, error),
	broker *sseBroker,
	seo SEOOptions,
) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("creating watcher: %w", err)
	}
	defer watcher.Close()

	// Watch all subdirectories recursively
	err = filepath.WalkDir(vaultPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && !strings.HasPrefix(d.Name(), ".") {
			return watcher.Add(path)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("setting up watches: %w", err)
	}

	// Debounce timer
	var debounce *time.Timer
	const debounceDelay = 400 * time.Millisecond

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			// Watch newly created subdirectories so notes added to new folders are picked up.
			if event.Has(fsnotify.Create) {
				watchNewDir(watcher, event.Name)
			}
			if !isVaultFile(event.Name) {
				continue
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) ||
				event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				if debounce != nil {
					debounce.Stop()
				}
				debounce = time.AfterFunc(debounceDelay, func() {
					fmt.Printf("Vault changed, re-exporting...\n")
					data, err := parseVault(vaultPath)
					if err != nil {
						fmt.Fprintf(os.Stderr, "re-parse error: %v\n", err)
						return
					}
					if err := Export(data, vaultPath, outputDir, staticFS, seo); err != nil {
						fmt.Fprintf(os.Stderr, "re-export error: %v\n", err)
						return
					}
					fmt.Printf("Re-exported: %d notes\n", len(data.Notes))
					broker.broadcast("reload")
				})
			}

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		}
	}
}

// isVaultFile reports whether a path is a file type that should trigger a re-parse
// when changed — markdown notes and all recognised attachment types.
func isVaultFile(path string) bool {
	lower := strings.ToLower(filepath.Ext(path))
	switch lower {
	case ".md", ".canvas",
		".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
		".pdf", ".mp4", ".mp3", ".wav", ".ogg", ".mov",
		".zip", ".csv", ".xlsx":
		return true
	}
	return false
}

// watchNewDir adds a newly created directory (and all its children) to the watcher
// so that notes created inside new folders are picked up without restarting.
func watchNewDir(watcher *fsnotify.Watcher, path string) {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() || strings.HasPrefix(filepath.Base(path), ".") {
		return
	}
	_ = filepath.WalkDir(path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && !strings.HasPrefix(d.Name(), ".") {
			_ = watcher.Add(p)
		}
		return nil
	})
}

// sseBroker manages SSE subscriber channels.
type sseBroker struct {
	mu          sync.Mutex
	subscribers map[chan string]struct{}
}

func newSSEBroker() *sseBroker {
	return &sseBroker{subscribers: make(map[chan string]struct{})}
}

const maxSSESubscribers = 100

func (b *sseBroker) subscribe() (chan string, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.subscribers) >= maxSSESubscribers {
		return nil, false
	}
	ch := make(chan string, 1)
	b.subscribers[ch] = struct{}{}
	return ch, true
}

func (b *sseBroker) unsubscribe(ch chan string) {
	b.mu.Lock()
	delete(b.subscribers, ch)
	b.mu.Unlock()
}

func (b *sseBroker) broadcast(msg string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subscribers {
		select {
		case ch <- msg:
		default:
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
