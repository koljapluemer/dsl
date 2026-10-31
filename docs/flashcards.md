# Flashcards

A note's body and `extra` block may hold flashcards, learned in the Learn
tab by spaced repetition. The syntax is part of the item language
([`spec/language.md`](../spec/language.md#flashcards)):

```
Capitals
::capital of France::Paris

::
What does $E = mc^2$ say?
---
Mass and energy are equivalent.
::
```

The parser is `dsl_crud/core/flashcards.py`. Its mirror is
`frontend/src/dumb/flashcards.ts` for Markdown lines, plus
`frontend/src/entities/item/dsl/flashcards.ts` for an item's body and
`extra`. Keep the two in line; the conformance examples
(`spec/examples/flashcards*`) check both.

## Rendering

Wherever a note's Markdown is rendered, each card's front and back are
rendered apart, with a rule between them in a bordered box:
`withCards` in `dumb/markdown.ts`, and `render` in
`infrastructure/markdown.py` for PDF, portfolio and site exports. The
Markdown around a card is rendered as separate pieces, so a list can't run
through a card. The editor marks the `::` and `---` delimiters
(`flashcardDelimiters`, class `tok-card`).

## Identity

A card is identified within its note by `card_id(front)`: the first 12 hex
digits of the SHA-1 of its front, trailing whitespace and blank ends aside.
Editing the back keeps a card's history. Editing the front starts a new card
and drops the old card's state (see below). If two cards in one note have the
same front, they count as one card.

## State

FSRS ([py-fsrs](https://github.com/open-spaced-repetition/py-fsrs), default
`Scheduler()`: 90 % retention, learning steps 1 and 10 minutes, fuzzing) does
the scheduling, on the server. Each reviewed card has one JSON file,
`files/flashcards/<note>-<id>.json`:

```json
{"front": "…", "card": {…Card.to_dict()}, "reviews": [{…ReviewLog.to_dict()}, …]}
```

A card's first review writes this file and names it in a `media` clause of
the note ([`files.md`](files.md)), so it's kept, removed and listed as an
orphan like any other attachment. Later reviews write only the file and
leave the note alone. The file kind `flashcard` (`files/flashcards/*.json`)
is hidden: the note's file list leaves it out.

A review also drops the note's `media` clauses for state files of cards it
no longer has, and deletes those files once nothing references them
(`media.remove`).

## Learn

`features/learn/service.py`:

- `next_card`: from the index's card ids per note (`_Entry.flashcards`),
  picks a random card that is due (`due <= now`), else a random one with no
  state file. The returned payload holds:
  - the card (`file`, `id`, `front`, `back`, FSRS `state`)
  - its note's payload (for refs and embeds)
  - counts (due, new, all)
  - the earliest due time of the rest

  Due times are cached per state file by mtime, so a pick reads only the
  files that changed.
- `review`: rates the card `again`, `hard`, `good` or `easy` and returns the
  next card.

The page (`pages/learn/LearnPage.tsx`) shows the front and Reveal (Space).
Revealed, it shows front and back and the four ratings (1–4). An icon button opens the card's note in the sidebar.

## API

- `GET /api/learn/next`: `{card, item, counts, next_due}`. `card` and `item`
  are null when nothing is due or new.
- `POST /api/learn/review {file, id, rating}`: the next card, as above. 404
  when the note no longer has the card, 400 for an unknown rating.
