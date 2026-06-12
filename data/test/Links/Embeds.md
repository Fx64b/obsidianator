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

Embed just one section of a note — subsections included, with a deep-linked
attribution:

![[Welcome#What it does]]

![[Transclusion#A Reusable Section]]

## Block Transclusion

Embed a single block tagged with a `^block-id`:

![[Transclusion#^key-fact]]

![[Transclusion#^tagged-quote]]

![[Transclusion#^table-block]]

Link (rather than embed) a block: [[Transclusion#^key-fact|the key fact]].

An anchor that doesn't resolve falls back gracefully: ![[Welcome#No Such Section]]

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
