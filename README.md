# dsl-crud

Create, edit and delete the plain-text items read by [`../calendar`](../calendar): one `*.txt` file per item, directly inside a data folder, in the item language specified in [`spec/`](spec/). Small Flask app with a React frontend.

## Run

```
just run
```

Opens http://127.0.0.1:8766. On first start, set the data folder (stored in `~/.config/dsl-crud/config.json`).

Flask serves the committed frontend build from `frontend/dist`. `just run` uses that build, while `just build` creates an ignored feature-branch build in `frontend/dist-dev` and `just run-build` serves it. `just dev` runs Flask and Vite's dev server (http://127.0.0.1:5173, hot reload, `/api` proxied to Flask) together. `just check` lints, typechecks, builds and tests both sides. After frontend source reaches `main`, GitHub Actions regenerates and commits `frontend/dist`; `just build-release` is the manual equivalent.

## Frontend

Vite + React + TypeScript in `frontend/`, with TanStack Router (the Notes tab's query, semantic toggle, page and open notes are in the URL) and TanStack Query (requests, polling, cache), styled with Tailwind + daisyUI. Layering: [`docs/frontend-architecture.md`](docs/frontend-architecture.md).

## Notes

The Notes tab is a search on the left and the notes opened from it on the right, in a grid filling the pane: one note takes it all, two sit side by side, more add rows (3–4 in 2 columns, 5–9 in 3, at most 2 on a narrower pane; the columns follow from the number of notes and the pane's width in CSS, `pages/notes/notes.css`). Each scrolls on its own; a note's ✕ closes it. On a phone the search and the notes take turns, one column of notes.

The Tasks tab shows the notes needing attention, then the other notes with `tasks`, each in its own editor.

A note shows rendered: body and `extra` content as markdown (marked + DOMPurify), its attachment, `data` blocks as highlighted code, relationships as links headed by the target's first line (a click opens the target too), and only keyword lines in monospace with the editor's highlighting.

## Editing

Everywhere a note is shown it's the same panel (`meta/note-panel/NotePanel.tsx`): rendered, with Edit, delete and as the page needs hide and close. Edit swaps in an editor for the full text and the attachment; nothing is written until Accept (✓, Ctrl+Enter or Ctrl+S), Discard (↶) drops it; Escape does too while nothing was edited (see Keyboard). New notes start in the editor; the Graph's new-note card is that editor too, with the relation label and direction below. The Calendar, Projects and Float show it in a modal; `/edit/<file>` (and `/new`) on its own page, with the relationships below.

The editor is [CodeMirror 6](https://codemirror.net). A single pass over the text (`analyze` in `frontend/src/entities/item/dsl/analyze.ts`, mirroring `dsl.py`; tested against `spec/examples`) provides the highlighting (keywords, options and values by type, relationships, `data` and `extra` blocks, unknown keyword lines muted; hover for meanings) and inline lint for the errors and warnings of `spec/language.md`, also listed below it.

## Search

Every list of notes to pick from is one search (`search.py`, `GET /api/search`; `entities/item/search/NoteSearch.tsx`): the Notes sidebar, the Graph's sidebar and its right-click search, and the field linking a relationship's target. It runs on the server over `store.py`'s index, which keeps each item's text, words and problem flags in memory and re-reads a file only when its mtime changes, so a folder of many notes stays usable. Without a query it lists the newest notes.

The query syntax is behind the `?`: words match as prefixes (case and accents folded), `"exact phrase"`, `/regex/ims`, `-exclude`, `OR`, parentheses, `file:`, `body:`, `extra:`. The relationship field takes words and phrases only (a slash is part of a word there). ↑/↓ choose a result, Enter opens it (the first one when none is chosen).

New files are named `<slug of the first line>-<6 hex>.txt`; the name doesn't change when the text does. Other items refer to it by that name without `.txt` (`-> label @name`).

## Keyboard

`?` lists the shortcuts (`App.tsx`; the hook is `frontend/src/dumb/keys.ts`).

- **Ctrl/⌘+Enter** accepts what's being edited, from any of its fields: a note's editor (wherever the note panel is, Graph cards too), the source form (then back), the Graph's new-note card and edge labels. In a relationship's target field it creates a new note even when a result is chosen.
- **Esc** never saves or discards edits. It leaves a note's editor, a card or label editor, or closes a modal, only when nothing was edited; otherwise it shows a notice and does nothing (a click outside a modal does the same). In a search or filter field it just leaves the field.
- Single keys, ignored while typing in a field, holding Ctrl/Alt/Meta, or with a modal open:
  - `g` then a tab's key (in its tooltip) switches tab, `c` opens a new note, `/` focuses the search or filter, `u` undoes the change the toast offers.
  - Notes: ←/→ page the search. Calendar: ←/→ a day (or the range's length), `t` today/this week, `a` add, `d`/`r` day/range view. Queue: `n` next. Questions: `s` skip, `e` edit, `d` disable. Suggest: Shift+N next.

## Semantic search

The `semantic` toggle under the Notes search ranks the notes by similarity to the query instead of matching its text, as `../scripts/notes-semantic-search` did (`semantic.py`). Each note's body (not its keyword lines or `extra`) is embedded by `qwen3-embedding:0.6b` on the Ollama server below; the query gets the model's search instruction. Embeddings are cached by body hash in `~/.cache/dsl-crud/` and computed in the background on the first semantic search, so until that finishes only the notes embedded so far are ranked. Without the server or model it falls back to the query syntax and offers to download the model.

## Questions

The Questions tab shows a random note whose body contains `>` or `~`, that has at most one relationship and isn't tagged `no-questions` (`questions.is_candidate`). Below it are up to 3 of the questions in `questions.py`. An answer links the note with `-> <label> @<target>`, to an existing note picked from the search's suggestions or to a new note made from the text. The note itself can be edited in place. Skip shows another note. Disable adds the `no-questions` tag.

When `questions.py` lists more than 3 questions, a local LLM chooses the 3 that fit the note best: `gemma3:4b` (`questions.MODEL`, tuned together with the prompt `prompts/pick-questions.md`) on an [Ollama](https://ollama.com) server. Without the server or the model it asks the first 3, and offers to download a missing model.

The server's URL is the only LLM setting (Settings, stored under `llm` in the config file); it defaults to `OLLAMA_HOST`, then `http://127.0.0.1:11434`. Each feature names its own model, and models are kept loaded for 30 minutes between calls (`llm.py`).

## Calendar, Queue, Float, Zero, Suggest

Ports of the `../dsl-mobile` apps calendar, queue and zero, of `../floating-notes` and of `../suggest`, one route each; what an item means to them is in `views.py`.

- **Calendar**: `appointment` and `recurring` items by day or over a From..To range (this week, Sunday to Saturday, by default), toggled at the top; view, day and range are in the URL. A click on an item opens it in a modal; `+` adds one, prefilled with `appointment <that day>`.
- **Queue**: 3 random items, Next draws others. An item's hide button tags it `no-q`; what it hides is set in code, see [`docs/hiding.md`](docs/hiding.md).
- **Float**: random items drifting across the window, a new one every few seconds, drawn in batches of 20 (`store.float_draw`); the filter below keeps those containing its text. A card stops under the pointer; a click opens it in a modal, which holds the stage still. The hide button tags it `no-float`, see [`docs/hiding.md`](docs/hiding.md).
- **Zero**: a card per item tagged `zero`, in a random order per page load and colored by file name; a click greys it out and moves it last until reload.
- **Suggest**: a dropdown of the `suggest-` tags (`tags suggest-book`), a random one selected on load, and a random note carrying the selected one; hold "Hold for next" for another.

## Projects

`project` and `issue` items (`store.projects`). An issue belongs to the projects its `-> project @<name>` relationships point to; issues belonging to none are listed below the projects. Each project is collapsible, with its issues by heading; issues to think about (and sketch) rather than build come first, tinted. An issue's bulb/hammer button flips it between the two by adding or removing the tag `suggest-think-and-sketch` (`views.THINK_TAG`; as a `suggest-` tag it also shows up in Suggest and is hidden where those are). A click on one opens it in a modal. `+ Project` adds a project; a project's `+ Issue` adds an issue, prefilled with `issue` and its relationship to the project.

## Sources

Bibliographic sources, formerly `../sources`: `source` items (`sources.py`) whose `data` block holds the biblatex fields in `fields.py` (the subset needed for ACM/IEEE/APA plus `url`):

```
Attention Is All You Need

source
data
key: vaswani2017
entrytype: inproceedings
author:
- Vaswani, Ashish
- van Beethoven, Ludwig
- World Health Organization
date: 2017-06-12
booktitle: NeurIPS
url: https://arxiv.org/abs/1706.03762
extra
free text, never parsed or exported
```

The first line is the title, `key` the bibtex key (the file's name without `.txt` when there is none; a blank one in the form becomes the title's slug). The file keeps its name when the key changes, so relationships to it stay valid. Names are `family, given`, `family, suffix, given`, or without a comma one name that is never split (an organisation); leading lowercase words of the family part are its prefix (`van`). Lists (publisher, location, …) are string lists, dates ISO (`2020-05-17`). Lines the form doesn't own (relationships, other keywords, unknown `data` keys) are kept when a source is saved; names in the earlier `{family, given}` form are read and rewritten as strings.

The tab lists the sources (filter in the URL, the 3 most recently edited highlighted) and edits one in a form, saved when a field loses focus. A row's chevron, after their count (disabled at 0), expands the notes linking to the source (backlinks), compact; the form ends with the same list. Both can detach or delete those notes and link another note, existing or new, to the source ([`docs/relationships.md`](docs/relationships.md)). Import BibTeX converts the clipboard's entries to this model (`journal` → `journaltitle`, `year`+`month` → `date`, `phdthesis` → `thesis`, …; unmapped fields are dropped; a taken key gets `-2`, `-3`, …).

Settings → "bibtex export" takes any number of `.bib` paths (a directory gets `sources.bib`), stored under `bibtex` in the config file. All sources are written there as biblatex (LaTeX-escaped via pylatexenc, written with bibtexparser) 5 s after the last write through the API, on startup, and every 15 min. Unchanged files aren't rewritten; existing files not generated by the app are never overwritten.

## Graph

A port of `../dsl-graph`: notes as cards on a [React Flow](https://reactflow.dev) canvas, laid out by [ELK](https://eclipse.dev/elk/), their relationships as labeled edges (`graph.py` on the server, `frontend/src/pages/graph`). Only notes without errors and not hidden from it ([`docs/hiding.md`](docs/hiding.md)) are part of it; a relationship to anything else is left out until it's fixed.

- **Pins**: a pinned note shows the notes up to its depth (the chevrons beside the pin) relationships away, in either direction. Picking a search result pins it at depth 2. The badge under a card counts its related notes not on the canvas; a click shows them. Pins are kept under `graph` in the config file.
- **Sidebar**: the search over the graph's notes (the newest without a query), optionally only orphans or connected notes.
- **Canvas**: right-click opens a quick search at the cursor; each pick pins a note, and it stays open for several picks. Double-click adds a note. Drag from a card's edge dot onto another card to relate them, or onto empty canvas for a new related note. Drag a card by its grip to move it; it keeps its spot while it's on the canvas.
- **Cards**: the note panel, with the graph's own rendering: edit (text with errors isn't saved), hide (tags it `no-graph`) or delete, both with undo. A click on an edge label edits or deletes its relationships (with undo).
- The toolbar: add note, unpin all, pin a random orphan, open a random note or search result, pin all search results (the first 100, without neighbors), zoom and fit.

The note panel's editor and the Graph's new-note card accept one image (downscaled to WebP) or short video by paste or upload; on touch devices they also take a photo with the camera. Attachments go into `images/` in the data folder as `<note>-<ms>.<ext>`; an attachment the app wrote is deleted when it is replaced or removed and no other note names it.

## Maintenance

Settings → "maintenance" lists, then on Delete removes (without undo):

- **past appointments**: valid `appointment` items dated before today (a month-only date counts once the month is over), with their attachments unless another note names them (`maintenance.py`). Recurring and broken items are kept.
- **orphaned media**: image and video files in `images/` that no note names, in its `media` clause or anywhere else in its text.

## Spec

The item language lives in `spec/`: `language.md` defines its syntax, `keywords.yaml` defines the available keywords, and `examples/` contains conformance cases. The Python and TypeScript parsers both run those local examples in their test suites. The Python parser reads `keywords.yaml` at startup and names no keyword itself.

## Add as desktop app (Ubuntu / Fedora, GNOME)

```
just reinstall
```

Installs icon and `.desktop` entry ("dsl" in application search, pinnable to the dock). Rerun after code changes: it refreshes the entry and restarts the server if it's running (the server otherwise keeps running in the background; relaunching only reopens the browser).

## Android (Termux)

Clone the repo into Termux's home (not shared storage: it can't hold executables or the venv), run `termux-setup-storage` once, then:

```
./termux.sh
```

The first run installs Python, numpy (Termux's package) and a venv in `~/.venvs/dsl-crud`; the other dependencies follow `pyproject.toml`. The phone doesn't build the frontend: `frontend/dist` is committed and automatically refreshed after frontend changes reach `main`. Every run starts the server and opens the browser. Set the data folder to the notes under `/storage/emulated/0/...`. One-tap start with Termux:Widget: `mkdir -p ~/.shortcuts && ln -s ~/dsl-crud/termux.sh ~/.shortcuts/dsl`.

## Test

`just check` lints, typechecks and tests both sides; `uv run pytest` runs only the backend's tests.
