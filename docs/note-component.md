# The note component

Wherever a note is shown, it's `Note` (`frontend/src/meta/note/Note.tsx`).
Pages configure it with parameters; none renders a note on its own. The API
sends every note the same way, as an `Item` with `refs` and `sourceKey` (see
`store.payload`), so a list can hand its notes straight to it.

## Parameters

Defaults are full capabilities: anything not switched off is there.

| Parameter | Default | |
|---|---|---|
| `file`, `item`, `initial` | | the note (null for a new one, which only edits), as already loaded (else fetched), a new note's text |
| `render` | `full` | `full`; `simple`: the body and media only, no relationships, no mode toggle; `inline`: one line (below) |
| `modes` | edit, view, split | the modes offered; the toggle (top right) hides when only one is |
| `defaultMode` | `view` | the mode shown first |
| `mode`, `onModeChange` | | the mode, when the caller keeps it (Graph, Questions' `e`) |
| `persist` | | a key keeping the chosen mode in `sessionStorage`; the caller picks the scope (below) |
| `commit` | `explicit` | `explicit`: Save/Discard replace the toggle as soon as something is edited; `blur`: edits are written as focus leaves the note (and on Ctrl+Enter/Ctrl+S), no Save/Discard |
| `relationships` | on | the relationships widget (`full` only) |
| `relationshipsEditableInView` | on | in edit and split it's always editable |
| `initialPending` | | relationship changes staged from the start (the Graph's new related note) |
| `tools` | each where it applies | switch tools off, or `edit` on in `full` |
| `tagToggles` | | `{tag, icon, activeIcon?, title, activeTitle?}`: a tool adding or removing the tag |
| `extraTools` | | the page's own tools, first in the row: a button `{key, title, icon, onClick}` or any `{key, node}` |
| `mediaPosition` | `top` | `start`/`end`: the images and videos stacked beside the rest when the note is wide enough |
| `inlineChars`, `highlight`, `onClick` | 120 | inline: characters of the first line shown, text marked in it, the whole line clickable |
| `inlineWhole` | | inline: the whole body, uncut, instead of the first line (`inlineChars` and `highlight` then don't apply) |
| `onEdit` | | the `edit` tool does this instead of opening its own modal (Float keeps the modal to pause its stage) |
| `save`, `onDelete` | | write or delete instead of the items API (the Graph's own update and undo) |
| `onSaved`, `onCreated`, `onDeleted`, `onClose`, `onEscape`, `onRef` | | `onRef`: a click on a related or linked note, by default the note opened in the sidebar (`useOpenNote`) |
| `compactViz` | | viz blocks as their thumbnails, not live ([`thea.md`](thea.md)); Graph and Canvas cards |
| `editorExtensions`, `renderPreview`, `onTextChange` | | seams for a specialized workspace to extend CodeMirror, replace the normal preview, and observe the current draft; Document uses all three |

`NoteModal` is the note in a modal: in the editor first, explicit commit, and
Save closes it with a notice, as delete does. The New note button (above
the sidebar's search, on a phone the + at the bottom right, or `c`) opens it
for a new note; every `edit` tool and the sidebar's ⤢ tool open it.

## Layout

- **Header**: the tool row on the left; the mode toggle (or Save/Discard,
  or the spinner of a blur save) and close on the right.
- **Tools**, all icon buttons (`TOOL` in `tools.tsx`):
  - edit and split only: `media` (upload, any number at once, and the camera on touch devices; pasting works too), `typst` (a new Typst document attached to the saved note, opened in its modal; only where Typst is installed), `reference` (`[[`), `viz` (an empty ```` ```thea ```` block, its placeholder spec selected), `bibtex` (sources from the clipboard)
  - edit and split, sources only: `bibtexUpdate` (fills in the source from the clipboard's BibTeX, the conflicting fields chosen above the editor)
  - `copyKey`: a source's BibTeX key
  - tag toggles
  - `edit`: by default only in `simple` and `inline`
  - `delete`
- **Media**: the note's images and videos (`MediaGallery`,
  `entities/item/files`), rendered once, never in both panes. One is shown as
  before, more in a row of equal height scrolled sideways (a daisyUI
  `carousel`, swiped on touch) with their count. Enlarging one opens
  `MediaModal`, which steps through all of them (arrow buttons, ←/→). In view
  mode it shows the saved ones, each deletable from the enlarged view; in edit
  and split the staged ones (`useMediaAttachments`, `features/item-media`),
  each with a remove button. Saving removes the dropped ones, then uploads the
  new ones in order (`persistMedia`).
- **Content**:
  - view: `NoteContent` (`entities/item`), which is body and `extra` as Markdown, keyword lines and `data` highlighted, and never relationship lines
  - edit: the editor and its problems. Tab and Shift-Tab indent and outdent the line (or the selected lines) by two spaces; Esc then Tab moves focus out of the editor
  - split: editor and preview side by side, stacked when the note is narrow (a container query)
- **Files**: below the content, the saved note's files besides its images
  and videos (`FileList`, `entities/item/files`, [`files.md`](files.md)): files edited as text (Jinja templates) as buttons
  opening `TextFileModal` (`features/file-edit`), Typst files as buttons opening
  `TypstModal` (beside it) with a link to their PDF, other files as links.
- **Relationships**: below the content (see below).
- **Inline** (`NoteLine`, `entities/item`): the first line of the body,
  rendered as Markdown. It's cut after `inlineChars` characters of its text,
  not of its Markdown (`inlineMarkdown` in `dumb/markdown.ts`), with `…` when
  cut or when the body goes on. Next to it: the cover image as a thumbnail (`+N` for more), an
  icon for errors or warnings, and the tools. It never shows relationships.
  With `inlineWhole` it shows the whole body instead, uncut and without `…`,
  as `simple` renders it (`NoteContent`), the icon and tools at its top.

## Relationships

One widget (`features/item-relate/Relationships.tsx`) shows outgoing
relationships and backlinks together. Each takes two lines:

1. If editable: detach and delete (the other note) buttons, then the label in
   small caps. Clicking the label edits it. The arrow gives the direction:
   `→` from this note, `←` to it. Inline references (`[[…]]`) are `⇢`/`⇠`
   and are read-only, since they're edited in the prose.
2. The other note, inline.

Below the rows, the adder: a direction toggle, a label, and a note to pick or
write. Rows come from `rowsOf` (`relationModel.ts`): outgoing ones from the
note's text as edited, backlinks from the server, and the staged changes
applied.

What a change does depends on the commit policy (`useRelationOps`):

- **Staged**: explicit commit, in edit or split. Nothing is written.
  - Changes to this note's own lines are edits of the draft text, so the editor and preview show them at once.
  - Changes to other notes are queued as `PendingOp`s: relate to a new note, a backlink from an existing or new note, detach or relabel a backlink, delete the other note.
  - Save writes the text, then the queue, in order (`runPending`). Discard drops both.
- **Immediate**: view mode, or blur commit. The draft is saved first if it was edited, then each change is written at once.

## Mode persistence

Choose `persist` to match the page:
- **per view**: the same mode for whatever note is shown
- **per view and note**: each note keeps its own mode
- **none**: modals, and the Graph, which keeps one card in edit through its own interaction state

## Pages

| Page | Configuration |
|---|---|
| New (button, `c`) | `NoteModal` for a new note: edit only |
| Sidebar (every page) | full, view/edit, blur commit, persisted per note (`sidebar:<file>`), a tool opening it in `NoteModal`; the search results inline |
| Desk | full, all modes, explicit commit, persisted per note (`desk:<file>`), `fill` in its grid cell; links open on the desk |
| Document | full, edit/view, blur commit, edit first, persisted per view, no relationships widget; inline references in its editor and preview anchor full view/edit note cards in the left margin |
| Canvas | linked notes: full, view/edit, the mode from the canvas's interaction, blur commit, no relationships, delete through the canvas (with the node, undone together); its own tools as extra tools |
| Explorations | full, blur commit, edit first, persisted per view; the list inline |
| Graph | view/edit, the mode from the graph's interaction, no relationships (the edges are), its own save, delete and hide; grip and pin as extra tools; links open in the sidebar. A new note (double-click, Add note, a drag onto empty canvas) is the new-note modal; from a drag it starts with the relationship from the dragged note staged |
| Tasks | full, blur commit, edit first, persisted per note |
| Goals | inline and whole (`inlineWhole`) |
| Projects | inline, in their expandable wrapper with the issue count and an add-issue tool; issues inline and whole (`inlineWhole`) with the think/build tag toggle |
| Sources | the list inline, the open source edit only, blur commit; `copyKey` shows for any source |
| Published | the route tree's segment names only; the open note full, blur commit |
| Portfolio | full, blur commit, edit first, persisted per view, no relationships, no delete; a preview link as extra tool |
| Portfolio → cards | only in the modal, opened from the card's thumbnail; a new card's modal starts with `tags card` |
| Questions | full, view first, the mode kept by the page (`e` edits) |
| Calendar | inline, with the edit tool |
| Queue | simple or full (view first), as the toggle beside Next says (kept for the session); a tag toggle hides from the queue |
| Float | simple, with the edit tool (the page's modal, pausing the stage) and a tag toggle hiding from float |
| Tags | inline; a click marks it done |
| Suggest | simple (default) or full, as the toggle beside "Hold for next" says |
| Settings → maintenance | past appointments inline |

The other lists of notes render them inline too:
- every search result (`NoteSearch`: the note sidebar, the Graph's right-click search, the relationship adder's suggestions), with the match marked
- relationship rows
- BibTeX import candidates
