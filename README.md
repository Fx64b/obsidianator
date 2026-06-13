<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="web/public/logo.svg">
    <img src="web/public/logo.svg" width="80" alt="Obsidianator logo">
  </picture>
</p>

# obsidianator

[![CI](https://github.com/Fx64b/obsidianator/actions/workflows/ci.yaml/badge.svg)](https://github.com/Fx64b/obsidianator/actions/workflows/ci.yaml)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn an [Obsidian](https://obsidian.md) vault into a self-contained static website — or serve it directly in the browser without writing anything to disk.

> **Status:** beta — functional, actively developed. See [releases](https://github.com/Fx64b/obsidianator/releases) for the current version.

---

## Install

Either download it from latest release or:

**From source:**
```sh
git clone https://github.com/Fx64b/obsidianator
cd obsidianator
make all          # builds frontend then Go binary
make install      # adds to path
```

**Requirements:** Go 1.21+, Node 18+, pnpm.

---

## Usage

### Serve a vault in-memory (no disk output)
```sh
obsidianator serve ./my-vault
obsidianator serve ./my-vault --watch          # live reload on file changes
obsidianator serve ./my-vault --port 8080
```

### Export to a static site
```sh
obsidianator export ./my-vault
obsidianator export ./my-vault --output ./dist
obsidianator export ./my-vault --output ./dist --serve   # export then serve
obsidianator export ./my-vault --output ./dist --watch   # export, watch, serve
```

### Filter to specific folders or files
```sh
obsidianator serve ./my-vault --include Notes --include Diary/2024.md
```

### Publish to the web (SEO-ready)

Every export writes a real, pre-rendered HTML page per note (`<note-id>.html`)
with meta/OpenGraph tags and a crawlable internal link graph — so published
notes are indexable and shareable, not locked inside an SPA.

```sh
obsidianator export ./my-vault --output ./dist \
  --published-only \
  --base-url https://notes.example.com \
  --feed
```

- `--published-only` — export only notes with `publish: true` in their
  frontmatter. Links, backlinks, graph edges and attachments referencing
  unpublished notes are stripped, so private content never leaks.
- `--base-url <url>` — the absolute URL the site will be hosted at. Enables
  canonical URLs and OpenGraph `og:url` on every page, plus `sitemap.xml` and
  `robots.txt`.
- `--feed` — write an RSS `feed.xml` of the most recently created notes
  (requires `--base-url`).

`serve` mode supports `--published-only` too, for previewing exactly what a
published export will contain.

### Large vaults

```sh
obsidianator export ./my-vault --output ./dist --chunked
```

`--chunked` splits `vault-data.json` into a small metadata-only index plus
per-note content chunks under `notes/` and a `search-index.json`. The site
becomes interactive (sidebar, graph, canvases, title search) as soon as the
index loads; note bodies are fetched on demand, so vaults with thousands of
notes start fast instead of downloading everything up front. Without the flag,
the vault is written as a single `vault-data.json` (best for small vaults).

### Canvas

`.canvas` files (Obsidian's [JSON Canvas](https://jsoncanvas.org) format) are
parsed and rendered as an interactive, pan-and-zoom board — text, note, link
and group cards connected by labelled arrows. Canvases appear at the top of the
sidebar; note cards link straight into the vault.

### Other flags
```sh
obsidianator --version    # print version
obsidianator --help
obsidianator serve --help
obsidianator export --help
```

### Network exposure

The built-in server binds to `127.0.0.1` by default, so it is only reachable
from your own machine. To make it reachable from other devices (e.g. your phone
on the same Wi-Fi), opt in explicitly:

```sh
obsidianator serve ./my-vault --host 0.0.0.0
```

> **Warning:** there is no authentication — anyone who can reach the port can
> read the entire vault. Only expose it on networks you trust.

---

## Development

**Prerequisites:** `go`, `pnpm`

### Fastest inner loop — serve the test vault with live reload
```sh
make dev-serve
# Builds the Go binary, then serves data/test/ at http://localhost:3000
# Vault changes trigger an automatic browser reload.
```

### Frontend-only changes (Vite HMR)
```sh
make copy-vault-data    # export test vault → web/public/vault-data.json
make dev-web            # start Vite dev server at http://localhost:5173
```
Edit files under `web/src/` — changes appear instantly without rebuilding Go.

### Export workflow
```sh
make dev-export
# Exports data/test/ to ./dist, watches for changes, serves at :3000.
```

### Build only

| Command | Effect |
|---------|--------|
| `make all` | Build frontend then Go binary |
| `make web` | Build Vite frontend into `./static` |
| `make build` | Build Go binary (embeds `./static`) |
| `make clean` | Remove binary, `./dist`, `./static/assets` |

---

## Testing

```sh
go test ./...                         # all Go tests
go test ./internal/vault/... -v       # vault parser tests with output
go test ./internal/vault/... -run TestParseVaultIntegration  # integration test
```

Tests cover `pathToID`, `slugify`, `resolveLinks`, `buildFolders`, `stripMarkdown`, `FilterVaultData`, and a full `ParseVault` integration test against the test vault at `data/test/`.

---

## Releases & versioning

Versioning is automated with [release-please](https://github.com/googleapis/release-please) and follows [semantic versioning](https://semver.org). On every push to `main`, release-please reads the commit history and maintains a release PR; merging it tags a new version, generates the changelog, and publishes cross-compiled binaries to the GitHub release.

For this to work, **all commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format**:

- `fix: ...` → patch release
- `feat: ...` → minor release
- `feat!: ...` or a `BREAKING CHANGE:` footer → major release
- `docs:`, `chore:`, `refactor:`, `test:`, `ci:` → no release, but keep history clean

To build release binaries locally (Linux, macOS Intel + Apple Silicon, Windows):

```sh
make release
# Outputs to ./release/
```

---

## Architecture

| Layer | Location | Role |
|-------|----------|------|
| Go CLI | `main.go` | `serve` / `export` commands via cobra |
| Vault parser | `internal/vault/` | Walk filesystem, parse frontmatter, resolve wikilinks, build folder tree |
| Exporter | `internal/export/` | Write static files to disk, serve in-memory, SSE live reload |
| Frontend | `web/src/` | React + Vite app, embedded into the binary at build time |

The Go binary embeds the compiled frontend (`web/` → `./static`) via `//go:embed`. In `serve` mode nothing touches disk — vault data is served as JSON from memory and attachments are proxied directly from the vault directory.
