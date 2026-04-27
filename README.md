<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/public/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="web/public/logo.svg">
    <img src="web/public/logo.svg" width="80" alt="Obsidianator logo">
  </picture>
</p>

# obsidianator

[![CI](https://github.com/Fx64b/obsidianator/actions/workflows/ci.yml/badge.svg)](https://github.com/Fx64b/obsidianator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn an [Obsidian](https://obsidian.md) vault into a self-contained static website — or serve it directly in the browser without writing anything to disk.

> **Status:** `0.1.0-beta` — functional, actively developed.

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

### Other flags
```sh
obsidianator --version    # print version
obsidianator --help
obsidianator serve --help
obsidianator export --help
```

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

## Release builds

Cross-compiles stripped binaries for Linux, macOS (Intel + Apple Silicon), and Windows:

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
