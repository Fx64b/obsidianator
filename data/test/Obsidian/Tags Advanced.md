---
title: Tags Advanced
tags:
  - obsidian
  - tags/frontmatter
  - tools/cli
  - tools/obsidian
  - project/obsidianator
---

# Tags Advanced

This note tests hierarchical/nested tag syntax and various tag edge cases.

## Hierarchical Tags (Frontmatter)

The frontmatter above uses nested tags with `/` separators:
- `tags/frontmatter` — a tag under the `tags` namespace
- `tools/cli` — under `tools`
- `tools/obsidian` — sibling of `tools/cli`
- `project/obsidianator` — under `project`

## Inline Hierarchical Tags

Inline tags also support nesting: #tools/vite is a nested inline tag.

You can also write #obsidian/plugins or #workflow/daily for deeper nesting.

## Tag Edge Cases

Tags must start with a letter: #123invalid won't be parsed as a tag.

Tags can contain digits after the first char: #tag1 and #my-tag and #my_tag.

Tags stop at punctuation: the tag in "see #obsidian." ends before the period.

## Multiple Tags on One Line

Tagged as #status/done and #priority/high and #type/note.

See also: [[Tags]], [[Frontmatter]].
