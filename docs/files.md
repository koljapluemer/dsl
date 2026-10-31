# Files

Besides its items (`*.txt`, directly in it), the data folder holds files that
aren't items: images, videos, templates, anything else. An item names a file
in a `media` clause, any number of times (`repeat` in
[`spec/keywords.yaml`](../spec/keywords.yaml)):

```
Portfolio
media images/portrait-1712345678901.webp
media files/portfolio-a1b2c3.html.j2
tags portfolio
```

The path is relative to the data folder. Nothing but `media` clauses links a
file to an item; a file may be named by several items, or by none.

## Folders

| folder    | holds                                                    |
|-----------|----------------------------------------------------------|
| `images/` | uploads: images and videos attached in the note editor, as `<note>-<ms>.<ext>` |
| `files/`  | files the app creates otherwise (the portfolio's template, Typst documents and their PDFs, flashcards' review state in `files/flashcards/`) |

The app deletes files only inside these two folders. Files elsewhere in the
data folder may be named too; the app reads them but never deletes them.

## Kinds

A file's extension decides its kind: `file_kinds.py` on the server,
`frontend/src/entities/item/files/files.ts` (with one module per kind in
`kinds/`) in the browser. Keep both in line.

| kind    | extensions                       | what the app does                                    |
|---------|----------------------------------|------------------------------------------------------|
| `image` | jpg jpeg png gif webp bmp        | shown; an upload is downscaled to WebP first (`kinds/image.ts`), losslessly from PNG, GIF and BMP |
| `video` | mp4 webm mov                     | shown; an upload is written as is, up to 250 MB      |
| `jinja` | j2 jinja jinja2                  | edited as text in a modal, highlighted as Jinja in HTML (`kinds/jinja.ts`) |
| `typst` | typ                              | edited as text, highlighted as Typst (`codemirror-lang-typst`), beside its PDF, which is built when it's written (`kinds/typst.ts`, see below) |
| `flashcard` | json, only in `files/flashcards/` | a flashcard's review state, hidden: not listed ([`flashcards.md`](flashcards.md)) |
| other   | anything else                    | listed, opens in a new tab                           |

An item's images and videos, in the order its `media` clauses name them, are
shown above the note (`MediaGallery`; `shownFiles` in `files.ts`). The first
is its cover (`media` in the API's item, `views.media`): the thumbnail in
lists. The note's attach tool adds any number, each in a new `media` clause
after the others (`files.attach`); each can be removed on its own
(`files.remove`), other clauses stay as they are. Reorder them by moving their
lines in the editor. The item's other files, except hidden kinds, are listed
below its content (`FileList`).

To add a kind: add it to `KINDS` in `file_kinds.py` and in `files.ts`, with a
module in `kinds/` for what only it does.

## Typst files

A Typst file is compiled to the PDF beside it, the same name with `.pdf`
(`pdf_of` in `file_kinds.py`, `pdfOf` in `kinds/typst.ts`), each time it's
written through `PUT /api/typst/<path>`; when the build fails the file is
still written, the PDF stays as it was and Typst's errors are returned. No
`media` clause names the PDF: it's kept while its Typst file is. Paths in a
Typst file are from the data folder (Typst's root), so `#image("/images/…")`
uses one of the note's images; an image it mentions is kept even when no item
names it any more. The compile runs in the server's process
(`infrastructure/typst.py`, one at a time) with the `typst` bindings, the
`typst` dependency group; Typst's own limits on loops and recursion stand in
for a timeout. Where the bindings are missing (Termux), Typst files can't be
written or created there (503).

Before each compile, every source is written to `sources.bib` in the data
folder's root (`BIBLIOGRAPHY` in `infrastructure/typst.py`), only when it
changed: biblatex in UTF-8, rendered by `bibtex_export.typst_bibliography`,
which the application factory registers (`register_bibliography`), since the
Typst feature doesn't import the sources feature. It's outside `images/` and
`files/`, so the app never deletes it. A document cites from it with
`@key` or `#cite(label("…"))` after `#bibliography("/sources.bib")`. Saved
with its note, the note gets `-> source @…` to each source cited that it
doesn't relate to that way yet (`features/typst/citations.py` finds the keys,
skipping strings and comments).

## API

- `GET /api/files/<path>`: the file, revalidated on every use (`no-cache`, by ETag), so a rebuilt PDF never shows stale.
- `PUT /api/files/<path>` with `{text}`: writes a file of a kind edited as text, creating it.
- `PUT /api/typst/<path>` with `{text, note?}`: writes a Typst file and builds its PDF: `{errors, pdf, item?}` (`errors` null when it built; whether the PDF exists). With `note` (which must name the file; else 400), the note is related to the sources cited; `item` is the note when that changed it.
- `GET /api/typst/cite-sources?note=<name>`: the sources to offer first when citing: those the note relates to (explicitly, then inline), then those on its canvas, each once.
- `POST /api/items/<name>/typst`: a new Typst file from the template, as the item's last `media`, built: `{item, path, errors}`.
- `GET /api/typst/status`: `{available, reason}`.
- `GET /api/typst/notes`: the items naming a Typst file, the last edited first (the Canvas2Typ tab).
- `GET /api/file-path?p=<path>`: its absolute path (the media modal's Copy Path).
- `POST /api/items/<name>/media` (the upload's bytes and type): adds it as the item's last `media`.
- `DELETE /api/items/<name>/media?p=<path>`: drops the item's `media` clause naming the path.

## Viz blocks

A viz block's versions are folders `files/thea/<name>-<version>/` (sources,
`index.html`, `thumb.webp`, `thea.json`), named by the block's header rather
than by `media` clauses ([`thea.md`](thea.md)). When a note names no image or
video, its first viz's thumbnail is its cover.

## When files are deleted

`files.referenced` is the one rule for whether a file is still needed: another
item names it in a `media` clause or mentions its path anywhere in its text or
in a Typst file it names, names the Typst file it's the PDF of, or, for a file in a viz version's folder, has a viz block whose current
version is that one or the next (`thea.kept`). A
file in `images/` or `files/` that nothing references is deleted

- when one of the item's files is removed (a Typst file with its PDF),
- with the item, when it's deleted in the Graph (restored by its undo) or as a past appointment,
- by Settings → maintenance → "orphaned files", which lists every unreferenced file in both folders first.
