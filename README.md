# dsl-crud

Create, edit and delete the plain-text items read by [`../calendar`](../calendar): one `*.txt` file per item, directly inside a data folder, in the item language specified in [`../dsl`](../dsl). Small Flask app with a React frontend.

## Run

```
just run
```

Opens http://127.0.0.1:8766. On first start, set the data folder (stored in `~/.config/dsl-crud/config.json`); the calendar's folder is offered if it has one.

Flask serves the frontend's build from `frontend/dist`: `just run` builds it when it's missing, `just build` rebuilds it, `just reinstall` does both. `just dev` runs Flask and Vite's dev server (http://127.0.0.1:5173, hot reload, `/api` proxied to Flask) together. `just check` lints, typechecks and tests both sides.

## Frontend

Vite + React + TypeScript in `frontend/`, with TanStack Router (the list's filter, semantic toggle and page are in the URL) and TanStack Query (requests, polling, cache), styled with Tailwind + daisyUI. `frontend/src` is feature-sliced; each layer imports only from those below it, and slices of one layer don't import each other (enforced by `eslint-plugin-boundaries`, see `frontend/eslint.config.js`):

- `api`: the fetch wrapper and the API's types
- `dumb`: generic pieces without app logic (pager, CodeMirror host, markdown, a tiny store)
- `entities`: `item` (queries, the item language's client-side mirror in `dsl/`, the read-only `ItemOverview`), `ollama` (model status and downloads), `settings`
- `features`: `item-edit` (the item editor and its autosave), `item-delete` (delete with undo), `model-download`
- `pages`: one folder per route; code only one page uses lives there
- `main.tsx`, `router.tsx`, `App.tsx` (tabs, error banner, undo toast) at the root

## Editing

One [CodeMirror 6](https://codemirror.net) editor per item. A single pass over the text (`analyze` in `frontend/src/entities/item/dsl/analyze.ts`, mirroring `dsl.py`; tested against `../dsl/spec/examples`) provides the highlighting (keywords, options and values by type, relationships, `data` and `extra` blocks, unknown keyword lines muted; hover for meanings) and inline lint for the errors and warnings of `../dsl/spec/language.md`. Saved on blur or Ctrl+S.

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

## Spec

The parser (`dsl.py`) reads `spec/keywords.yaml` at startup and names no keyword itself. The tests run `../dsl/spec/examples` against it. After a change in `../dsl`:

```
just sync-spec
```

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

The first run installs Python, numpy (Termux's package) and a venv in `~/.venvs/dsl-crud`. Every run starts the server and opens the browser. Set the data folder to the notes under `/storage/emulated/0/...`. One-tap start with Termux:Widget: `mkdir -p ~/.shortcuts && ln -s ~/dsl-crud/termux.sh ~/.shortcuts/dsl`.

## Test

```
uv run pytest
```
