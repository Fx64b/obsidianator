---
title: Obsidianator
tags:
  - obsidianator
  - intro
aliases:
  - Intro
  - About
---

# Obsidianator

Turn an [Obsidian](https://obsidian.md) vault into a self-contained static website — or serve it live in the browser without writing a single file to disk.

A small Go CLI that parses your vault, resolves every `[[wikilink]]`, and renders a fast, searchable web app. No server, no Node.js at runtime — just your notes, shareable anywhere. Export it as a standalone site, a single self-contained HTML file, or an embeddable web component.

## Features

- **Full Markdown** — GitHub Flavored Markdown, syntax-highlighted code, tables, task lists
- **Wikilinks & aliases** — `[[Note]]`, `[[Note|Alias]]`, backlinks, and `![[embeds]]`
- **Tags** — frontmatter and inline `#tags`, fully indexed
- **Graph view** — force-directed graph of your whole vault, plus a local mini-graph per note
- **Fuzzy search** — `⌘K` / `Ctrl+K` across titles, content, and tags
- **Navigation** — folder tree, scroll-spy table of contents, browser-style history
- **Obsidian syntax** — callouts, `==highlights==`, and math (KaTeX)
- **Dark mode** and a fully responsive, mobile-friendly layout
- **Live reload** — `--watch` re-renders the browser as you edit
- **Self-contained** — host the output anywhere, or run it entirely in memory

## Roadmap

- [ ] Richer graph view — tag & folder color-coding, filtering, and saved camera position
- [ ] Smarter watcher — pick up new folders, renames, and attachment changes instantly
- [ ] More themes and styling options for embedded vaults
- [ ] Broader Obsidian syntax coverage
