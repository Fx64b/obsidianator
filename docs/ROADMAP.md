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

- ⬜ **Canvas (`.canvas`) rendering** — parse Obsidian's open JSON Canvas
  format in Go, render cards + edges in the frontend. Almost no publishing
  tool renders canvases.
- ⬜ **Scale: chunked/lazy vault data** — split `vault-data.json` into a small
  metadata/edges index plus per-note content fetched on demand, with a
  pre-built search index, so 10k-note vaults load instantly. Keep the current
  single-file format for small vaults.

## Phase 4 — Delight and stickiness

- ⬜ **Search upgrades** — operators (`tag:x`, `path:y`), full-content match
  highlighting in the search dialog.
- ⬜ **Semantic search (optional)** — embeddings precomputed at export time,
  flag-gated so the default stays dependency-free.
- ⬜ **Graph view upgrades** — color by folder/tag, filter controls, orphan
  highlighting, time-lapse slider over note `created` dates.
- ⬜ **Stacked pages / sliding panes** — Andy-Matuschak-style alternate
  reading mode.
- ⬜ **Git-aware note history** — when the vault is a git repo, `serve` shows
  per-note edit history from `git log`.
- ⬜ **Encrypted sharing** — `--password` export with client-side decryption
  (staticrypt-style), so private vaults can be shared via any static host.

---

## Non-goals (for now)

- **PWA / offline support** — deliberately excluded.
- **Built-in AI / LLM features beyond local semantic search** — conflicts with
  the self-contained single-binary identity.
- **WYSIWYG editing** — obsidianator is a viewer/publisher, not an editor.
