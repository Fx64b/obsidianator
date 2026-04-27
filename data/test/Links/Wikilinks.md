---
title: Wikilinks
tags:
  - links
  - wikilinks
---

# Wikilinks

Obsidianator supports all forms of Obsidian wikilink syntax.

## Basic Wikilinks

Plain link: [[Welcome]]

Link to a note in a subfolder: [[Basic Formatting]]

Link using full path title: [[Code Blocks]]

## Aliased Wikilinks

Link with custom display text: [[Welcome|Start here]]

Link with alias to subfolder note: [[Basic Formatting|Formatting guide]]

## Wikilinks with Anchors

Link to a specific heading: [[Code Blocks#Go]]

Link with anchor and alias: [[Code Blocks#TypeScript|TypeScript example]]

## Case-Insensitive Links

These should all resolve to the same note:

- [[welcome]]
- [[WELCOME]]
- [[Welcome]]

## Wikilinks in Different Contexts

### In a List

- [[Welcome]] — start here
- [[Getting Started]] — installation guide
- [[Features]] — full feature list

### In a Table

| Note | Description |
|------|-------------|
| [[Welcome]] | Introduction |
| [[Getting Started]] | How to use |
| [[Features]] | Feature overview |

### In a Blockquote

> See [[Welcome]] for an overview and [[Getting Started]] for setup instructions.

## Broken / Non-Existent Wikilinks

These links should render as broken (strikethrough):

- [[This Note Does Not Exist]]
- [[Also Missing]]
- [[NonExistentNote|with alias]]

## Self-Link

[[Wikilinks]] (link to this very note)

## Links to Deep Notes

[[Deep Note]] — note in a deeply nested folder

See also: [[External Links]], [[Embeds]].
