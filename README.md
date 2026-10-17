# dsl-crud

Create, edit and delete the plain-text items read by [`../calendar`](../calendar): one `*.txt` file per item, directly inside a data folder, in the item language specified in [`../dsl`](../dsl). Small Flask + Vue app.

## Run

```
just run
```

Opens http://127.0.0.1:8766. On first start, set the data folder (stored in `~/.config/dsl-crud/config.json`); the calendar's folder is offered if it has one.

## Editing

One [CodeMirror 6](https://codemirror.net) editor per item. A single pass over the text (`analyze` in `static/app.js`, mirroring `dsl.py`) provides the highlighting (keywords, options and values by type, relationships, `data` and `extra` blocks, unknown keyword lines muted; hover for meanings) and inline lint for the errors and warnings of `../dsl/spec/language.md`. Saved on blur or Ctrl+S.

The list shows body and `extra` content as markdown (marked + DOMPurify), `data` blocks as highlighted code, relationships as links headed by the target's first line (a click scrolls to the target, paging and clearing the filter as needed), and only keyword lines in monospace with the editor's highlighting. Its order is shuffled per page load (a seed sent with each request), stable across paging and filtering.

The list is filtered and paged on the server, so a folder of many items (e.g. one shared with graphirst's notes) stays usable: `store.py` keeps each item's text and problem flags in memory and re-reads a file only when its mtime changes. The Broken tab shows items needing attention.

CodeMirror loads without a build step: each package comes from esm.sh with its dependencies left external (`*` prefix) and pinned once in the import map in `templates/index.html`, so only one copy of `@codemirror/state` loads. When bumping a version there, keep every package's dependency ranges satisfied.

New files are named `<slug of the first line>-<6 hex>.txt`; the name doesn't change when the text does. Other items refer to it by that name without `.txt` (`-> label @name`).

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

## Test

```
uv run pytest
```
