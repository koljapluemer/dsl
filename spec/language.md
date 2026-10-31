# Item language

A plain-text language for items: notes, appointments, recurring events,
bibliographic sources, projects and their issues, daily notes, and later other kinds. One item per file. Files are meant to be written by hand
and read by several frontends.

The spec has two parts:

- **This document**: the syntax. It knows no individual keywords and rarely
  changes.
- **[`keywords.yaml`](keywords.yaml)**: every keyword, its arguments, and what
  it means. Extending the language mostly means editing that file.

## File structure

```
HCI lecture 4pm-7pm                ← body (the first line is never parsed)
(bring laptop)                     ← body
                                   ← body (blank lines inside are kept)
recurring mo until 27-03           ← boundary: first line that is a section opener
media images/hci-slides.webp       ← keyword section
-> is part of @semester-plan-a1b2c3
data                               ← block keyword
title: Example                     ← block content (YAML), up to the next keyword
extra                              ← block keyword
Long-form text, kept verbatim      ← block content, up to the next keyword or the end of the file
publish essays/hci                 ← block keyword with an argument
Text as published                  ← block content
```

An item has up to two parts, in this order:

1. **Body**: every line from the first non-blank line up to the boundary.
   - Lines are kept verbatim.
   - Leading and trailing blank lines are dropped; blank lines in between are
     kept.
   - The first non-blank line is never a boundary, so `appointment w/ dentist`
     is a fine first line.
2. **Keyword section**: starts at the **boundary** and runs to the end of the
   file. It holds clause lines, relationship lines, state lines and
   [blocks](#block-keywords), in any order.

An item with only a body is valid: it is just a note. Primary keywords are
optional.

### Inline relationships

Body text and `text` blocks (`extra`, `publish`) may refer to another item inline:

```
This follows [[three-laws-a1b2c3]].
Compare [[three-laws-a1b2c3|Newton's third law]].
```

The target is the other item's file name without `.txt`. It is non-empty and
contains no whitespace, `|`, `[`, `]`, `/` or `\`. Text after `|` is an
optional, non-empty display label; without it frontends show the target's
current heading. Inline relationships are directional and unlabeled: display
text is not a semantic relationship label.

Inline relationships are recognized only in the body and `text` blocks, and not
inside Markdown code spans, fenced code blocks or TeX math (`$…$`, `$$…$$`, as
Pandoc's `tex_math_dollars`: the opening `$` not followed by whitespace, the
closing one not preceded by whitespace nor followed by a digit; `$$…$$` may
span lines but not a blank one). Whichever opens first holds what follows: a
`[[` inside math is math, a `$` inside a reference is part of it. Escape the first `[` (`\[[`)
to keep the syntax as text. Malformed references remain ordinary text, and a
valid reference to a missing item does not make the item invalid.

### Embeds

`![[images/a.webp]]` or `![[images/a.webp|alt text]]` (a `[[` right after `!`)
embeds a file instead: it is never an inline relationship. The target is
non-empty and contains no `|`, `[` or `]` (a `/` is fine); the label, if any, is
non-empty. Embeds are recognized where references are, by the same rules, and
mean something only for a file the item names in a `media` clause: by its path
or, when only one of its files has that name, by its file name
(`![[a.webp]]`). Frontends show anything else as a broken embed; the item stays
valid.

### Flashcards

The body and the `extra` block may hold flashcards: a front to be recalled
and a back that answers it. One fits on a line that starts with `::` at
column 0, its front and back split at the next `::`:

```
::capital of France::Paris
```

Longer ones are a block: a line holding only `::`, the front's lines, a line
holding only `---`, the back's lines, and a line holding only `::` (trailing
whitespace allowed on these three):

```
::
What does $E = mc^2$ say?
---
Mass and energy are equivalent.
::
```

- Front and back are Markdown, with their blank ends dropped; each needs a
  non-blank line. The first `---` splits them, so the back may hold more.
- A `::` line before the `---` line, a missing part or a block that never
  closes is no card: its lines stay ordinary text.
- Lines in a closed [fence](#fences) are never part of a card, and a fence
  inside a card's block is opaque to it.
- Cards change nothing about the [boundary](#boundary): a card line that is a
  section opener still ends the body, and is escaped by indenting it as any
  body line. A `::` line never is one.

A card is identified within its item by its front, trailing whitespace and
blank ends aside: editing the back keeps it the same card, editing the front
makes it another one. Cards with the same front in one item are one card.

### Boundary

The boundary is the first line after the first body line that is a **section
opener**, outside a closed [fence](#fences). A section opener starts at column 0 and is one of:

- a keyword whose `role` opens a section (`primary` or `property`, see
  `keywords.yaml`), followed by whitespace or the end of the line
- a [relationship line](#relationship-lines): `->` followed by whitespace,
  whose last token starts with `@`
- a [block keyword](#block-keywords) alone on its line, or, when it takes
  args, followed by whitespace or the end of the line
- a [state line](#state-lines): `(` directly followed by a keyword whose role
  is `state`, then whitespace, `)` or the end of the line

`modifier` keywords never open the section, so adding a modifier never changes
how existing files parse. Adding a keyword that does open it can: but only for
files with a body line that starts with exactly that word at column 0. Check
existing data before adding one.

**Escaping**: to keep a body line that would be a section opener, indent it.
Writers that produce body text indent such lines by one space.

### Fences

A Markdown fenced code block in the body or a `text` block is opaque: none of
its lines is a section opener or a [block terminator](#block-keywords), so code
needs no escaping. A fence opens on a line with at most three spaces of
indentation followed by three or more `` ` `` or `~`, and closes on the next
line holding only (after at most three spaces) at least as many of the same
character, plus trailing whitespace. The first body line may open one.

A fence that never closes is not opaque: the lines after it are parsed as
usual, and it is an `unclosed_fence` warning. This way typing an opening fence
never swallows the keyword section. Fences in a `yaml` block (`data`) are
YAML like any other text.

Frontends may give fences meaning by their info string (the text after the
opening marker); that is outside this language.

### Block keywords

A keyword with a `block` entry in `keywords.yaml` (`data`, `extra`,
`publish`) holds a multi-line **block**. Its line starts with the keyword at
column 0:

- Without `args` (`data`, `extra`), the line holds only the keyword (trailing
  whitespace allowed): `extra credit` is not a block keyword.
- With `args` (`publish`), the keyword is followed by whitespace or the end of
  the line, and the rest of the line is its args, parsed like a
  [clause](#keyword-section)'s (`missing_arg`, `invalid_value`, and
  `unexpected_token` for anything after them). The line is a clause of the
  item; the block is its content either way.

The block is every line after the keyword up to, not including, the first
**terminator**, or up to the end of the file. In a `text` block, lines inside a
closed [fence](#fences) are never terminators. A terminator is a line that
starts at column 0 and is:

- a known keyword of any role, followed by whitespace or the end of the line
  (a block keyword without args only when it is alone on its line),
- a [relationship line](#relationship-lines) with a valid `@target`,
- a [state line](#state-lines) whose keyword has the role `state`.

An unknown keyword does not terminate a block. To keep a line that would
terminate the block, indent it by one space; indentation is kept.

Block lines are kept verbatim, with leading and trailing blank lines dropped.
Where the keyword section continues after a block, it is parsed as usual, so
blocks and clause lines may interleave. A block keyword appearing twice is a
`duplicate_keyword`. A block keyword inside a clause line is an
`unexpected_token`.

The `block` entry says how the content is read:

| `block` | content                                                                    |
| ------- | -------------------------------------------------------------------------- |
| `text`  | free text, never parsed (`extra`, `publish`)                               |
| `yaml`  | a YAML 1.2 document whose top level is a mapping, read with a safe loader that accepts no custom tags (`data`) |

YAML scalars follow the 1.2 core schema: `2017-06-12` is a string, not a
date. A parser whose library implements YAML 1.1 must not resolve timestamps.

A block needs at least one non-blank line (`empty_extra` for `text` blocks,
`empty_data` for `yaml` blocks). A `yaml` block that is not valid YAML, or
whose top level is not a mapping, is an `invalid_yaml` error on the keyword's
line. Frontends keep the text of blocks they don't edit.

## Keyword section

Each line is trimmed, and blank lines are ignored. Lines may come in any
order. A line is:

- a [block keyword](#block-keywords) line, which starts a block
  (its content lines are not parsed as section lines),
- a [relationship line](#relationship-lines) when it starts with `->`
  followed by whitespace or the end of the line,
- a [state line](#state-lines) when it starts with `(`,
- otherwise a line of **clauses**:

```
clause = keyword arg* (option value)*
```

- **keyword**: a token made of `a-z` only, whose role is `primary`,
  `property` or `modifier`.
- **arg**: the keyword's positional arguments, in the number and order its
  `args` list in `keywords.yaml` gives. All are required.
- **option**: a named, optional sub-keyword of that keyword (e.g. `until`),
  followed by exactly one value. Options may come in any order, and each at
  most once.

A clause ends at the end of the line, or where the next token is a known
keyword. That keyword then starts a new clause on the same line.

```
appointment 26-10-12
recurring mo until 27-03
```

A keyword appears at most once per item, unless `keywords.yaml` marks it
`repeat` (`media`); then each occurrence is a clause of its own.

A keyword marked `line_start` in `keywords.yaml` (`tags`) must be the first
token of its line. Found after another clause on the same line, it is an
`unexpected_token`, and it and the rest of the line are skipped.

A `state` keyword in a clause line is an `unexpected_token`; it belongs in a
state line.

### Relationship lines

```
-> [label …] @target
```

A directed relationship from this item to another one.

Unlike an [inline relationship](#inline-relationships), a relationship line
has an optional semantic label and lives in the keyword section. Both kinds
are backlinks and graph connections; frontends distinguish them explicitly.

- **target**: the last token, without its leading `@`: the other item's file
  name without extension (`@semester-plan-a1b2c3` for
  `semester-plan-a1b2c3.txt`). It is not empty and contains no `/` or `\`.
- **label**: everything between `->` and the target, trimmed, kept verbatim.
  It needs no quoting. An empty label means the relationship is unlabeled.

An item may have any number of relationship lines, duplicates included. A
relationship line whose last token isn't a valid `@target` is an
`invalid_relation`.

Whether the target exists is not part of validity; frontends decide what to do
with dangling relationships.

### State lines

```
(statekey arg* (option value)*)
```

Machine-maintained state that frontends write back (e.g. "last generated").
The whole trimmed line is wrapped in parentheses and holds exactly one clause,
whose keyword has the role `state`.

- A line that starts with `(` but doesn't end with `)`, holds nothing, or
  whose first token isn't `a-z` or is a known keyword of another role, is an
  `invalid_state`.
- A state line whose keyword is unknown is an
  [unknown keyword](#unknown-keywords).

Users aren't expected to write state lines by hand. Frontends must keep the
ones they don't own when rewriting a file.

### Unknown keywords

A token in keyword position that is all `a-z` but isn't in `keywords.yaml` is
an **unknown keyword**.
- That token and the rest of its line are kept as raw text.
- It produces the warning `unknown_keyword`, not an error.

This keeps files written for a newer version of `keywords.yaml` working in
frontends that only know an older one. Because an unknown keyword's arguments
can't be known, the rest of its line is skipped.

So **give each new keyword its own line**.

### Tokens

Tokens are separated by whitespace. A token starting with `"` runs up to the
next `"` (or the end of the line, if there is none) and may contain spaces;
`\"` inside it is a literal quote. Quoted tokens are only accepted as values of
type `path`.

## Value types

| type      | form       | meaning                                                         |
| --------- | ---------- | --------------------------------------------------------------- |
| `date`    | `yy-mm-dd` | year 20yy. Must be a real calendar date (`26-02-30` is invalid). |
| `month`   | `yy-mm`    | a whole month, year 20yy                                        |
| `weekday` | `mo tu we th fr sa su` |                                                     |
| `path`    | `images/a.webp` | a file relative to the item's folder, `/` as separator. Not empty, no leading `/`, no `\`, no `..` segment. Quote it when it contains spaces. |
| `text`    | `clean up` | the rest of the line, trimmed, not empty. |
| `tags`    | `break 10k do-this` | the rest of the line, split on whitespace: one or more tags, each made of `a-z`, `0-9` and `-` only. |
| `route`   | `essays/a-cool-essay` | a published address: one or more segments of `a-z`, `0-9` and `-`, joined by `/`; the last one may instead be `_index` (`essays/_index`, a folder's index page). No leading or trailing `/`, no empty segment. Not quoted. |

`text` and `tags` are **rest-of-line** types: their words are never read as
keywords, and they must be the keyword's only argument and its only type.
A missing value is a `missing_arg`. A `tags` value with a token that isn't a
tag (uppercase, other characters, quoted) is an `invalid_value`.

An argument or option declared with several types (e.g. `[date, month]`)
accepts any of them. The value's form decides which type it is.

## Validity

An item is **valid** when it parses with no errors. Warnings never make an
item invalid.

### Errors

Errors are identified by these codes, plus the line they occur on.

| code                   | when                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `empty`                | the file has no non-blank line                                         |
| `missing_arg`          | a keyword has fewer arguments than its `args` declares, or an option has no value |
| `invalid_value`        | an argument or option value doesn't match its type                     |
| `unexpected_token`     | a leftover token that is neither a known keyword nor an option of the current one |
| `duplicate_keyword`    | the same keyword appears twice in one item (unless it's marked `repeat`), or the same option twice in one clause |
| `conflicting_keywords` | two keywords listed in each other's `excludes` both appear             |
| `invalid_relation`     | see [Relationship lines](#relationship-lines)                          |
| `invalid_state`        | see [State lines](#state-lines)                                        |
| `empty_extra`          | a `text` block (`extra`, `publish`) has no non-blank line              |
| `empty_data`           | a `data` block has no non-blank line                                   |
| `invalid_yaml`         | a `data` block is not valid YAML or not a mapping                      |

### Warnings

| code              | when                                     |
| ----------------- | ---------------------------------------- |
| `unknown_keyword` | see [Unknown keywords](#unknown-keywords) |
| `unclosed_fence`  | see [Fences](#fences)                     |

Frontends should show both invalid items and warnings in a "needs attention"
view rather than hiding them.

## Conformance

[`examples/`](examples) holds pairs of `<case>.txt` and `<case>.json`. The
JSON gives the expected parse of the text file. A parser conforms when its
result matches every key the JSON lists; absent keys aren't checked.

| key         | value                                                            |
| ----------- | ---------------------------------------------------------------- |
| `body`      | the body lines joined with `\n`, or `null` for an empty file    |
| `clauses`   | `[{keyword, line, args, options}]`, values as their token text; a `text` value is one entry, a `tags` value one entry per tag |
| `relations` | `[{label, target, line}]`                                        |
| `state`     | `[{keyword, line, args, options}]`, like `clauses`              |
| `unknown`   | unknown keyword lines from the keyword on; whole state lines    |
| `extra`     | the `extra` block's lines joined with `\n`, or `null` when there is none |
| `publish`   | `{route, text}`: the `publish` clause's route (`null` when it's invalid) and its block's lines joined with `\n`; `null` when there is none |
| `data`      | the `data` block parsed as YAML, or `null` when there is none or it is invalid |
| `flashcards` | `[{front, back, line}]`, `line` the card's first line             |
| `errors`    | `[{code, line}]`, sorted by line (`null` first), then code      |
| `warnings`  | `[{code, line}]`, sorted the same way                            |

Lines are 1-based. A quoted token's text is its content without the quotes.

## Versioning

`keywords.yaml` has a `version` number. Increase it on every change that
affects parsing or meaning.
- Adding keywords keeps old files valid.
- Removing a keyword, renaming one, or changing its arguments does not keep
  old files valid. Note any such change in the file's `changes` list.
