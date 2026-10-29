# Frontend architecture

`frontend/src` is feature-sliced. Each layer imports only from the layers below
it, and slices of one layer don't import each other. `just check` enforces this
(oxlint with `eslint-plugin-boundaries`, rules in `frontend/oxlint.config.ts`).

| Layer      | Holds                                                                 | May import from               |
|------------|-----------------------------------------------------------------------|-------------------------------|
| `pages`    | one folder per route; code only one page uses lives there             | meta, features, entities, dumb, api |
| `meta`     | flows that coordinate multiple features                               | features, entities, dumb, api |
| `features` | ways of acting on entities, named entity-action (`item-delete`)        | entities, dumb, api           |
| `entities` | one folder per entity (`item`, `graph`, …): queries, mutations, views | dumb, api                     |
| `dumb`     | generic pieces without app logic (modal, markdown, store, toasts)      | itself                        |
| `api`      | the fetch wrapper and the API's types                                 | itself                        |

`main.tsx`, `router.tsx` and `App.tsx` (tabs, toasts) sit at
the root. No other top-level folders.

Conventions:

- Something two features need goes down a layer, usually into `dumb` when it
  has no app logic. That's why the undo toast's store is `dumb/undo.ts` and not
  part of `item-delete`.
- Use `meta` only for real feature composition. For example, `note` is the
  note component every page shows notes with
  ([`note-component.md`](note-component.md)); it composes `item-edit`,
  `item-media`, `item-delete`, `item-relate`, `file-edit` and `source-bibtex` into its
  editor, tools and relationships; each feature remains usable on its own.
  The pieces it renders with that need no feature, `NoteContent` and
  `NoteLine`, are in `entities/item`, so features can show notes too.
  The note sidebar beside every page (`meta/note/NoteSidebar.tsx`) is part of
  that slice; its state (the URL's `s…` keys, `useOpenNote`, a page's own
  action on found notes) is `entities/item/sidebar.ts`, so pages and the note
  links in `entities` reach it without importing `meta`.
- Don't make a feature that only one page uses. Put it in the page's folder,
  split into files rather than one big page file.
- Canvas is a workspace for any note, not an item type (`pages/workspaces/canvas`, [`canvas.md`](canvas.md)).
  Canvas2Typ (`pages/workspaces/canvas2typ`) shows the Canvas loader (given
  its page's sidebar action) beside the note's Typst file, in `features/file-edit/TypstEditor` (which
  `TypstModal` puts in a modal). It cites sources itself (`@` completion, the
  cite picker, both from `entities/source`); the BibTeX cite tool is
  `source-bibtex`'s `BibtexCite`, which the page and the note component pass in
  as `bibtexTool`, since one feature doesn't import another.
  The tool rail floating over Graph and Canvas is `dumb/toolbar`.
- No `index.ts` re-exports. Import from the defining file.
- Messages go to the toast corner (`dumb/UndoToast.tsx`): `showNotice` for
  news, `showError` for what failed (`dumb/notice.ts`), and the undo offer.
  A failed query shows there too (`main.tsx`). Only a note's own save error is
  shown in the note.
- A note deleted here is marked so at once (`entities/item/deleted.ts`): every
  view of it stops showing it, its blur save doesn't write, and its own
  queries (backlinks) go inactive before anything refetches, so the refetches
  after the delete don't ask for a note that's gone. Writing it again
  (restore, or a new note under its name) clears the mark.
