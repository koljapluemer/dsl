# Relationships and backlinks

A relationship is either an explicit line `-> label @target` (or `-> @target`)
in the keyword section, or an inline reference `[[target]]` / `[[target|text]]`
in the body or `extra`. API relationship values always carry `inline: boolean`;
display text never becomes a semantic label.

A note's **backlinks** are relationships in other notes whose target is it.
Explicit backlinks can be detached through the relationship controls. Inline
backlinks instead open their source editor, because removing markup from prose
implicitly would be surprising. Repeated inline references from one source to
one target form one indexed relationship and backlink.

## Server

| Endpoint                              | Does                                                                         |
|---------------------------------------|------------------------------------------------------------------------------|
| `POST /api/items/<name>/relate`       | adds a line to `<name>`: `{label, target}` an existing note, `{label, text}` a new one |
| `POST /api/items/<name>/detach`       | removes `<name>`'s first line with `{label, target}` (target without `.txt`) |
| `GET /api/items/<name>/backlinks`     | `[{file, label, heading, inline}]`; explicit lines individually, inline references once per source |
| `POST /api/items/<name>/backlinks`    | `{label, source}` adds a line to the existing note `source`; `{label, text}` creates a note with `text` and the line. Returns the backlinks |

`POST /api/sources/resolve` with `text` adds `-> source @<file>` lines to that
text for sources pasted as BibTeX in a note's editor (`sources.link`, skipping
ones already there); the note is then saved as usual.

Backlinks are found through the index's `incoming` map (`store._Index`), then
each linking note is parsed again. The index records every entry as
`(source, label, inline)`. An unlabeled explicit relationship is `related` in
the graph but `''` in the detach API; an inline one is always `label: ''` and
`inline: true`. Backlinks are only returned for an existing target.

The graph includes both kinds. Inline edges are dashed, unlabeled and open the
source editor when clicked. If an explicit relationship exists in the same
direction between two notes it suppresses the inline graph edge. The inline
reference and backlink still exist. Inline relationships count for connected
and orphan filtering, but do not satisfy domain-specific explicit labels such
as `project`.

## Frontend

`entities/item`: `backlinksQuery(file)` (key `['items', 'backlinks', file]`,
so `itemsChanged` refetches it), `addBacklink`, and `relateItem`/`detachItem`.

`features/item-relate` holds the pieces, each with an optional `compact` prop
(small inputs and buttons, the new-note button icon only, no heading) for tight
spots such as a table row:

- `RelationRow` — one relationship: `label →` (`direction="out"`) or
  `← label` (`"in"`), the other note's heading linking to its editor. Inline
  rows carry an `inline` badge and no detach/delete controls.
- `RelationAdder` — a label (any, possibly empty; Enter moves on) and a
  `NotePicker`, which picks an existing note from search or makes a new one.
- `Relationships` — a note's own relationships, read from its text; writes go
  through `flush` so pending edits are saved first. Used by the editor and the
  questions view.
- `Backlinks` — `{file, deleteItem, compact?}`: the saved note's backlinks,
  from the server. Used in the sources list (a row's chevron, collapsed by
  default, `compact`) and at the bottom of the source form.

In the item editor, `referenceLinks` (`entities/item/dsl/referenceLinks.ts`)
marks inline references as targets and opens a Ctrl/Cmd-clicked inline
reference or `@target` in a new tab. `itemInlineReferences` (`inlineRefs.ts`)
finds the inline references that count, in the body and `extra`; the editor
and `Relationships` both use it.

Features can't import each other, so deleting a note is passed in as
`deleteItem` (a page's `useDeleteItem()`), which also gives undo.

To show backlinks in another view, render `<Backlinks file={…} deleteItem={useDeleteItem()} />`
for a note that exists; it refetches after any write through `itemsChanged`.
