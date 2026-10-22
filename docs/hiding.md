# Hiding notes from a view

A view can leave notes out by their type (primary keyword) or their tags. What
it hides is fixed in code, not set by the user.

## The pattern

`views.Hiding` (in `views.py`) describes one view:

- `tag` — the view's own tag; the view's hide toggle adds it to a note
- `types` — primary keywords whose notes the view leaves out
- `tags` — further tags that hide a note (`views.EXPLORATION_TAG`, the Explorations tab's notes)

`hiding.hides(primary, tags)` says whether a note is out. The per-view
instances sit right below the class; **edit them there**:

| View  | Instance        | Tag        | Hidden types                          | Hidden tags   |
|-------|-----------------|------------|---------------------------------------|---------------|
| Queue | `QUEUE_HIDING`  | `no-q`     | `appointment`, `recurring`, `source`  | `exploration` |
| Float | `FLOAT_HIDING`  | `no-float` | `appointment`, `recurring`, `source`  |               |
| Graph | `GRAPH_HIDING`  | `no-graph` | `appointment`, `recurring`            | `exploration` |

`tests/test_views.py` checks that every listed type is a primary keyword and
every tag is a valid tag.

## Where it applies

Each view filters at the one place it reads the index, so nothing downstream
needs to know:

- Queue: `store.queue_draw`.
- Float: `store.float_draw`.
- Graph: `graph._View`, so hidden notes are gone from the canvas, its search
  (`search.py`'s `graph` scope) and random alike, and relationships to them are
  left out like those to notes with errors. The sidebar's search still finds them.

## Hide toggle, hide button and undo

Queue and Float hide through the note component's tag toggle
([`note-component.md`](note-component.md)): `PUT /api/items/<name>/tags`
(`{tag, on}`, `store.set_tag`) adds `hiding.tag` to the note's `tags` line (or
appends one), and the toggle then shows it's on. Toggling it again is the undo.
The note stays where it is on screen until the view draws again.

- Queue: the toggle on each note, simple or in full; the tag is
  `QUEUE_HIDE_TAG` in `pages/queue/queue.ts`.
- Float: the toggle on each card and in its modal; `FLOAT_HIDE_TAG` in
  `pages/float/float.ts`.
- Graph: a hide button among the card's tools.
  `POST /api/graph/notes/<name>/hide` → `graph.hide` (`store.hide`) keeps the
  previous text in the graph's single undo slot (shared with deletes);
  `POST /api/graph/undo` writes it back. The canvas unpins the note and re-pins
  it on undo, as for a delete.

## Adding hiding to another view

1. Add an instance next to the others in `views.py`.
2. Filter that view's reads with `instance.hides(e.primary, e.tags)`.
3. For a toggle: pass `tagToggles={[{ tag: instance.tag, icon, title }]}` to the
   note component; the tag needs no endpoint of its own.

The questions view's `no-questions` tag (`questions.NO_QUESTIONS_TAG`) predates
this and works separately.
