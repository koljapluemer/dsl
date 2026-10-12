# Item language

A plain-text language for items: notes, appointments, recurring events, and
later other kinds. One item per file. Files are meant to be written by hand
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
extra                              ← extra marker
Long-form text, kept verbatim      ← extra content, up to the end of the file
```

An item has up to three parts, in this order:

1. **Body**: every line from the first non-blank line up to the boundary.
   - Lines are kept verbatim.
   - Leading and trailing blank lines are dropped; blank lines in between are
     kept.
   - The first non-blank line is never a boundary, so `appointment w/ dentist`
     is a fine first line.
2. **Keyword section**: starts at the **boundary** and runs up to the extra
   marker, or to the end of the file when there is none.
3. **Extra**: starts at the extra marker and runs to the end of the file.

An item with only a body is valid: it is just a note. Primary keywords are
optional.

### Boundary

The boundary is the first line after the first body line that is a **section
opener**. A section opener starts at column 0 and is one of:

- a keyword whose `role` opens a section (`primary` or `property`, see
  `keywords.yaml`), followed by whitespace or the end of the line
- a [relationship line](#relationship-lines): `->` followed by whitespace,
  whose last token starts with `@`
- the [extra marker](#extra)
- a [state line](#state-lines): `(` directly followed by a keyword whose role
  is `state`, then whitespace, `)` or the end of the line

`modifier` keywords never open the section, so adding a modifier never changes
how existing files parse. Adding a keyword that does open it can: but only for
files with a body line that starts with exactly that word at column 0. Check
existing data before adding one.

**Escaping**: to keep a body line that would be a section opener, indent it.
Writers that produce body text indent such lines by one space.

### Extra

The **extra marker** is a line that holds only `extra` at column 0 (trailing
whitespace allowed). Every line after it, to the end of the file, is the
item's extra content:

- Lines are kept verbatim and never parsed, so they may look like keywords,
  relationships or state lines.
- Leading and trailing blank lines are dropped.
- There must be at least one non-blank line (`empty_extra` otherwise).

The first extra marker is the one that counts; a later `extra` line is
content.

## Keyword section

Each line is trimmed, and blank lines are ignored. Lines may come in any
order. A line is:

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

A `state` keyword in a clause line is an `unexpected_token`; it belongs in a
state line.

### Relationship lines

```
-> [label …] @target
```

A directed relationship from this item to another one.

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
| `duplicate_keyword`    | the same keyword appears twice in one item, or the same option twice in one clause |
| `conflicting_keywords` | two keywords listed in each other's `excludes` both appear             |
| `invalid_relation`     | see [Relationship lines](#relationship-lines)                          |
| `invalid_state`        | see [State lines](#state-lines)                                        |
| `empty_extra`          | the extra marker is not followed by a non-blank line                   |

### Warnings

| code              | when                                     |
| ----------------- | ---------------------------------------- |
| `unknown_keyword` | see [Unknown keywords](#unknown-keywords) |

Frontends should show both invalid items and warnings in a "needs attention"
view rather than hiding them.

## Conformance

[`examples/`](examples) holds pairs of `<case>.txt` and `<case>.json`. The
JSON gives the expected parse of the text file. A parser conforms when its
result matches every key the JSON lists; absent keys aren't checked.

| key         | value                                                            |
| ----------- | ---------------------------------------------------------------- |
| `body`      | the body lines joined with `\n`, or `null` for an empty file    |
| `clauses`   | `[{keyword, line, args, options}]`, values as their token text  |
| `relations` | `[{label, target, line}]`                                        |
| `state`     | `[{keyword, line, args, options}]`, like `clauses`              |
| `unknown`   | unknown keyword lines from the keyword on; whole state lines    |
| `extra`     | the extra lines joined with `\n`, or `null` when there is none  |
| `errors`    | `[{code, line}]`, sorted by line (`null` first), then code      |
| `warnings`  | `[{code, line}]`, sorted the same way                            |

Lines are 1-based. A quoted token's text is its content without the quotes.

## Versioning

`keywords.yaml` has a `version` number. Increase it on every change that
affects parsing or meaning.
- Adding keywords keeps old files valid.
- Removing a keyword, renaming one, or changing its arguments does not keep
  old files valid. Note any such change in the file's `changes` list.
