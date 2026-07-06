---
title: Getting Started
tags:
  - getting-started
  - cli
publish: true
---

# Getting Started

## Installation

Build the binary from source:

```bash
git clone https://github.com/Fx64b/obsidianator
cd obsidianator
make all
```

## Usage

Export your vault to a static site:

```bash
./obsidianator export /path/to/your/vault --output ./dist
```

Export and serve immediately:

```bash
./obsidianator export /path/to/your/vault --output ./dist --serve --port 8080
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output`, `-o` | `./dist` | Output directory |
| `--serve` | false | Serve the output after export |
| `--port` | 3000 | Port to serve on |

## Development

Run the Vite dev server against the test vault:

```bash
make copy-vault-data  # exports test vault to web/public/
make dev-web          # starts Vite at http://localhost:5173
```

See [[Welcome]] to go back to the introduction, or [[Features]] for what's supported.
