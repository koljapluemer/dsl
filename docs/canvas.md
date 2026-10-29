# Canvas

Any note can be opened as a canvas (the Canvas tab, `/canvas?open=<file>`):
an infinite plane of free Markdown text and linked notes. Like Document, it is
a workspace for a note, not a note type. This describes how it's stored and
the state machine that keeps nodes from getting lost; the per-view tour is in
the [README](../README.md#canvas).

## Stored format

The canvas is the key `canvas` in the host note's `data` block:

```yaml
canvas:
  nodes:
  - id: k3f9a2c1
    x: 120
    y: -40
    text: |-
      Some **markdown**
  - id: a8d2c1e0
    x: 300
    y: 200
    note: three-laws-a1b2c3
```

- `nodes` are in z-order. Each has a unique `id` (made by the page, never
  reused for another node), a flow position `x`/`y` (its top left), and
  exactly one of `text` (Markdown) or `note` (a note's name without `.txt`,
  as relationship targets are).
- Nothing is written when a note is opened as a canvas; the first change adds
  the key (and the `data` block, at the end of the note, if there's none).
- Linked notes are not relationships: no graph edge, no backlink.

## Server (`dsl_crud/features/canvas`, `core/canvas.py`)

| Endpoint | Does |
|---|---|
| `GET /api/canvases` | the notes with a `canvas` key, the last edited first (the page's list) |
| `GET /api/items/<name>/canvas` | `{nodes, problems, rev, dataError}` |
| `PUT /api/items/<name>/canvas` | `{nodes, rev}` → `{rev}`; 409 when the stored canvas isn't `rev` any more, 400 when it can't be written over |
| `POST /api/canvas/note` | `{text}` → a new note with the text as its body |

- **Reading** (`canvas.read`) never drops anything quietly: a node that isn't
  valid (unknown keys, no id, both or neither of text and note, …) is listed
  in `problems`, an unreadable `data` block in `dataError`. Either makes the
  canvas read-only in the page, and the server refuses to write over it.
- **Writing** reads the note from disk and replaces only the lines of the
  `canvas` key (`edits.set_data_key`, using the YAML node positions); the
  other keys keep their text and comments, and the rest of the note is as it
  is on disk, so edits made to it meanwhile (in the sidebar, say) are kept.
  The result is parsed again and must read back as asked, else nothing is
  written. A flow-style `data` mapping is rewritten whole.
- **`rev`** is a hash of the stored canvas. A write names the one it replaces;
  a hand edit of the canvas in between makes it a 409.
- A new note from text indents its lines that would start the keyword
  section (`edits.body_text`), as the spec asks of writers.

## Page (`frontend/src/pages/workspaces/canvas`)

Three pieces of state, each with one owner:

1. **The canvas** (`canvas-model.ts`): a reducer over the nodes, the only
   truth while the canvas is open. It's loaded once per opening
   (`canvasQuery`, never refetched; Reload opens it again), so nothing the
   server sends later can overwrite what's being done. React Flow's nodes are
   derived from it; drags dispatch `move`, sizes React Flow measures are kept
   beside it. Every action naming a node that isn't there changes nothing, and
   adding or restoring an id that's there does nothing: a late async result
   can't bring back or duplicate a node.
2. **Saving** (`canvas-save.ts`, `CanvasSaver`): each change hands it the
   whole canvas. It writes after a short pause, keeps at most one write under
   way, sends the changes made meanwhile together in the next, with the `rev`
   the last one returned. It holds off while a node is dragged, and writes at
   once when the page is hidden or left. States: `saved`, `pending`,
   `saving`, `error` (the changes are kept for the next write; Retry), and
   `conflict` (a 409: nothing more is written, the canvas is read-only, Reload
   loads what's stored). Opening a canvas waits for a write of it still under
   way (`whenSaved`).
3. **The interaction** (`canvas-interaction.ts`): one union, `idle`,
   `editing` one node, `search` (adding notes at a point), or `busy`
   converting one node, so these exclude each other. An interaction about a
   node that's gone reads as idle.

Rules:

- Leaving an edited text node (Esc, its view tool, a click on the canvas,
  editing another) removes it if it's empty; that's the only removal not asked
  for. Text edits go to the canvas as typed: there's no draft to lose.
- Delete (text) and detach (note) offer undo, which puts the node back at its
  place in the z-order. Deleting a linked note removes its node, then deletes
  the note; undo restores both. A failed delete puts the node back at once.
  Leaving the canvas drops its undo offers, except a deleted note's restore.
- Text → note makes a note of the text (not empty), then turns the node into
  it, in place. Note → text copies the note's body (`noteBody`, as
  `NoteContent` shows it) into a text node, in place; not while the note is
  being edited, so an unsaved edit isn't copied over.
- A linked note that's gone stays on the canvas as "Missing note", to detach.
- Linked notes are the note component (view/edit, written as focus leaves
  them), with their relationships read-only. Their keyword blocks (`extra`,
  `data`, …) are folded at first; a tool shows them (kept per node while the
  canvas is open, not stored). A note also open elsewhere with older canvas data in an unsaved edit
  can still write over the canvas; the next canvas write is then a conflict.
