# dsl-crud

Create, edit and delete the plain-text items read by [`../calendar`](../calendar): one `*.txt` file per item, directly inside a data folder, in the item language specified in [`spec/`](spec/). Small Flask app with a React frontend.

## Run

```
just run
```

Opens http://127.0.0.1:8766. On first start, set the data folder (stored in `~/.config/dsl-crud/config.json`); the calendar's folder is offered if it has one.

Flask serves the frontend's build from `frontend/dist`: `just run` builds it when it's missing, `just build` rebuilds it, `just reinstall` does both. `just dev` runs Flask and Vite's dev server (http://127.0.0.1:5173, hot reload, `/api` proxied to Flask) together. `just check` lints, typechecks and tests both sides.

## Frontend

Vite + React + TypeScript in `frontend/`, with TanStack Router (the list's filter, semantic toggle and page are in the URL) and TanStack Query (requests, polling, cache), styled with Tailwind + daisyUI. `frontend/src` is feature-sliced; each layer imports only from those below it, and slices of one layer don't import each other (enforced by `eslint-plugin-boundaries`, see `frontend/eslint.config.js`):

- `api`: the fetch wrapper and the API's types
- `dumb`: generic pieces without app logic (pager, modal, media, CodeMirror host, markdown, a tiny store)
- `entities`: `graph` (the graph page's requests), `item` (queries, the item language's client-side mirror in `dsl/`, the read-only `ItemOverview` and `ItemView`), `ollama` (model status and downloads), `settings`
- `features`: `item-edit` (the item editor and its autosave), `item-delete` (delete with undo), `model-download`
- `pages`: one folder per route (`sources` holds the list and the form); code only one page uses lives there
- `main.tsx`, `router.tsx`, `App.tsx` (tabs, error banner, undo toast) at the root

## Editing

One [CodeMirror 6](https://codemirror.net) editor per item. A single pass over the text (`analyze` in `frontend/src/entities/item/dsl/analyze.ts`, mirroring `dsl.py`; tested against `spec/examples`) provides the highlighting (keywords, options and values by type, relationships, `data` and `extra` blocks, unknown keyword lines muted; hover for meanings) and inline lint for the errors and warnings of `spec/language.md`. Saved on blur or Ctrl+S.

The list shows body and `extra` content as markdown (marked + DOMPurify), `data` blocks as highlighted code, relationships as links headed by the target's first line (a click scrolls to the target, paging and clearing the filter as needed), and only keyword lines in monospace with the editor's highlighting. Its order is shuffled per page load (a seed sent with each request), stable across paging and filtering.

The list is filtered and paged on the server, so a folder of many items (e.g. one shared with graphirst's notes) stays usable: `store.py` keeps each item's text and problem flags in memory and re-reads a file only when its mtime changes. The Broken tab shows items needing attention.

New files are named `<slug of the first line>-<6 hex>.txt`; the name doesn't change when the text does. Other items refer to it by that name without `.txt` (`-> label @name`).

## Semantic search

The `semantic` toggle next to the filter ranks the notes by similarity to the query instead of filtering them by its text, as `../scripts/notes-semantic-search` did (`semantic.py`). Each note's body (not its keyword lines or `extra`) is embedded by `qwen3-embedding:0.6b` on the Ollama server below; the query gets the model's search instruction. Embeddings are cached by body hash in `~/.cache/dsl-crud/` and computed in the background on the first semantic search, so until that finishes only the notes embedded so far are ranked. Without the server or model it falls back to the text filter and offers to download the model.

## Questions

The Questions tab shows a random note whose body contains `>` or `~`, that has at most one relationship and isn't tagged `no-questions` (`questions.is_candidate`). Below it are up to 3 of the questions in `questions.py`. An answer links the note with `-> <label> @<target>`, to an existing note picked from the search suggestions (a word index in `store.py`, prefix-matched as you type) or to a new note made from the text. Skip shows another note. Disable adds the `no-questions` tag.

When `questions.py` lists more than 3 questions, a local LLM chooses the 3 that fit the note best (prompt: `prompts/pick-questions.md`). Without an LLM it asks the first 3. The LLM is an [Ollama](https://ollama.com) server, set in Settings and stored under `llm` in the config file:

- `url`: defaults to `OLLAMA_HOST`, then `http://127.0.0.1:11434`
- `model`: chosen from the server's installed models. There is no default, so without one the questions aren't chosen
- `think` (default `false`), `keep_alive` (default `"30m"`), `options`: passed on to Ollama's `/api/chat`

## Calendar, Queue, Zero, Suggest

Ports of the `../dsl-mobile` apps calendar, queue and zero, and of `../suggest`, one route each; what an item means to them is in `views.py`.

- **Calendar**: `appointment` and `recurring` items by day or over a From..To range (this week, Sunday to Saturday, by default), toggled at the top; view, day and range are in the URL. A click on an item opens it in the editor in a modal (with delete); `+` adds one, prefilled with `appointment <that day>`.
- **Queue**: 3 random items (body, `media` attachment, `extra`), Next draws others. Types and tags hidden from it are set in its Hidden panel and stored under `queue` in the config file.
- **Zero**: a card per item tagged `zero`, in a random order per page load and colored by file name; a click greys it out and moves it last until reload.
- **Suggest**: a card per `#hashtag` in the notes' body or `extra`. A click shows a random note carrying it; hold "Hold for next" for another, or delete it (with undo).

## Projects

`project` and `issue` items (`store.projects`). An issue belongs to the projects its `-> project @<name>` relationships point to; issues belonging to none are listed below the projects. Each project is collapsible, with its issues by heading; a click on one opens it in the editor in a modal (with delete). `+ Project` adds a project; a project's `+ Issue` adds an issue, prefilled with `issue` and its relationship to the project.

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

The tab lists the sources (filter in the URL, the 3 most recently edited highlighted) and edits one in a form, saved when a field loses focus. Import BibTeX converts the clipboard's entries to this model (`journal` → `journaltitle`, `year`+`month` → `date`, `phdthesis` → `thesis`, …; unmapped fields are dropped; a taken key gets `-2`, `-3`, …).

Settings → "bibtex export" takes any number of `.bib` paths (a directory gets `sources.bib`), stored under `bibtex` in the config file. All sources are written there as biblatex (LaTeX-escaped via pylatexenc, written with bibtexparser) 5 s after the last write through the API, on startup, and every 15 min. Unchanged files aren't rewritten; existing files not generated by the app are never overwritten.

## Graph

A port of `../dsl-graph`: notes as cards on a [React Flow](https://reactflow.dev) canvas, laid out by [ELK](https://eclipse.dev/elk/), their relationships as labeled edges (`graph.py` on the server, `frontend/src/pages/graph`). Only notes without errors are part of it; a relationship to anything else is left out until it's fixed.

- **Pins**: a pinned note shows the notes up to its depth (the chevrons beside the pin) relationships away, in either direction. Picking a search result pins it at depth 2. The badge under a card counts its related notes not on the canvas; a click shows them. Pins are kept under `graph` in the config file.
- **Sidebar**: Search (the query syntax is behind the `?`: words match as prefixes, `"exact phrase"`, `/regex/ims`, `-exclude`, `OR`, parentheses, `file:`, `body:`, `extra:`), optionally only orphans or connected notes, and Recent (by modification time).
- **Canvas**: right-click opens a quick search at the cursor; each pick pins a note, and it stays open for several picks. Double-click adds a note. Drag from a card's edge dot onto another card to relate them, or onto empty canvas for a new related note. Drag a card by its grip to move it; it keeps its spot while it's on the canvas.
- **Cards**: edit the full text (Mod-Enter saves, Escape cancels; text with errors isn't saved), attach an image (downscaled to WebP) or a short video by paste or upload, delete with undo. A click on an edge label edits or deletes its relationships (with undo).
- The toolbar: add note, unpin all, pin a random orphan, open a random note or search result, pin all search results (the first 100, without neighbors), zoom and fit.

Attachments go into `images/` in the data folder as `<note>-<ms>.<ext>`; one the graph wrote is deleted when it's replaced or removed and no other note names it.

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

The first run installs Python, numpy (Termux's package) and a venv in `~/.venvs/dsl-crud`; the other dependencies follow `pyproject.toml`. The phone doesn't build the frontend: `frontend/dist` is committed, so run `just build` before committing frontend changes. Every run starts the server and opens the browser. Set the data folder to the notes under `/storage/emulated/0/...`. One-tap start with Termux:Widget: `mkdir -p ~/.shortcuts && ln -s ~/dsl-crud/termux.sh ~/.shortcuts/dsl`.

## Test

```
uv run pytest
```
