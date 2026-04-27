---
title: Frontmatter
aliases:
  - YAML frontmatter
  - Note properties
tags:
  - obsidian
  - frontmatter
  - yaml
author: Fx64b
status: published
priority: 1
featured: true
draft: false
created: 2024-01-15
updated: 2024-03-20
website: https://github.com/Fx64b/obsidianator
related:
  - Tags
  - Callouts
  - Blockquotes
---

# Frontmatter

Obsidian notes can have YAML frontmatter between `---` delimiters at the top of the file.

## What is Frontmatter?

Frontmatter is structured metadata attached to a note. It's written in YAML and must appear at the very start of the file.

```yaml
---
title: My Note
tags:
  - example
  - test
author: Someone
date: 2024-01-15
---
```

## Supported Field Types

The Properties panel in the right sidebar renders these intelligently:

| Type | Example | Rendered as |
|------|---------|-------------|
| String | `author: Fx64b` | Plain text |
| Number | `priority: 1` | Number |
| Boolean | `featured: true` | Green "Yes" badge |
| Boolean | `draft: false` | Muted "No" badge |
| Date | `created: 2024-01-15` | Formatted date |
| URL | `website: https://...` | Clickable link |
| Array | `tags: [a, b]` | Badge list |
| Note ref | `related: Tags` | Clickable wikilink |

## Skipped Fields

These fields are shown elsewhere in the UI and skipped in the Properties panel:

- `tags` — shown as badges under the note title
- `aliases` — used for search/linking
- `title` — shown as the page heading
- `cssclass`, `banner`, `publish` — Obsidian-specific, not rendered

## Frontmatter in this Note

This note's own frontmatter (visible in the Properties panel):

- **author** → plain string
- **status** → plain string
- **priority** → number
- **featured** → boolean (Yes)
- **draft** → boolean (No)
- **created** → date (formatted)
- **updated** → date (formatted)
- **website** → URL (clickable)
- **related** → array of note references (clickable badges)

See also: [[Tags]], [[Callouts]], [[Blockquotes]].
