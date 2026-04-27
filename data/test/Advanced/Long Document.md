---
title: Long Document
tags:
  - advanced
  - toc
  - scroll-spy
---

# Long Document

This document exists to test the Table of Contents panel and scroll-spy heading detection. Scroll through it while watching the TOC in the right panel highlight the active heading.

---

## Section One: Introduction

### 1.1 Background

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.

### 1.2 Motivation

Sunt in culpa qui officia deserunt mollit anim id est laborum. Integer posuere erat a ante venenatis dapibus posuere velit aliquet.

Cras mattis consectetur purus sit amet fermentum. Cras justo odio, dapibus ac facilisis in, egestas eget quam.

### 1.3 Scope

Nullam quis risus eget urna mollis ornare vel eu leo. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.

---

## Section Two: Core Concepts

### 2.1 Architecture Overview

Vestibulum id ligula porta felis euismod semper. Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh.

```
┌─────────────────────────────────────────┐
│              Go CLI Binary              │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │ Vault Parser │  │ Static Exporter │  │
│  └──────────────┘  └─────────────────┘  │
│           │                │            │
│           └────────────────┘            │
│                    │                    │
│              vault-data.json            │
└─────────────────────────────────────────┘
```

### 2.2 Data Model

Aenean lacinia bibendum nulla sed consectetur. Etiam porta sem malesuada magna mollis euismod.

- **VaultData** — root structure exported as JSON
- **Note** — individual markdown file with parsed metadata
- **Edge** — directed link between two notes
- **Folder** — directory with parent/child relationships

### 2.3 Parsing Pipeline

Donec sed odio dui. Cras mattis consectetur purus sit amet fermentum. Sed posuere consectetur est at lobortis.

1. Walk vault directory, skip hidden folders
2. Parse YAML frontmatter from each `.md` file
3. Extract wikilinks, tags, and headers
4. Resolve wikilink targets with 3-tier fallback
5. Build backlink index from resolved links

---

## Section Three: Frontend

### 3.1 Component Structure

Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus.

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root shell, state management |
| `Layout.tsx` | 3-panel layout, scroll-spy |
| `Sidebar.tsx` | File tree, tag browser |
| `MarkdownView.tsx` | Note renderer |
| `RightPanel.tsx` | TOC, graph, backlinks |

### 3.2 Markdown Rendering

Cras mattis consectetur purus sit amet fermentum. Sed posuere consectetur est at lobortis. Donec ullamcorper nulla non metus auctor fringilla.

The preprocessing pipeline runs before ReactMarkdown:

1. Strip frontmatter from content
2. Process `![[embed]]` blocks
3. Convert `ad-*` admonitions to callout markers
4. Convert Obsidian callout syntax `> [!TYPE]`
5. Replace wikilinks with `wiki:` pseudo-URLs

### 3.3 State Management

Nullam id dolor id nibh ultricies vehicula ut id elit. Nullam quis risus eget urna mollis ornare vel eu leo.

State is persisted to `localStorage`:

- Active note ID
- Dark/light mode preference
- Sidebar open/closed
- Right panel active tab

---

## Section Four: Build System

### 4.1 Makefile Targets

Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Aenean eu leo quam.

```bash
make all          # build web app + Go binary
make web          # build Vite frontend only
make build        # compile Go binary only
make dev-export   # export + watch + serve at :3000
make dev-web      # Vite dev server at :5173
make release      # cross-compile for all platforms
make clean        # remove build artifacts
```

### 4.2 Embedding

Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.

The Go binary embeds the built Vite app using `//go:embed static`. This means:

- Single binary deployment
- No Node.js required at runtime
- Vault data is the only external dependency

### 4.3 Watch Mode

Vestibulum id ligula porta felis euismod semper. Praesent commodo cursus magna.

```bash
./obsidianator export ./vault --watch --port 3000
```

The `--watch` flag:
1. Starts `fsnotify` watcher on vault directory
2. Debounces changes by 400ms
3. Re-parses and re-exports on `.md` change
4. Broadcasts `data: reload` via SSE
5. Browser receives event and calls `location.reload()`

---

## Section Five: Deployment

### 5.1 Static Hosting

Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean lacinia bibendum nulla sed consectetur.

The output directory is a standard static site:

```
dist/
├── index.html
├── vault-data.json
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
└── files/          ← vault attachments
```

### 5.2 GitHub Pages

Cras justo odio, dapibus ac facilisis in, egestas eget quam. Cras mattis consectetur purus sit amet fermentum.

```yaml
# .github/workflows/deploy.yml
- name: Export vault
  run: ./obsidianator export ./vault --output ./dist

- name: Deploy to Pages
  uses: actions/upload-pages-artifact@v2
  with:
    path: dist
```

### 5.3 Self-Hosting

Sed posuere consectetur est at lobortis. Donec ullamcorper nulla non metus auctor fringilla. Maecenas sed diam eget risus varius blandit.

Any static file server works:

```bash
# Python
python3 -m http.server 8080 --directory dist

# Node.js
npx serve dist

# Go binary
./obsidianator export ./vault --serve --port 8080
```

---

## Section Six: Contributing

### 6.1 Development Setup

Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Donec id elit non mi porta gravida at eget metus.

```bash
git clone https://github.com/Fx64b/obsidianator
cd obsidianator
make all
make dev-export  # opens http://localhost:3000
```

### 6.2 Project Structure

Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus.

```
obsidianator/
├── main.go
├── internal/
│   ├── vault/
│   │   ├── types.go
│   │   └── parser.go
│   └── export/
│       └── exporter.go
├── web/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       └── hooks/
└── data/test/   ← test vault
```

### 6.3 Testing

Nullam quis risus eget urna mollis ornare vel eu leo. Cum sociis natoque penatibus et magnis dis parturient montes.

```bash
# Export test vault and verify output
./obsidianator export data/test --output /tmp/test-out
# Expected: Found 19+ notes, X tags, Y edges

# Full build test
make all
```

---

## Section Seven: Roadmap

### 7.1 Planned Features

Cras mattis consectetur purus sit amet fermentum. Etiam porta sem malesuada magna mollis euismod.

- [ ] Mermaid diagram rendering
- [ ] LaTeX / KaTeX math support
- [ ] Dataview query rendering
- [ ] Note hover preview (link preview on mouseover)
- [ ] Full-text search indexing at export time
- [ ] RSS feed generation

### 7.2 Known Limitations

Aenean lacinia bibendum nulla sed consectetur. Etiam porta sem malesuada magna mollis euismod.

- Note IDs are derived from file paths — renaming a file breaks existing links until re-exported
- Very large vaults (1000+ notes) may produce a large `vault-data.json` — chunking is not yet implemented
- Attachment files must be inside the vault directory to be copied to the output

### 7.3 Performance

Nullam id dolor id nibh ultricies vehicula ut id elit. Cras mattis consectetur purus sit amet fermentum.

On a mid-range laptop, export times are approximately:

| Vault Size | Export Time |
|------------|------------|
| 100 notes | < 1 second |
| 500 notes | ~2 seconds |
| 1000 notes | ~5 seconds |

---

## Section Eight: License

### 8.1 MIT License

Copyright © 2026 Fx64b. Released under the MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction.

### 8.2 Third-Party Licenses

- React — MIT
- Vite — MIT
- shadcn/ui — MIT
- react-force-graph-2d — MIT
- fsnotify — BSD-3-Clause
- Cobra — Apache 2.0
- gopkg.in/yaml.v3 — MIT and Apache 2.0

### 8.3 Acknowledgements

Thanks to the Obsidian team for building a great note-taking application, and to all the open-source maintainers whose libraries make this project possible.

See also: [[Welcome]], [[Getting Started]], [[Features]].
