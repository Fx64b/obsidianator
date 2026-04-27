---
title: Lists
tags:
  - formatting
  - lists
---

# Lists

## Unordered Lists

- Item one
- Item two
- Item three

Dashes, asterisks, and pluses all work:

* Asterisk item
* Another asterisk item

+ Plus item
+ Another plus item

## Nested Unordered Lists

- Level 1
  - Level 2
    - Level 3
      - Level 4
  - Back to level 2
- Back to level 1

## Ordered Lists

1. First item
2. Second item
3. Third item

Numbering doesn't have to be sequential in markdown:

1. First
1. Second (still renders as 2)
1. Third (still renders as 3)

## Nested Ordered Lists

1. First
   1. First sub-item
   2. Second sub-item
      1. Deep sub-item
2. Second
3. Third

## Mixed Nested Lists

1. Ordered item
   - Unordered nested
   - Another unordered nested
     1. Ordered inside unordered
     2. Second ordered inside
2. Back to ordered

## Task Lists

- [x] Completed task
- [x] Another completed task
- [ ] Incomplete task
- [ ] Another incomplete task
  - [x] Nested completed
  - [ ] Nested incomplete

## Lists with Continuation Paragraphs

1. First item

   This paragraph continues the first item. It is indented to match.

2. Second item

   Another continuation paragraph. Lists can contain multiple paragraphs.

   Even a third paragraph for the same item.

3. Third item has just one line.

## Lists with Code

- Run `npm install` to install dependencies
- Then `npm run build` to build
- Finally `npm start` to run

## Lists with Links

- See [[Basic Formatting]] for inline styles
- See [[Tables]] for table formatting
- See [[Code Blocks]] for code examples

#lists #test
