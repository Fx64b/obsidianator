---
title: Features
tags:
  - features
  - markdown
publish: true
---

# Features

## Markdown Support

Obsidianator renders your notes with full GitHub Flavored Markdown support.

### Supported elements

- **Bold** and *italic* text
- `inline code` and fenced code blocks with syntax highlighting
- Tables (like the one in [[Getting Started]])
- Blockquotes
- Task lists
- Images

### Code blocks

```typescript
const greeting = (name: string): string => {
  return `Hello, ${name}!`
}
```

## Wikilinks

Link between notes using Obsidian's `[[wikilink]]` syntax:

- `[[Note Title]]` — links to a note by title
- `[[Note Title|Alias]]` — links with a custom display name

## Tags

Tags can be defined in frontmatter or inline with `#tag-name`.

#example-inline-tag

## Graph View

The graph view shows all notes as nodes and wikilinks as edges. Larger nodes have more backlinks.

- Click a node to open the note
- Scroll to zoom, drag to pan

## Search

Press `⌘K` (or `Ctrl+K`) to open the search dialog. Notes are indexed by title, content, and tags using fuzzy search.

## Back to basics

Start from [[Welcome]] or follow the [[Getting Started]] guide.
