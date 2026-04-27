---
title: Footnotes
tags:
  - advanced
  - footnotes
---

# Footnotes

Markdown supports footnotes via the GFM extension.

## Inline Footnotes

This sentence has a footnote[^1] at the end of it.

Here is another sentence with a second footnote[^2] for testing.

## Named Footnotes

You can use descriptive names instead of numbers[^named] for better readability.

This references the same footnote again[^named].

## Multi-Paragraph Footnote

This sentence uses a longer footnote[^long] that spans multiple paragraphs.

## Footnote Definitions

[^1]: This is the first footnote. It contains a single sentence.

[^2]: This is the second footnote. It can contain **bold text**, *italic text*, and `inline code`.

[^named]: Named footnotes make the source more readable even if they render with numbers.

[^long]: This is the first paragraph of a long footnote.

    This is the second paragraph. Footnotes can span multiple paragraphs when you indent the continuation.

    - They can also contain lists
    - Like this one

## Footnotes with Links

This footnote[^link] contains a link.

[^link]: See the [GitHub repository](https://github.com/Fx64b/obsidianator) for source code.

## Inline Style (if supported)

Some parsers support inline footnote syntax: ^[This is an inline footnote without a separate definition.] — support varies by renderer.

See also: [[Long Document]], [[Basic Formatting]].
