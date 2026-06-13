# Roadmap

What it takes to make obsidianator stand out among Obsidian publishing tools
(Obsidian Publish, Quartz, Perlite, obsidian-export pipelines).

The strategic position is **"one binary, zero config, full fidelity"**. Every
item below either (a) increases Obsidian fidelity beyond what alternatives
render, or (b) makes the published output first-class instead of an SPA demo.
Nothing here requires changing the core architecture — parser →
`vault-data.json` → React SPA, embedded in a single Go binary.

Status legend: ✅ shipped · 🚧 in progress · ⬜ planned

---

## Phase 1 — Fidelity sprint

Quick, visible wins that close gaps users hit in the first five minutes.

- ✅ **Mermaid diagram rendering** — ` ```mermaid ` blocks render as diagrams
  (lazy-loaded, theme-aware).
- ✅ **Hover preview popovers on wikilinks** — the single most
  "feels-like-Obsidian" feature. Floating card preview of the target note on
  link hover; anchor-aware (previews the linked section or block).
- ✅ **Heading transclusion** — `![[Note#Heading]]` embeds just that section
  (until the next heading of the same or higher level).
- ✅ **Block references** — `![[Note#^block-id]]` embeds the referenced block;
  `[[Note#^block-id]]` links navigate to it; `^block-id` markers are invisible
  in reading view, exactly like Obsidian.

## Phase 2 — Publishing-grade export

The differentiator: turns "demo my vault" into "publish my vault", a credible
free alternative to Obsidian Publish.

- ✅ **`publish:` frontmatter gating** — `--published-only` exports only notes
  with `publish: true`. Links, edges, backlinks, graph nodes and attachments
  referencing unpublished notes are stripped so private content never leaks
  into `vault-data.json`.
- ✅ **Real per-note URLs + pre-rendered HTML** — every export writes a static
  `<note-id>.html` page per note with the content pre-rendered in Go
  (crawlable text + followable internal links); the React app hydrates on top
  and switches to path-based routing. `serve` mode serves the same pages from
  memory.
- ✅ **SEO metadata** — per-page `<title>`, meta description,
  OpenGraph/article tags; `--base-url` adds canonical URLs, `sitemap.xml` and
  `robots.txt`.
- ✅ **RSS feed** — `--feed` writes `feed.xml` from note `created` dates.

## Phase 3 — Headline features

Launch-post material; things almost no alternative does.

- ✅ **Canvas (`.canvas`) rendering** — `.canvas` files are parsed in Go (JSON
  Canvas spec) and rendered as a pan/zoom board: text/file/link/group nodes,
  bezier edges with arrows and labels, preset colors. File nodes link into the
  vault; canvases are listed in the sidebar. Publish/include filters strip
  canvas file nodes pointing at excluded notes.
- ✅ **Scale: chunked/lazy vault data** — `--chunked` splits `vault-data.json`
  into a metadata-only index (titles, links, tags, headers, folders, edges,
  canvases) plus per-note `notes/<id>.json` content chunks and a
  `search-index.json`. The frontend renders sidebar/graph/canvases from the
  small index immediately and fetches note bodies on demand (active note + its
  link targets prefetched so transclusion and previews resolve; full-text
  search loads its index on first use). The single-file format remains the
  default for small vaults.

## Phase 4 — Delight and stickiness

- ✅ **Search upgrades** — `tag:`, `path:`, `title:`, `line:` operators (with
  `#tag` shorthand and quoted values), combinable with free text; match
  highlighting on the parsed free text.
- ⬜ **Semantic search (optional)** — embeddings precomputed at export time,
  flag-gated so the default stays dependency-free. *Deferred: a local
  embedding step conflicts with the dependency-free, no-API identity.*
- ✅ **Graph view upgrades** — color by folder or tag (toggle), orphan-only
  filter, and a time-lapse slider over note `created` dates (on top of the
  existing tag filter and folder legend).
- ✅ **Encrypted sharing** — `--password` encrypts `vault-data.json`
  (PBKDF2-SHA256 → AES-256-GCM) and ships a client-side decryptor; the vault
  is unreadable until the password is entered in the browser, so private
  vaults can be hosted on any static host. SEO pre-rendering and chunking are
  disabled in this mode (they would expose plaintext).
- ⬜ **Stacked pages / sliding panes** — Andy-Matuschak-style alternate
  reading mode.
- ⬜ **Git-aware note history** — when the vault is a git repo, `serve` shows
  per-note edit history from `git log`.

---

## Non-goals (for now)

- **PWA / offline support** — deliberately excluded.
- **Built-in AI / LLM features beyond local semantic search** — conflicts with
  the self-contained single-binary identity.
- **WYSIWYG editing** — obsidianator is a viewer/publisher, not an editor.
