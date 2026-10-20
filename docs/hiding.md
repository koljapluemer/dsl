# Hiding notes from a view

A view can leave notes out by their type (primary keyword) or their tags. What
it hides is fixed in code, not set by the user.

## The pattern

`views.Hiding` (in `views.py`) describes one view:

- `tag` — the view's own tag; the view's hide button adds it to a note
- `types` — primary keywords whose notes the view leaves out
- `tags` — further tags that hide a note (none used yet)

`hiding.hides(primary, tags)` says whether a note is out. The per-view
instances sit right below the class; **edit them there**:

| View  | Instance        | Tag        | Hidden types                          |
|-------|-----------------|------------|---------------------------------------|
| Queue | `QUEUE_HIDING`  | `no-q`     | `appointment`, `recurring`, `source`  |
| Float | `FLOAT_HIDING`  | `no-float` | `appointment`, `recurring`, `source`  |
| Graph | `GRAPH_HIDING`  | `no-graph` | `appointment`, `recurring`            |

`tests/test_views.py` checks that every listed type is a primary keyword and
every tag is a valid tag.

## Where it applies

Each view filters at the one place it reads the index, so nothing downstream
needs to know:

- Queue: `store.queue_draw`.
- Float: `store.float_draw`.
- Graph: `graph._View`, so hidden notes are gone from the canvas, its search
  (`search.py`'s `graph` scope) and random alike, and relationships to them are
  left out like those to notes with errors. The Notes tab's search still finds them.

## Hide button and undo

`store.hide(name, hiding)` adds `hiding.tag` to the note's `tags` line (or
appends one). Each view undoes it the way it undoes deletes:

- Queue: `POST /api/queue/hide/<name>`. The page drops the item from the batch
  on screen and offers the app-wide undo toast (`dumb/undo.ts`), which writes
  back the note's previous text and puts the item back in its place.
- Float: `POST /api/float/hide/<name>`, from a card or its modal. The page drops
  the card and offers the same undo toast, which writes back the previous text
  (the card stays gone).
- Graph: `POST /api/graph/notes/<name>/hide` → `graph.hide`, which keeps the
  previous text in the graph's single undo slot (shared with deletes);
  `POST /api/graph/undo` writes it back. The canvas unpins the note and re-pins
  it on undo, as for a delete.

## Adding hiding to another view

1. Add an instance next to the others in `views.py`.
2. Filter that view's reads with `instance.hides(e.primary, e.tags)`.
3. For a button: an endpoint calling `store.hide(name, instance)`, and an undo
   that writes back the previous text; the note panel shows it given `hide`
   (`meta/note-panel/NotePanel.tsx`).

The questions view's `no-questions` tag (`questions.NO_QUESTIONS_TAG`) predates
this and works separately.
