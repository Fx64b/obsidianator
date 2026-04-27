---
title: Orphan Note
tags:
  - graph
  - orphan
---

# Orphan Note

This note has no outgoing wikilinks and no other note links to it (except Hub Note).

In the graph view, it should appear as a small, relatively isolated node.

## Why Orphan Notes Exist

In a real vault, orphan notes are common:

- Quick captures that haven't been connected yet
- Reference material that stands alone
- Temporary notes that will be deleted
- Notes in early draft state

## What to Do with Orphans

1. **Connect them** — find related notes and add wikilinks
2. **Archive them** — move to an archive folder
3. **Delete them** — if the content is no longer useful
4. **Leave them** — some notes genuinely stand alone

## This Note's State

- **Outgoing links:** 0 (none)
- **Incoming links:** 1 (from [[Hub Note]])
- **Graph appearance:** small node, single edge

This makes it a useful test case for:
- Rendering isolated nodes correctly
- Handling notes with minimal connectivity
- The `val` calculation in graph node sizing
