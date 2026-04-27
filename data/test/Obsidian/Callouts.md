---
title: Callouts
tags:
  - obsidian
  - callouts
  - admonitions
---

# Callouts

Obsidian supports callout blocks using the `> [!TYPE]` syntax.

## Standard Callout Types

> [!NOTE]
> This is a **note** callout. Use it for general information that is helpful but not critical.

> [!INFO]
> This is an **info** callout. Similar to NOTE, used for informational content.

> [!WARNING]
> This is a **warning** callout. Use it to alert readers to potential issues or things to be careful about.

> [!DANGER]
> This is a **danger** callout. Use it for critical warnings about destructive or irreversible actions.

> [!ERROR]
> This is an **error** callout. Use it to describe error conditions.

> [!TIP]
> This is a **tip** callout. Use it for helpful hints and best practices.

> [!HINT]
> This is a **hint** callout. Similar to TIP.

> [!SUCCESS]
> This is a **success** callout. Use it to indicate a positive outcome or completed action.

> [!BUG]
> This is a **bug** callout. Use it to describe known bugs or unexpected behavior.

> [!EXAMPLE]
> This is an **example** callout. Use it to show practical examples.

> [!QUOTE]
> This is a **quote** callout. Use it for notable quotations or references.

## Callouts with Custom Titles

> [!NOTE] Custom Title Here
> The title after the type overrides the default.

> [!WARNING] Destructive Action
> This will permanently delete your data. Make sure you have a backup.

> [!TIP] Pro Tip
> Use `make dev-export` during development — it watches for vault changes and auto-reloads.

## Collapsed Callouts

The `-` suffix makes a callout collapsed by default (click the title to expand):

> [!NOTE]- Collapsed by default
> This content is hidden until the user clicks the title. Useful for spoilers or supplementary info.

> [!WARNING]- Click to see the warning
> This is a potentially scary warning that you might want to hide by default.

## Multi-Paragraph Callouts

> [!INFO] Multi-paragraph example
> This is the first paragraph of the callout body.
>
> This is the second paragraph. Callouts can contain multiple paragraphs.
>
> - They can also have lists
> - And other markdown elements

## Callouts with Code

> [!EXAMPLE] Running the exporter
> Install and run with:
>
> ```bash
> go install github.com/Fx64b/obsidianator@latest
> obsidianator export ./my-vault --output ./dist --serve
> ```

## ad-* Admonition Syntax

The `ad-*` fenced block syntax is also supported (alternative format):

```ad-note
title: Alternative Syntax
This is written using the ad-note fenced block syntax, which some Obsidian plugins use.
```

```ad-warning
title: Another Format
The ad-* syntax also supports all callout types.
```

See also: [[Blockquotes]], [[Frontmatter]], [[Tags]].
