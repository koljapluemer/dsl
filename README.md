# dsl-crud

Create, search, relate, edit, and delete plain-text items: one `*.txt` file per item, directly inside a data folder, in the item language specified in [`spec/`](spec/). Small Flask app with a React frontend.

## Run

```
just run
```

Opens http://127.0.0.1:8766. On first start, set the data folder (stored in `~/.config/dsl-crud/config.json`). The portfolio's card collages and PDF export also need Chromium: `just chromium`, once.

Flask serves the committed frontend build from `frontend/dist`. `just run` uses that build, while `just build` creates an ignored feature-branch build in `frontend/dist-dev` and `just run-build` serves it. `just dev` runs Flask and Vite's dev server (http://127.0.0.1:5173, hot reload, `/api` proxied to Flask) together. `just check` lints, typechecks, builds and tests both sides. After frontend source reaches `main`, GitHub Actions regenerates and commits `frontend/dist`; `just build-release` is the manual equivalent.

## Frontend

Vite + React + TypeScript in `frontend/`, with TanStack Router (the note sidebar's query, filters, page and open notes are in the URL on every page, kept across tabs) and TanStack Query (requests, polling, cache), styled with Tailwind + daisyUI. Layering: [`docs/frontend-architecture.md`](docs/frontend-architecture.md).

## Home and the note sidebar

Home (`/`) links to the other views. Beside every view, on the right, is the note sidebar (`meta/note/NoteSidebar.tsx`): a New note button, then a search over all notes (with the semantic toggle and orphan filter; its results are notes inline, the match marked) and, once notes are open, below it the notes opened from it, the last opened first. The search then takes half the column's height and the column scrolls. Each note shows rendered (view) or in the editor (edit, written as focus leaves it), with its relationships, keeps its mode for the session, opens in a modal from its ⤢ tool, and its ✕ closes it. A click on a related or linked note anywhere opens that note here. The sidebar's state is in the URL (`sq`, `ss`, `sorphan`, `spage`, `sopen`, kept across tabs), so `/?sopen=["<file>"]` is a note on its own (the old `/edit/<file>` leads there). On a phone the sidebar is a drawer, opened from the button beside the tabs or by opening a note; while it's closed, the + button at the bottom right adds a note.

A view may have its own ways to open a found note (`useSidebarAction` in `entities/item/sidebar.ts`): the Graph pins it, the Desk opens it among its notes, Document tags it `document` (unless it is) and opens it, Canvas opens it as a canvas or adds it to the one open, Canvas2Doc opens it as both (or adds it to the canvas open), Explorations and Sources open it in their pane (explorations and sources only), Published any note (and adds a `publish` block to one without). There the results aren't clickable; each has ⌄ to open it in the sidebar and the view's icon.

## Desk

The Desk tab is a workspace for several notes at once: a search result's icon in the sidebar opens it here, beside those already open (in the URL's `open`). One fills the pane, two sit side by side, more take further columns and rows as the width allows; on a narrow pane they stack. Each note offers edit, view and both, keeps its mode for the session, and is saved explicitly (Save/Discard); a click on a related or linked note opens that one on the desk too, and ✕ closes a note.

## Document

The Document tab is a long-form workspace for the notes tagged `document` (`GET /api/documents`), listed at its left, the last edited first; the tag doesn't hide them anywhere else. The field above the list starts a new one: what's typed becomes the start of its body, followed by `tags document`. From the note sidebar's search, the document button tags any result `document` (unless it is) and opens it in the central pane (`/document?open=<file>`). The note offers edit and preview modes, remembers the mode for the session, and writes edits when focus leaves it.

Every inline reference in the body or `extra` is an annotation occurrence. On a wide pane the referenced notes appear as full view/edit cards in a left margin, in document order, and lines connect them to numbered anchors in the document. Repeated references get separate cards. Lines remain visible and become stronger near the pointer; selecting either end emphasizes it and moves to the other. `[[target]]` is a number in the editor until the caret or pointer is near it; `[[target|display text]]` keeps its display text and number. The stored syntax never changes, and a `source` is an ordinary referenced source note.

On a narrow pane one button switches between the list and the document, another between Document and Annotations, keeping their positions. There are no connector lines while only one end can be shown.

## Canvas

The Canvas tab shows any note as an infinite canvas (`/canvas?open=<file>`, `frontend/src/pages/workspaces/canvas`, `dsl_crud/features/canvas`): free Markdown text and linked notes, each at a position. The sidebar's results offer "open as canvas" and, while one is open, "add to this canvas". The notes with a canvas are listed on the right (`GET /api/canvases`), the last edited first; on a narrow pane the list and the canvas take turns. It's stored as `canvas` in the note's `data` block, written only once something changes ([`docs/canvas.md`](docs/canvas.md)).

- Double-click the canvas to write text there; right-click it (or the toolbar's Add note) to search for notes to add there. The toolbar also adds text, opens the note in the sidebar, zooms and fits the view.
- Each node: a grip to drag it, edit/view, delete (text) or detach (a note, which stays) and, as the note's own tool, delete the note; and a conversion. Text → note makes a new note with the text as its body; note → text copies the note's body into a text node, the note unchanged. Removals offer undo.
- A linked note shows its relationships, read-only. Its `extra`, `data` and other keyword blocks start folded; the chevron among its tools shows them.
- Changes are written shortly after they're made, one write at a time; a badge shows unsaved or saving ones, a failed write shows in the toast corner and as a retry button beside the toolbar. Ctrl+Enter or Esc finishes editing a text node. If the canvas was changed elsewhere since (by hand in the note's text), nothing more is written and Reload loads it again. A canvas that can't be read (invalid `data`, a malformed node) is read-only until it's fixed in the note.

## Canvas2Doc

The Canvas2Doc tab (`/canvas2doc?open=<file>`) shows one note's canvas and its document side by side: the canvas on the left, the document (with its annotations, as in the Document tab) on the right. The sidebar's "open as canvas + document" opens a result in both; while one is open, "add to this canvas" adds to its canvas. On a narrow screen a toggle shows one pane at a time, remembered for the session. Both write to the same note: the canvas only its `canvas` key, the document when focus leaves it (see the caveat in [`docs/canvas.md`](docs/canvas.md)).

## Explorations

The Explorations tab lists the notes tagged `exploration` (`GET /api/explorations`), inline, the last edited first; they're left out of the Graph and the Queue ([`docs/hiding.md`](docs/hiding.md)). The field above the list starts a new one: what's typed becomes the start of its body, followed by `tags exploration`. The exploration picked (in the URL) fills the pane, in the note editor to begin with, which writes the edits when focus leaves it (or on Ctrl+Enter, Ctrl+S); there's no Save or Discard. On a narrow pane the list and the editor take turns. A search result that's an exploration opens here from the sidebar's icon.

The Tasks tab shows the notes needing attention, then the other notes with `tasks`, each in its own editor, written as focus leaves it.

The Goals tab shows the notes tagged `goal` (`GET /api/goals`), by heading, each inline with its whole body, edited in a modal. A goal with an attached image counts as done and is left out.

A note shows rendered: body and `extra` content as markdown (marked + DOMPurify), its images and videos, `data` blocks as highlighted code, and only keyword lines in monospace with the editor's highlighting; its relationships are in the relationships widget below it. Body and `extra` may use `[[target]]` or `[[target|display text]]` for inline note relationships; missing targets are visibly struck through. A list shows a note inline: its first line as markdown, cut with `…`, its cover image as a thumbnail (with how many more it has) and an icon when it has problems.

## Editing

Everywhere a note is shown it's the same component (`meta/note/Note.tsx`, [`docs/note-component.md`](docs/note-component.md)); pages only set its parameters. Its tools are icon buttons at the top left (attach an image or video, take a photo on touch devices, insert a reference, insert a viz block, add sources from BibTeX, update a source from BibTeX, copy a source's key, export as PDF, the page's tag toggles, edit in a modal, delete); at the top right a toggle switches between edit, view and both side by side, where the page offers more than one. Where edits are saved explicitly, Save (✓, Ctrl+Enter or Ctrl+S) and Discard (↶) take the toggle's place as soon as something is edited, and nothing - relationships included - is written until Save; elsewhere (the sidebar, Explorations, Tasks, Sources, Published, Portfolio) edits are written as focus leaves the note. The New note button above the sidebar's search (on a phone the + button at the bottom right; or `c`) opens a new note in a modal, which closes on Save with a notice; so does editing a note from a list (Calendar, Goals, Projects, Float, Tags, Portfolio's cards).

Relationships, outgoing and incoming, are one widget below the note: each in two lines, the label in small caps after its arrow (→ from the note, ← to it, dashed ⇢ ⇠ for inline references) and, where editable, detach and delete buttons; a click on the label edits it; the other note follows inline. Below them a direction, label and note (picked from the search, or written as a new one) add another.

The editor is [CodeMirror 6](https://codemirror.net). Typing `[[` in the body or `extra` searches existing notes; choose one with arrows/Enter or a tap. Selecting text before using the editor's Reference button keeps it as the display text, which also makes insertion practical on phone keyboards. Ctrl/Cmd-click on an inline reference or a relationship's `@target` opens that note in the sidebar, on top of the notes there (behind a modal, if the editor is in one); middle-click opens it in a new tab, on the same page. On a touch screen, an "open" button shows above the reference the cursor is on and does the same as Ctrl/Cmd-click. A click on a note link in rendered Markdown opens it in the sidebar too. A single pass over the text (`analyze` in `frontend/src/entities/item/dsl/analyze.ts`, mirroring `dsl_crud/core/dsl.py`; tested against `spec/examples`) provides the highlighting (keywords, options and values by type, relationships, `data` and `extra` blocks, unknown keyword lines muted; hover for meanings) and inline lint for the errors and warnings of `spec/language.md`, also listed below it.

## Search

Every list of notes to pick from is one search (`dsl_crud/features/search`, `GET /api/search`; `entities/item/search/NoteSearch.tsx`): the note sidebar, the Graph's right-click search, and the field linking a relationship's target. It runs over the indexed item store in `dsl_crud/infrastructure`, which keeps each item's text, words and problem flags in memory and re-reads a file only when its mtime changes, so a folder of many notes stays usable. Without a query it lists the newest notes.

The query syntax is behind the `?`: words match as prefixes (case and accents folded), `"exact phrase"`, `/regex/ims`, `-exclude`, `OR`, parentheses, `file:`, `body:`, `extra:`. The relationship field takes words and phrases only (a slash is part of a word there). ↑/↓ choose a result, Enter opens it (the first one when none is chosen).

New files are named `<slug of the first line>-<6 hex>.txt`; the name doesn't change when the text does. Other items refer to it by that name without `.txt` (`-> label @name` or `[[name]]`).

## Keyboard

`?` lists the shortcuts (`App.tsx`; the hook is `frontend/src/dumb/keys.ts`).

- **Ctrl/⌘+Enter** saves what's being edited: a note's editor (wherever the note is, Graph cards and modals too) and the Graph's edge labels. In a relationship's target field it creates a new note even when a result is chosen.
- **Esc** never discards edits. It leaves a note's editor (saving it where edits are written as focus leaves) or a label editor, or closes a modal, only when nothing unsaved was edited; otherwise it shows a notice and does nothing (a click outside a modal does the same). In a search or filter field it just leaves the field.
- Single keys, ignored while typing in a field, holding Ctrl/Alt/Meta, or with a modal open:
  - `g` then a tab's key (in its tooltip) switches tab (`g w` opens Document, `g v` Canvas, `g k` Canvas2Doc), `c` opens a new note (as the New note button), `/` focuses the page's filter, else the sidebar's search, `u` undoes the change the toast offers.
  - Calendar: ←/→ a day (or the range's length), `t` today/this week, `a` add, `d`/`r` day/range view. Queue: `n` next. Questions: `s` skip, `e` edit, `d` disable. Suggest: Shift+N next.

## Semantic search

The `semantic` toggle under the sidebar's search ranks the notes by similarity to the query instead of matching its text (`dsl_crud/features/search/semantic.py`). Each note's body (not its keyword lines or `extra`) is embedded by `qwen3-embedding:0.6b` on the Ollama server below; the query gets the model's search instruction. Embeddings are cached by body hash in `~/.cache/dsl-crud/` and computed in the background on the first semantic search, so until that finishes only the notes embedded so far are ranked. Without the server or model it falls back to the query syntax and offers to download the model.

## Questions

The Questions tab shows a random note whose body contains `>` or `~`, that has at most one relationship and isn't tagged `no-questions`. Below it are up to 3 questions defined in `dsl_crud/features/questions/service.py`. An answer links the note with `-> <label> @<target>`, to an existing note picked from the search's suggestions or to a new note made from the text. The note itself can be edited in place. Skip shows another note. Disable adds the `no-questions` tag.

When that module lists more than 3 questions, a local LLM chooses the 3 that fit the note best: `gemma3:4b`, tuned with `dsl_crud/features/questions/pick-questions.md`, on an [Ollama](https://ollama.com) server. Without the server or the model it asks the first 3, and offers to download a missing model.

The server's URL is the only LLM setting (Settings, stored under `llm` in the config file); it defaults to `OLLAMA_HOST`, then `http://127.0.0.1:11434`. Each feature names its own model, and models are kept loaded for 30 minutes between calls (`dsl_crud/infrastructure/ollama.py`).

## Calendar, Queue, Float, Tags, Suggest

Calendar, queue, float, tags, and suggest are derived item views; shared document interpretation is in `dsl_crud/core/documents.py`.

- **Calendar**: `appointment` and `recurring` items, inline, by day or over a From..To range (this week, Sunday to Saturday, by default), toggled at the top; view, day and range are in the URL. An item's edit button opens it in a modal; `+` adds one, prefilled with `appointment <that day>`.
- **Queue**: 3 random items (not explorations), Next draws others; the icon toggle beside Next shows them simply (the body only) or in full, kept for the session. An item's hide toggle tags it `no-q` (toggling again untags it); what it hides is set in code, see [`docs/hiding.md`](docs/hiding.md).
- **Float**: random items, shown simply, drifting across the window, a new one every few seconds, drawn in batches of 20 (`store.float_draw`); the filter below keeps those containing its text. A card stops under the pointer; its edit button opens it in a modal, which holds the stage still. The hide toggle tags it `no-float`, see [`docs/hiding.md`](docs/hiding.md).
- **Tags**: a dropdown of every tag, `zero` (the zero app's) selected on load, and each item carrying the selected one, inline, in a random order per page load; a click greys it out and moves it last until reload.
- **Suggest**: a dropdown of the `suggest-` tags (`tags suggest-book`), a random one selected on load, and a random note carrying the selected one, shown simply or (as toggled beside the button) in full; hold "Hold for next" for another.

## Projects

Notes tagged `project` (`views.PROJECT_TAG`) and `issue` items (`store.projects`). An issue belongs to the projects its `-> project @<name>` relationships point to; issues belonging to none are listed below the projects. Each project is shown inline, expandable to its issues, inline too, by heading; issues to think about (and sketch) rather than build come first. An issue's bulb/hammer toggle flips it between the two by adding or removing the tag `suggest-think-and-sketch` (`views.THINK_TAG`; as a `suggest-` tag it also shows up in Suggest). Their edit buttons open them in a modal. `+ Project` adds a project, prefilled with `tags project`; a project's `+` tool adds an issue, prefilled with `issue` and its relationship to the project; the modal closes once it's added.

## Sources

Bibliographic sources are `source` items whose `data` block holds the biblatex fields defined by `dsl_crud/features/sources` (the subset needed for ACM/IEEE/APA plus `url`):

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

The first line is the title, `key` the bibtex key (the file's name without `.txt` when there is none; an imported entry without one gets the title's slug). The file keeps its name when the key changes, so relationships to it stay valid. Names are `family, given`, `family, suffix, given`, or without a comma one name that is never split (an organisation); leading lowercase words of the family part are its prefix (`van`). Lists (publisher, location, …) are string lists, dates ISO (`2020-05-17`). Names in the earlier `{family, given}` form are read as strings.

The tab lists the sources inline, the most recently edited first, beside the one open (both in the URL, with the filter, which matches key, title, date and names); a search result that's a source opens there from the sidebar's icon. It's edited as text in the note editor like any note, written as focus leaves it, with its relationships both ways below ([`docs/relationships.md`](docs/relationships.md)); its copy tool copies the key. The field above the list adds a source from its title (`source` and a `data` block with `entrytype: misc` follow); the clipboard button imports BibTeX: it converts the clipboard's entries to this model (`journal` → `journaltitle`, `year`+`month` → `date`, `phdthesis` → `thesis`, …; unmapped fields are dropped; a taken key gets `-2`, `-3`, …). Each entry is first matched against the existing sources (below). When none may exist they're created at once; otherwise each entry shows a choice of "new source" or the candidates (inline, with why), preselected when the match is sure enough, and Import applies it. A single resulting source opens.

While a source is edited, its update tool (beside the BibTeX one) merges the single BibTeX entry in the clipboard into the text as edited, writing nothing itself: the fields (title, key, entry type and the data fields) the source lacks are filled in at once (`entrytype: misc` counts as none, a key another source has gets `-2`, …); those it has otherwise are listed above the editor, each to keep or take from the BibTeX (BibTeX preselected), and Apply replaces those taken. Fields only the source has, the rest of the text and unknown `data` keys stay. The note is then saved as usual. `POST /api/sources/merge` (`{file, text, bibtex, take?}` → `{text, filled, conflicts}`) does the merge.

The note editor has the same BibTeX tool next to the media one: the clipboard's entries are staged with the same choice, and on Save the new ones are created and the note gets `-> source @<file>` to each (not twice). The shared code is `features/source-bibtex`; `POST /api/sources/match` (`{text}` BibTeX → each with its candidates) and `POST /api/sources/resolve` (`{entries: [{file} | {source}], text?, label?}` → the sources, and `text` related to them).

Matching (`dsl_crud/features/sources/matching.py`) compares an entry with every source. An equal DOI, ISBN (ISBN-10 as 13) or eprint (arXiv version dropped) means `same`. Otherwise, with case, accents and punctuation folded: an equal title, first author's family name and year are `same`; an equal URL, or a title ≥ 90% similar with the first author matching and the year at most 1 apart, `likely`; a title ≥ 75% similar `possible`. Titles are also compared without their subtitles, and one whose significant words (at least 2) are all in the other counts as 95% similar (shortened titles). A field missing on either side counts neither way, `others` in an author list is ignored, and two different DOIs or ISBNs lower a match to `possible`. `same` and `likely` are preselected; at most 3 candidates are shown.

Settings → "bibtex export" takes any number of `.bib` paths (a directory gets `sources.bib`), stored under `bibtex` in the config file. All sources are written there as biblatex (LaTeX-escaped via pylatexenc, written with bibtexparser), as an export (below).

## Published

A note is published with a `publish` block: `publish <route>` (e.g. `index`, `essays/a-cool-essay`: segments of `a-z`, `0-9` and `-`, joined by `/`), then the published text, multi-line like `extra` and separate from it, so the body and `extra` stay notes. Inline references count in it as in `extra`.

The Published tab (`g b`) lists the notes with a valid route (`GET /api/published`, by route) as a tree of their routes' segments, by name only: a route's notes, then the routes below it as a folder (a route can be both). A route used by several notes is flagged. Clicking one opens its note in the standard editor beside the tree, written as focus leaves it. In the sidebar, any result opens there (its panel icon), and one without a route gets the globe icon: it appends `publish <route>` (the route from the file name, without its random suffix) unless the note has a `publish` block already, then opens it, its empty block flagged until you write the text. Nothing is rendered or exported yet.

## Exports

Files the app derives from the notes and writes outside the data folder: the BibTeX export (above) and the portfolio page (below). Each takes any number of paths in Settings (a directory gets the export's default file name), stored under its key in the config file, each shown with its last result. `dsl_crud/infrastructure/exports.py` writes them 5 s after the last write through the API, on startup, and every 15 min. Unchanged files aren't rewritten; an existing file is only overwritten if it starts with the export's marker, so files not generated by the app never are. Export definitions are registered explicitly by the application factory. An export may also write binary files beside its file (`assets`), all inside one subfolder it owns (`asset_dir`): they're written after the file itself, only when changed, and any other file in that subfolder is deleted.

## Portfolio

The Portfolio tab manages the one note tagged `portfolio`, edited as in Explorations (written as focus leaves it). Opening the tab creates it when there's none, with a Jinja template `files/<note>.html.j2` named in a `media` clause; a tagged note without a template gets one. Opening it again changes nothing; two tagged notes are an error to fix by hand. The template is in the note's file list, edited in a text modal.

The page (`dsl_crud/features/portfolio/service.py`) is the template rendered with `title` (the first line, without leading `#`), `body` (the whole body as Markdown via markdown-it-py, CommonMark with tables, strikethrough and single newlines as breaks, like the app's own rendering) and `data` (the `data` block, or empty). `[[references]]` stay as written. The tool row's preview icon opens it in a new tab (`GET /api/portfolio/preview`); Settings → "portfolio export" sets where it's written (a directory gets `index.html`), and the tab shows each path's last result. The site's repository is left to you: commit and push from there.

### Cards

The notes tagged `card` are listed below, by heading, as their collages' thumbnails (`GET /api/portfolio/cards`); each opens the note in a modal, saved explicitly. The last tile, Card, opens a new note in a modal with `tags card` filled in. Each card is rendered as a landscape A4 page (1754×1240 px, WebP) with a 420 px wide thumbnail (`collage.py`): an HTML page laid out and screenshotted by headless Chromium through Playwright. The page holds every image the note names in a `media` clause, then its body as the heading and its `extra` as Markdown (the same markdown-it rendering as the page; `[[references]]` as their text). Title, images and text each get their own box: the images in justified rows on the left or on top, the title either across the page above both or at the top of the text's column, with its own font size, wrapped between words only (a long word makes it smaller; only a word too long for the page at the smallest size is broken). The arrangement chosen gives the images the most room while title and text stay at a readable size (else the largest size the text fits at, else it's cut at the smallest), found by trying font sizes in the browser. Missing or unreadable images are left out. Renders are cached in `~/.cache/dsl-crud/cards/` by the note's text, its images' mtimes and sizes and the layout version (`collage.VERSION`).

Collages need the `cards` dependency group (Playwright, Pillow; a uv default group, so `uv run` installs it) and Chromium, once: `just chromium`. Termux installs neither. Where they're missing (`collage.available()`, also in `POST /api/portfolio`), the tab says why and shows the cards' headings in place of the thumbnails, the card images answer 503, and while any note is tagged `card` the portfolio export fails with that reason and writes nothing, so such an install never publishes the page without its cards.

The template gets `cards`: per card `file`, `title`, and `image` and `thumb`, paths relative to the page (`cards/<note>.webp`, `cards/<note>-thumb.webp`). The export writes them into `cards/` beside the page (other files there are deleted), and the preview serves them (`GET /api/portfolio/cards/<path>`). The default template shows them as a grid; to add it to an existing template:

```jinja
{% if cards %}<section class="cards">{% for c in cards %}<a href="{{ c.image }}" target="_blank" rel="noopener"><img src="{{ c.thumb }}" alt="{{ c.title }}" loading="lazy"></a>{% endfor %}</section>{% endif %}
```

with, for example, `.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: .75rem } .cards img { width: 100% }`.

## Graph

The Graph shows notes as cards on a [React Flow](https://reactflow.dev) canvas, laid out by [ELK](https://eclipse.dev/elk/), with relationships as labeled edges (`dsl_crud/features/graph` on the server, `frontend/src/pages/graph`). Only notes without errors and not hidden from it (explorations among them, [`docs/hiding.md`](docs/hiding.md)) are part of it; a relationship to anything else is left out until it's fixed.

- **Pins**: a pinned note shows the notes up to its depth (the chevrons beside the pin) relationships away, in either direction. Picking a search result pins it at depth 2. The badge under a card counts its related notes not on the canvas; a click shows them. Pins are kept under `graph` in the config file.
- **Sidebar**: the note sidebar's results have a pin icon. Its query (over the graph's notes) is also what the toolbar's random search result and pin-all act on.
- **The graph's canvas**: right-click opens a quick search at the cursor; each pick pins a note, and it stays open for several picks. Double-click adds a note (the new-note modal). Drag from a card's edge dot onto another card to relate them, or onto empty canvas for a new note in the modal, its relationship from the dragged note staged (relabel, turn or drop it there). Drag a card by its grip to move it; it keeps its spot while it's on the canvas.
- **Cards**: the note component, viewed or edited (text with errors isn't saved), without the relationships widget (the edges are the relationships), with the grip, pin, hide (tags it `no-graph`) and delete tools, both with undo. A click on a solid edge label edits or deletes its explicit relationships (with undo). Inline relationships are unlabeled dashed arrows; clicking one edits its source note. A note link in a card opens that note in the sidebar. An explicit relationship suppresses an inline graph edge in the same direction.
- The toolbar: add note, unpin all, pin a random orphan, open a random note or search result, pin all search results (the first 100, without neighbors), zoom and fit.

## Viz blocks

A fenced block marked `thea` in a note's body, `extra` or `publish` block (```` ```thea ````, inserted by the editor's chart tool) holds the spec of an interactive visualization ([`docs/thea.md`](docs/thea.md)). Its button in the rendered note has the local `claude` CLI generate it, in the background: a small TypeScript project the CLI builds, lints and checks itself (offline, in headless Chromium, looking at screenshots), built into one HTML file that needs no network. Each version is kept in the data folder under `files/thea/<name>-<version>/` with its sources and a thumbnail; the header names it (`brisk-river-3`, a random name plus its version), the version before stays, older ones are deleted. The live viz runs in a sandboxed iframe; Graph and Canvas cards and lists show its thumbnail (the note's cover when it has no image). A badge says when the spec changed since it was built. Settings → "viz blocks" sets the CLI command, model, a cap per run (in the CLI's USD estimate; on a subscription nothing is billed) and a time limit; generating needs the CLI, npm and Chromium (`just chromium`), so on Termux viz blocks are only shown.

## Files

A note names files in the data folder with `media` clauses, any number of them ([`docs/files.md`](docs/files.md)). Its images and videos are shown above it, in order (several in a row scrolled sideways, enlarged into a view stepping through them); the first is its cover, the thumbnail in lists. Its other files are listed below its content: Jinja templates as buttons opening them in a text editor (Save ✓, Ctrl+S or Ctrl+Enter), Typst documents likewise (see below), anything else as a link.

The note editor accepts any number of images (downscaled to WebP, losslessly from PNG, GIF and BMP) and short videos, by paste or upload; on touch devices they also take a photo with the camera. Each is added after the note's others, removed on its own, and reordered by moving its `media` line. Uploads go into `images/` in the data folder as `<note>-<ms>.<ext>`; a file in `images/` or `files/` is deleted when it is removed and no other note names it.

### Typst documents

The editor's Typst tool attaches a new Typst document to the note (`files/<note>-<6 hex>.typ`, in a `media` clause) and opens it: the source beside its PDF (one at a time on a narrow screen). Saving writes it and builds the PDF next to it (`files/<note>-<6 hex>.pdf`); Typst's errors show above the source, and the PDF stays as it was. Paths in it are from the data folder: the image tools insert one of the note's images as `#image("/images/…")`, or upload (or paste) one, attaching it to the note first, so only while the note has no unsaved edits. Building needs the `typst` dependency group (the Python bindings; a uv default group). Termux doesn't install it, so there Typst files are read-only and the tool is missing.

Settings → "maintenance" lists, then on Delete removes (without undo):

- **past appointments**: valid `appointment` items dated before today (a month-only date counts once the month is over), with their files unless another note names them (`dsl_crud/features/maintenance`). Recurring and broken items are kept.
- **orphaned files**: files in `images/` and `files/` that no note names, in a `media` clause or anywhere else in its text or its Typst files, PDFs of Typst files no note names, and viz versions no viz block keeps (`dsl_crud/infrastructure/media.py`).

## PDF export

A note's PDF tool (in every mode, on the note as saved: explicit edits must be saved first, blur-committed ones are) opens a dialog: the content (main and `extra`, the default when there's an `extra`, or either alone), whether to include the note's images (on; above the text) and the paper (A4 or Letter). Export downloads `<note>.pdf` (`GET /api/items/<file>/pdf?content=both|body|extra&images=1|0&paper=A4|Letter`, `dsl_crud/features/pdf`). The text is the same Markdown rendering as the portfolio's, `[[references]]` as their display text or the target's heading, main and `extra` separated by a rule; a built viz block is its thumbnail, an unbuilt one is left out. It's printed by headless Chromium, like the card collages, so it needs the `cards` group and `just chromium`; without them (Termux) the tool is missing and the route answers 503.

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

The first run installs Python, numpy (Termux's package) and a venv in `~/.venvs/dsl-crud`; the other dependencies follow `pyproject.toml` (without the `cards` and `typst` groups: no card collages, no PDF export, and Typst files read-only, on the phone). The phone doesn't build the frontend: `frontend/dist` is committed and automatically refreshed after frontend changes reach `main`. Every run starts the server and opens the browser. Set the data folder to the notes under `/storage/emulated/0/...`. One-tap start with Termux:Widget: `mkdir -p ~/.shortcuts && ln -s ~/dsl-crud/termux.sh ~/.shortcuts/dsl`.

## Test

`just check` lints, typechecks and tests both sides; `uv run pytest` runs only the backend's tests.
