---
title: Frontmatter Advanced
tags:
  - obsidian
  - frontmatter
date: 2024-03-15
created: 2024-01-01T09:00:00
author: Fx64b
status: published
priority: 2
is_draft: false
reviewed: true
source: https://obsidian.md
related:
  - Frontmatter
  - Tags
rating: 4.5
word_count: 1250
aliases:
  - Properties Advanced
  - Metadata Test
---

# Frontmatter Advanced

This note tests all frontmatter field types that the FrontmatterPanel should render correctly.

## Field Types Tested

| Field | Type | Expected Rendering |
|-------|------|--------------------|
| `date` | date string | formatted date |
| `created` | ISO timestamp | formatted date |
| `author` | plain string | plain text |
| `status` | plain string | plain text |
| `priority` | integer | number |
| `is_draft` | boolean false | "No" badge |
| `reviewed` | boolean true | "Yes" badge |
| `source` | URL | clickable link |
| `related` | string array | badges (note links) |
| `rating` | float | number |
| `word_count` | integer | number |
| `aliases` | string array | badges |

## Aliases

The `aliases` field (`- Properties Advanced`, `- Metadata Test`) should allow wikilinks like `[[Properties Advanced]]` to resolve to this note.

See also: [[Frontmatter]], [[Tags]].
