---
title: Deep Note
tags:
  - folders
  - nesting
  - test
---

# Deep Note

This note is located at `Folders/Level 1/Level 2/Deep Note.md` — three levels deep in the folder hierarchy.

It tests that the 4-pass folder algorithm correctly creates all ancestor folders:

1. `Folders/` — top-level folder
2. `Folders/Level 1/` — second-level folder
3. `Folders/Level 1/Level 2/` — third-level folder (immediate parent)

## Expected Sidebar Behaviour

In the left sidebar, this note should appear like:

```
▾ Folders
  ▾ Level 1
    ▾ Level 2
        Deep Note        ← this note
```

Each level is independently collapsible.

## Expected Graph Behaviour

This note appears as a small node in the graph view. It receives a backlink from [[Hub Note]], which links to it explicitly.

## Path-Based ID

This note's ID is derived from its vault-relative path:

- Path: `Folders/Level 1/Level 2/Deep Note.md`
- ID: `folders-level-1-level-2-deep-note`

Wikilinks like `[[Deep Note]]` resolve via the basename-match fallback (tier 3).

See also: [[Hub Note]], [[Welcome]].
