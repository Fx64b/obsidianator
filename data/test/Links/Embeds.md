---
title: Embeds
tags:
  - links
  - embeds
  - transclusion
---

# Embeds

Obsidianator supports `![[...]]` embed syntax.

## Note Transclusion

Embed an entire note inline:

![[Welcome]]

## Partial Transclusion (Heading Anchor)

Embed just a section of a note (renders full note with attribution):

![[Features]]

## Image Embeds

If image files are present in the vault, they render inline:

![[example.png]]

![[screenshot.jpg]]

## PDF Embeds

PDF files render as an iframe with an "Open PDF" button:

![[document.pdf]]

## Non-Existent Embed

Embedding a file that doesn't exist falls back gracefully:

![[nonexistent-file.png]]

![[missing-note]]

## Wikilink vs Embed

- `[[Note]]` → wikilink (navigates to note on click)
- `![[Note]]` → embed (renders note content inline)

See also: [[Wikilinks]], [[External Links]].
