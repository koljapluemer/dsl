# Item language

A plain-text language for items (appointments, recurring events, and later
other kinds of notes). One item per file. Files are meant to be written by
hand and read by several frontends.

The spec has two parts:

- **This document**: the syntax, which knows no individual keywords and rarely
  changes.
- **[`keywords.yaml`](keywords.yaml)**: every keyword, its arguments, and what
  it means. Extending the language mostly means editing that file.

## File structure

```
HCI lecture 4pm-7pm            ← title
(bring laptop)                 ← description
                               ← description (blank lines are kept)
recurring mo until 27-03       ← boundary: first line starting with a primary keyword
iterable d 4 0.4               ← keyword section
```

An item has three parts, in this order:

1. **Title**: the first non-blank line, without its surrounding whitespace.
   It is never parsed for keywords, so `appointment w/ dentist` is a fine
   title.
2. **Description**: every line after the title, up to the boundary.
   - Lines are kept verbatim.
   - Leading and trailing blank lines are dropped; blank lines in between are
     kept.
3. **Keyword section**: starts at the **boundary**, which is the first line
   after the title that starts, at column 0, with a **primary** keyword (see
   `role` in `keywords.yaml`). It runs from that line to the end of the file.

Only primary keywords can start the keyword section. So adding a new
*modifier* keyword can never change how existing files parse. Adding a new
*primary* keyword can, but only for files that have a description line
starting with exactly that word at column 0. Check existing data for this
before adding one.

## Keyword section

Each line is trimmed, and blank lines are ignored. A line holds one or more
**clauses**:

```
clause = keyword arg* (option value)*
```

- **keyword**: a token made of `a-z` only.
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
`\"` inside it is a literal quote. Quoted
tokens are reserved for `text` values; no keyword uses them yet.

A line in the keyword section starting with `(` is reserved for state that
frontends write back (e.g. "last generated", "next action"). Its format is not
specified yet. Until then it is treated like an unknown keyword line.

## Value types

| type      | form       | meaning                                                         |
| --------- | ---------- | --------------------------------------------------------------- |
| `date`    | `yy-mm-dd` | year 20yy. Must be a real calendar date (`26-02-30` is invalid). |
| `month`   | `yy-mm`    | a whole month, year 20yy                                        |
| `weekday` | `mo tu we th fr sa su` |                                                     |

An argument or option declared with several types (e.g. `[date, month]`)
accepts any of them. The value's form decides which type it is.

## Validity

An item is **valid** when it parses with no errors. Warnings never make an
item invalid.

### Errors

Errors are identified by these codes, plus the line they occur on.

| code                   | when                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `empty`                | the file has no non-blank line, so there is no title                   |
| `no_primary`           | no line after the title starts with a primary keyword                  |
| `missing_arg`          | a keyword has fewer arguments than its `args` declares, or an option has no value |
| `invalid_value`        | an argument or option value doesn't match its type                     |
| `unexpected_token`     | a leftover token that is neither a known keyword nor an option of the current one |
| `duplicate_keyword`    | the same keyword appears twice in one item, or the same option twice in one clause |
| `conflicting_keywords` | two keywords listed in each other's `excludes` both appear             |

### Warnings

| code              | when                                     |
| ----------------- | ---------------------------------------- |
| `unknown_keyword` | see [Unknown keywords](#unknown-keywords) |

Frontends should show both invalid items and warnings in a "needs attention"
view rather than hiding them.

## Versioning

`keywords.yaml` has a `version` number. Increase it on every change that
affects parsing or meaning.
- Adding keywords keeps old files valid.
- Removing a keyword, renaming one, or changing its arguments does not keep
  old files valid. Note any such change in the file's `changes` list.
