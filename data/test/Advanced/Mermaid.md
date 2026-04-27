---
title: Mermaid Diagrams
tags:
  - advanced
  - mermaid
  - diagrams
---

# Mermaid Diagrams

Mermaid lets you create diagrams from text. Obsidian renders `mermaid` fenced code blocks natively.

> [!WARNING] Not yet rendered
> Obsidianator does not yet render Mermaid diagrams — the code block will display as raw text until Mermaid support is added (see TODO.md).

## Flowchart

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it!]
    B -- No --> D[Debug]
    D --> B
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Vault

    User->>CLI: obsidianator serve ./vault
    CLI->>Vault: ParseVault()
    Vault-->>CLI: VaultData
    CLI-->>User: Serving on :3000
```

## Class Diagram

```mermaid
classDiagram
    class VaultData {
        +string Name
        +Note[] Notes
        +Folder[] Folders
        +Edge[] Edges
    }
    class Note {
        +string ID
        +string Title
        +string[] Tags
        +string[] Links
        +string[] Backlinks
    }
    VaultData --> Note : contains
```

## Pie Chart

```mermaid
pie title File Types in Vault
    "Markdown" : 80
    "Images" : 15
    "PDFs" : 5
```

See also: [[Long Document]], [[Code Blocks]].
