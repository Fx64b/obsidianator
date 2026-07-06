---
title: Transclusion
tags:
  - links
  - transclusion
  - blocks
---

# Transclusion

Targets for heading and block transclusion. See [[Embeds]] for embeds that
reference this note.

## A Reusable Section

This whole section can be embedded elsewhere with
`![[Transclusion#A Reusable Section]]`.

### Nested Subsection

Subsections are included when their parent heading is embedded.

## Block Targets

This paragraph has a block ID and can be embedded from any note with
`![[Transclusion#^key-fact]]`. The `^key-fact` marker at the end of the line is
invisible in reading view. ^key-fact

> Quoted blocks can be tagged too. ^tagged-quote

| Syntax                | Result           |
| --------------------- | ---------------- |
| `![[Note#Heading]]`   | embeds a section |
| `![[Note#^block-id]]` | embeds a block   |

^table-block

A standalone `^block-id` on its own line (like above) tags the block before it.

## Linking to Blocks

A regular wikilink with a block anchor navigates and scrolls to the block:
[[Transclusion#^key-fact|jump to the key fact]].
