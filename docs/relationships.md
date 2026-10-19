# Relationships and backlinks

A relationship is a line `-> label @target` (or `-> @target`) in the note it
starts from. A note's **relationships** are the lines in it; its **backlinks**
are those lines in other notes whose target is it. Both are edited by changing
the note that holds the line, so a backlink is added to, or detached from, the
*other* note.

## Server

| Endpoint                              | Does                                                                         |
|---------------------------------------|------------------------------------------------------------------------------|
| `POST /api/items/<name>/relate`       | adds a line to `<name>`: `{label, target}` an existing note, `{label, text}` a new one |
| `POST /api/items/<name>/detach`       | removes `<name>`'s first line with `{label, target}` (target without `.txt`) |
| `GET /api/items/<name>/backlinks`     | `[{file, label, heading}]`, one per line in another note pointing to `<name>` |
| `POST /api/items/<name>/backlinks`    | `{label, source}` adds a line to the existing note `source`; `{label, text}` creates a note with `text` and the line. Returns the backlinks |

Backlinks are found through the index's `incoming` map (`store._Index`), then
each linking note is parsed again: the index stores an unlabeled relationship
as `related` (what the graph shows), but `detach` needs the label as written,
`''`. Backlinks are only those from existing notes; a line pointing at a note
that doesn't exist yet becomes one as soon as the note is created.

## Frontend

`entities/item`: `backlinksQuery(file)` (key `['items', 'backlinks', file]`,
so `itemsChanged` refetches it), `addBacklink`, and `relateItem`/`detachItem`.

`features/item-relate` holds the pieces, each with an optional `compact` prop
(small inputs and buttons, the new-note button icon only, no heading) for tight
spots such as a table row:

- `RelationRow` — one relationship: `label →` (`direction="out"`) or
  `← label` (`"in"`), the other note's heading linking to its editor, detach,
  delete the other note.
- `RelationAdder` — a label (any, possibly empty; Enter moves on) and a
  `NotePicker`, which picks an existing note from search or makes a new one.
- `Relationships` — a note's own relationships, read from its text; writes go
  through `flush` so pending edits are saved first. Used by the editor and the
  questions view.
- `Backlinks` — `{file, deleteItem, compact?}`: the saved note's backlinks,
  from the server. Used in the sources list (a row's chevron, collapsed by
  default, `compact`) and at the bottom of the source form.

Features can't import each other, so deleting a note is passed in as
`deleteItem` (a page's `useDeleteItem()`), which also gives undo.

To show backlinks in another view, render `<Backlinks file={…} deleteItem={useDeleteItem()} />`
for a note that exists; it refetches after any write through `itemsChanged`.
