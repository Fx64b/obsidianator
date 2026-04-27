---
title: Obsidian Inline Syntax
tags:
  - formatting
  - obsidian
  - inline
---

# Obsidian Inline Syntax

This note tests Obsidian-specific inline formatting that goes beyond standard markdown.

## Highlight

Use `==text==` to highlight text in Obsidian:

The ==highlighted word== stands out in the text.

You can highlight ==multiple words in a row== without issue.

Highlights inside a sentence: this is ==very important== and should be noticed.

## Superscript

Use `^text^` for superscript:

Einstein's famous equation: E = mc^2^

Chemical notation: CO^2^ and H^+^

Footnote-style: see note^1^ for details.

## Subscript

Use `~text~ ` for subscript:

Water molecule: H~2~O

Carbon dioxide: CO~2~

Caffeine: C~8~H~10~N~4~O~2~

## Combined

A note^1^ with H~2~O and ==highlighted== content and mc^2^ equations.

## Image Sizing

Embed images with a custom width using `![[image.png|200]]`:

- `![[image.png|300]]` — sets width to 300px
- `![[image.png|200x150]]` — sets width × height
- `![[image.png]]` — natural size (default)

## Custom Checkbox States

Obsidian supports additional task states beyond `[ ]` and `[x]`:

- [x] Completed task (standard GFM)
- [ ] Incomplete task (standard GFM)
- [-] Cancelled task
- [/] In-progress task
- [!] Important task
- [?] Question / needs clarification
- [*] Starred / bookmarked
- [>] Forwarded / delegated

See also: [[Basic Formatting]], [[Lists]].
