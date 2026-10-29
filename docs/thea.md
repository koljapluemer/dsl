# Viz blocks

A fenced code block whose info string is `thea`, in a note's body, `extra` or
`publish` block, holds the spec of an interactive visualization. The local
[claude CLI](https://claude.com/claude-code) generates it as a small
TypeScript project, built into one offline HTML file. The note shows it live,
and as a thumbnail where it's small.

````
Rainfall
```thea brisk-river-3
A bar chart of monthly rainfall in Berlin; hovering a bar shows its value.
```
````

To the item language this is an ordinary [fence](../spec/language.md#fences):
lines in it never end the body or a block. What `thea` means lives in
`dsl_crud/core/thea.py` and its mirror `frontend/src/entities/item/dsl/thea.ts`.

## The header

The opening fence carries the block's id:

- `` ```thea ``: never generated.
- `` ```thea brisk-river ``: named (a random `adjective-noun`, `features/thea/words.py`) when its first generation starts; nothing built yet.
- `` ```thea brisk-river-3 ``: version 3 exists.

The server writes the header: the name as a job starts, the next version when it
succeeds. A note open with unsaved edits meanwhile takes the rewritten header
into its draft where the draft still has the old one (`carryHeaders` in
`useNoteDraft`), so saving those edits doesn't undo it. Editing the number by
hand switches to that version, as long as its folder is still there.

## Files

Each version is a folder in the data folder, `files/thea/<name>-<version>/`:
the sources (`src/`, `package.json`, `package-lock.json`, anything else the
CLI added), `index.html` (the built page), `thumb.webp` and `thea.json` (the
spec it was built from, model, time, turns, and the CLI's cost estimate at API
prices, which a subscription doesn't pay). There are no `media`
clauses: a note keeps the folder of each block's current version and the one
before (`thea.kept`, part of `files.referenced`). Older ones are deleted after
a successful generation. Versions of a removed block, or of a deleted note, are
orphans for Settings → maintenance. When a note names no image or video, its
first viz's thumbnail is its cover.

## Generating

The block's generate button (in the rendered note) calls
`POST /api/thea/generate {file, index, errors}`. It's off while the note has
unsaved edits, since the spec is read from the saved file. One background
thread runs the jobs, one at a time (`features/thea/service.py`):

1. The workspace `~/.cache/dsl-crud/thea/<name>/` gets the current version's
   sources, or the template (`features/thea/template/`) for a first run. Its
   `node_modules` stays between runs. `SPEC.md` holds the spec, and
   `PREVIOUS_ERRORS.md` the runtime errors the live viz reported and the
   block's last failure, if any.
2. `npm install --ignore-scripts`.
3. `claude -p` runs in the workspace with `--restricted` (none of your own
   settings, CLAUDE.md or memory; the file tools confined to the workspace),
   no MCP servers, the tools Read, Write, Edit, Glob, Grep and Bash, Bash
   allowed only for `npm`/`npx`, and `features/thea/system-prompt.md`
   appended to its system prompt. The CLI owns the loop: it builds, lints and
   checks as it sees fit. Since it can edit `package.json` scripts and run
   them, it can effectively run any code in the workspace, as you.
4. The app then runs `npm run build`, `lint` and `check` itself. If any fails,
   it resumes the CLI's session once with the output; if it still fails, the
   job fails with it.
5. The sources and the built page are copied into the next version's folder,
   with a thumbnail (Chromium, 800 px wide, cut to 5:3 at most, WebP 420 px).
   The next version is past every folder of the name, not just the header's,
   so an id never names two builds. Then the header is rewritten.

`GET /api/thea/jobs` lists the jobs, with the step taken from the CLI's
stream-json output. It keeps a done job for 30 minutes and a block's last
failure until its next run (a week at most). They're also written to
`~/.cache/dsl-crud/thea/jobs.json`, so a failure outlasts a restart, and a job
that was queued or running when the app stopped comes back as failed. The
block shows the step while it runs, and a failure's output after; a failure
from the CLI says why (the cap per run or the turn limit reached, its
message, stderr, exit status). A finished job refreshes every view, and a
failed one also shows in the toast corner.

Notes are written last-writer-wins, so a save of a text from before a run
finished (an edit in flight, an undo) can set the header back to the old
version. While the done job is listed, the block then says so and offers to
use the version made (`POST /api/thea/use {file, index, id}`). Settings → viz blocks
sets the CLI command, model, a cap per run (in the CLI's estimated USD at API
prices: with a subscription nothing is billed, it limits usage) and a time limit (`thea` in the
config file). `GET /api/thea/status` says whether the CLI, npm and Chromium
are there. Without them (Termux), blocks still show, but can't be generated.

## The template

`package.json` pins esbuild, TypeScript and oxlint:

- `build`: `build.mjs` bundles `src/main.ts` (with its CSS and small assets as data URLs) and inlines it, `src/body.html`, the base theme and the bridge into `dist/index.html`.
- `lint`: oxlint, then `tsc --noEmit`.
- `check`: builds, then `features/thea/check.py` renders the page in headless Chromium at 360 and 1000 px wide, light and dark, with every request blocked. It fails on uncaught or console errors, blocked requests, horizontal overflow or an empty page, and writes screenshots for the CLI to look at.

The base theme gives `--viz-*` CSS variables for both themes. The bridge sets
`data-theme` from `prefers-color-scheme` (or a `{type: 'theme'}` message) and
posts `{source: 'thea', type: 'resize' | 'error'}` to the app.

## Showing

`dumb/Markdown.tsx` leaves a slot for each `thea` fence (`fences`), which
`NoteContent` fills with `entities/item/viz/TheaBlock.tsx`, the k-th fence of
a part being that part's k-th block. Live, it's the version's page from
`GET /api/thea/<id>/view` in an `<iframe sandbox="allow-scripts">`. That
response's CSP makes the page an opaque origin without network wherever it's
opened. The iframe is as high as the page reports. The spec is folded below it,
and a badge says when it changed since the version was built. With
`compactViz` (Graph and Canvas cards) and in `simple`, only the thumbnail shows.
