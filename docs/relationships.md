# Relationships and backlinks

A relationship is either an explicit line `-> label @target` (or `-> @target`)
in the keyword section, or an inline reference `[[target]]` / `[[target|text]]`
in the body or a `text` block (`extra`, `publish`). API relationship values always carry `inline: boolean`;
display text never becomes a semantic label.

A note's **backlinks** are relationships in other notes whose target is it.
Explicit backlinks can be detached and relabeled through the relationship
controls. Inline ones are read-only there, because removing markup from prose
implicitly would be surprising; they're edited in their note's text. Repeated inline references from one source to
one target form one indexed relationship and backlink.

## Server

| Endpoint                              | Does                                                                         |
|---------------------------------------|------------------------------------------------------------------------------|
| `POST /api/items/<name>/relate`       | adds a line to `<name>`: `{label, target}` an existing note, `{label, text}` a new one |
| `POST /api/items/<name>/detach`       | removes `<name>`'s first line with `{label, target}` (target without `.txt`) |
| `POST /api/items/<name>/relabel`      | gives `<name>`'s first line with `{label, target}` the label `nextLabel` |
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
so `itemsChanged` refetches it), the mutations `relateItem`, `detachItem`,
`relabelItem` and `addBacklink`, and in `dsl/relation.ts` the same changes as
text transforms (`addRelation`, `removeRelation`, `relabelRelation`, tested
against the server's results).

`features/item-relate` is the one relationships widget, part of the note
component ([`note-component.md`](note-component.md), which describes how it
looks and when changes are staged or written at once):

- `relationModel.ts`: `rowsOf`, the rows from the note's text, its
  backlinks and the staged `PendingOp`s.
- `useRelationOps.ts`: what adding, detaching, relabeling and deleting do
  under the note's commit policy; `runPending` writes the staged ops once the
  note is saved.
- `Relationships`, `RelationRow`, `RelationAdder` (direction, label and a
  `NotePicker`, which picks an existing note from search or makes a new one).

In the item editor, `referenceLinks` (`entities/item/dsl/referenceLinks.ts`)
marks inline references as targets and opens a Ctrl/Cmd-clicked inline
reference or `@target` with the opener it's given (`ItemTextEditor` passes
`useOpenNote`, the sidebar), a middle-clicked one in a new tab (`noteHref`, the
current page), and, on touch screens (`pointer-coarse`), shows an "open" button
above the reference the cursor is on. `itemInlineReferences` (`inlineRefs.ts`)
finds the inline references that count, in the body and `text` blocks; the editor
and the widget both use it.

Features can't import each other, so deleting a note is passed in as
`deleteItem` (`useDeleteItem()`), which also gives undo.
