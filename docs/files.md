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
| `files/`  | files the app creates otherwise (the portfolio's template) |

The app deletes files only inside these two folders. Files elsewhere in the
data folder may be named too; the app reads them but never deletes them.

## Kinds

A file's extension decides its kind: `file_kinds.py` on the server,
`frontend/src/entities/item/files/files.ts` (with one module per kind in
`kinds/`) in the browser. Keep both in line.

| kind    | extensions                       | what the app does                                    |
|---------|----------------------------------|------------------------------------------------------|
| `image` | jpg jpeg png gif webp bmp        | shown; an upload is downscaled to WebP first (`kinds/image.ts`) |
| `video` | mp4 webm mov                     | shown; an upload is written as is, up to 250 MB      |
| `jinja` | j2 jinja jinja2                  | edited as text in a modal, highlighted as Jinja in HTML (`kinds/jinja.ts`) |
| other   | anything else                    | listed, opens in a new tab                           |

An item's images and videos, in the order its `media` clauses name them, are
shown above the note (`MediaGallery`; `shownFiles` in `files.ts`). The first
is its cover (`media` in the API's item, `views.media`): the thumbnail in
lists. The note's attach tool adds any number, each in a new `media` clause
after the others (`files.attach`); each can be removed on its own
(`files.remove`), other clauses stay as they are. Reorder them by moving their
lines in the editor. The item's other files are listed below its content
(`FileList`).

To add a kind: add it to `KINDS` in `file_kinds.py` and in `files.ts`, with a
module in `kinds/` for what only it does.

## API

- `GET /api/files/<path>`: the file.
- `PUT /api/files/<path>` with `{text}`: writes a file of a kind edited as text, creating it.
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
item names it in a `media` clause or mentions its path anywhere in its text,
or, for a file in a viz version's folder, has a viz block whose current
version is that one or the next (`thea.kept`). A
file in `images/` or `files/` that nothing references is deleted

- when one of the item's images or videos is removed,
- with the item, when it's deleted in the Graph (restored by its undo) or as a past appointment,
- by Settings → maintenance → "orphaned files", which lists every unreferenced file in both folders first.
