---
title: Tags
tags:
  - obsidian
  - tags
  - organization
---

# Tags

Obsidian supports tags both in frontmatter and inline in note content.

## Frontmatter Tags

Tags defined in YAML frontmatter (see the `tags` field at the top of this file):

```yaml
---
tags:
  - obsidian
  - tags
  - organization
---
```

Or as a single string:

```yaml
---
tags: quick-note
---
```

## Inline Tags

Tags can also be used inline in note content using the `#tag` syntax.

Here are some inline tags: #inline-tag #another-tag #test/nested

Tags must start with a letter and can contain letters, numbers, hyphens, slashes, and underscores.

Valid: #tag #my-tag #tag123 #tag/subtag #TAG_NAME

Invalid (not parsed as tags): #123starts-with-number # space-after-hash

## Nested Tags

Obsidian supports hierarchical tags using forward slashes:

#project/obsidianator #project/obsidianator/frontend #status/in-progress #status/done

These create a tag hierarchy in the sidebar.

## Tags in Context

Tags appear inline in text like this #workflow-tag and continue the sentence normally.

A sentence can have #multiple #tags #scattered throughout it.

## Tag Uses

- **Organization** — group related notes by topic
- **Status** — `#status/draft`, `#status/published`
- **Type** — `#type/meeting-notes`, `#type/reference`
- **Project** — `#project/name`
- **Priority** — `#priority/high`, `#priority/low`

See also: [[Frontmatter]], [[Callouts]], [[Blockquotes]].

#obsidian #tags #organization #test
