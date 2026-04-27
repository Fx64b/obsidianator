# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Commands

**Full build** (frontend then Go binary with embedded static assets):
```
make all
```

**Development workflows:**
```
make dev-serve        # build Go binary, serve test vault in-memory with live reload on :3000
make dev-export       # build Go binary, export test vault to ./dist, watch+serve on :3000
make copy-vault-data  # export test vault, copy vault-data.json to web/public/ for Vite dev
make dev-web          # run Vite dev server (run copy-vault-data first)
```

**Frontend only:**
```
cd web && pnpm build  # build into ../static (picked up by Go embed)
cd web && pnpm dev    # Vite dev server (needs web/public/vault-data.json)
```

**Go only:**
```
go build -o obsidianator .
go test ./...
go test ./internal/vault/... -run TestName -v   # single test, verbose
```

**TypeScript type-check (no build):**
```
cd web && tsc --noEmit
```

**Release builds** (cross-compile linux/darwin/windows):
```
make release
```

**Clean:**
```
make clean
```

The test vault is at `data/test/`.

## Architecture

Obsidianator is a Go CLI that parses an Obsidian vault and serves it as an interactive web app. The Go binary embeds the compiled Vite/React frontend via `//go:embed static`.

### Go backend (`internal/`)

**`internal/vault/`** — vault parsing, no I/O side effects beyond filesystem reads:
- `types.go` — `VaultData`, `Note`, `Edge`, `Folder`, `Header` structs; these are serialized verbatim to `vault-data.json`
- `parser.go` — `ParseVault` walks the filesystem, calls `parseNote` per `.md` file, then resolves wikilinks, builds backlinks/edges, and runs the 4-pass folder algorithm (`buildFolders`). `FilterVaultData` applies `--include` filters post-parse.

Key invariants in the parser:
- **Note IDs** — `pathToID`: lowercase slug of the relative path (spaces/slashes → dashes, strip non-alphanumeric)
- **Wikilink resolution** — 3-tier: exact title → case-insensitive title → basename slug suffix match
- **Folder tree** — 4-pass: discover all ancestor paths → create folder entries → assign notes → link parent↔children
- **Callout preprocessing** — callout blocks (`> [!TYPE]`) are converted to sentinel `<span data-callout="TYPE" ...>` HTML before the content reaches the frontend renderer

**`internal/export/`** — serving and file output (`exporter.go`):
- `Export` — writes embedded static assets + `vault-data.json` + attachment files to disk; `vault-data.json` is written last to avoid being overwritten by the embedded placeholder
- `Serve` — plain HTTP file server over the output directory
- `ServeInMemory` — serves everything from memory: embedded static assets via `embed.FS`, `vault-data.json` generated in-memory, attachment files proxied directly from the vault path; used by the `serve` command
- `Watch` / `watchVaultInMemory` — `fsnotify`-based watcher with 400ms debounce; broadcasts `"reload"` via an SSE broker to connected browsers; newly created subdirectories are watched dynamically

**`main.go`** — two `cobra` commands:
- `export <vault>` — parse → export to disk → optionally `--serve` or `--watch`
- `serve <vault>` — parse → `ServeInMemory` (no disk output), optionally `--watch`

Both commands accept `--include` flags, filtered via `makeFilteredParser` which wraps `ParseVault` + `FilterVaultData`.

### React frontend (`web/src/`)

The frontend fetches `vault-data.json` at startup and operates entirely client-side.

**Data flow:**
- `useVaultData` — fetches `./vault-data.json`, normalizes nulls, and opens an SSE connection to `./reload` for live-reload in watch mode
- `App.tsx` — root state: active note, view mode (`notes`|`graph`), dark mode, sidebar open states, navigation history stack (50-entry cap), URL hash sync (`#<noteId>`)
- `Layout.tsx` — 3-panel layout: left `Sidebar` + `main` (MarkdownView or GraphView) + right `RightPanel`; draggable resize handles (160–480px); mobile: left sidebar overlays, right panel is a bottom sheet

**Key components:**
- `MarkdownView` — renders note content with `react-markdown` + `remark-gfm` + `remark-math` + `rehype-highlight` + `rehype-katex`; handles wikilink clicks, callout sentinel parsing, PDF/image embeds, inline tag badges
- `GraphView` — force-directed graph via `react-force-graph-2d`; nodes sized by link degree
- `MiniGraph` — small local graph in the right panel showing the active note's direct neighbors
- `SearchDialog` — fuzzy search via `fuse.js` over note titles and `plainText`
- `RightPanel` — table of contents with scroll-spy, backlinks, MiniGraph, FrontmatterPanel

**Routing:** hash-based (`#<noteId>`). Browser back/forward is handled by `hashchange` events plus an internal history stack for in-app back/forward buttons.

**Sidebar widths, dark mode, active note, and panel states** are all persisted to `localStorage` via `useLocalStorage`.

### Content preprocessing pipeline

Obsidian-specific syntax is transformed in two stages before rendering:

1. **Go parser** (`parseNote` in `parser.go`) converts callout blocks (`> [!TYPE]`) to `<span data-callout="TYPE" ...>` sentinels. This happens before content is stored in `Note.content`, so the frontend never sees raw callout syntax.
2. **Frontend** (`preprocessContent` in `MarkdownView.tsx`) handles the remaining Obsidian syntax at render time: `==highlight==` → `<mark>`, `^super^` → `<sup>`, `~sub~` → `<sub>`, `![[Note]]` embed transclusion (full-note), and custom checkbox states (`[-]`, `[/]`, `[!]`, `[?]`, `[*]`).

`findNote` in `MarkdownView.tsx` extends Go's 3-tier wikilink resolution with a 4th tier: alias matching via `Note.aliases` (case-insensitive).

### Frontend stack notes

- **Tailwind v4** via `@tailwindcss/vite` plugin — no separate postcss plugin config needed.
- **shadcn/ui** components live in `web/src/components/ui/`.
- Custom hooks (`useVaultData`, `useLocalStorage`, `useMobile`) are in `web/src/components/`, not a separate `hooks/` directory.

### Static asset embedding

`web/` builds into `static/` (Vite `outDir: '../static'`). The Go binary embeds `static/` at compile time. In `ServeInMemory`, the embedded FS is served at `/`; `vault-data.json` and `/files/` are registered on separate mux routes that take precedence.
