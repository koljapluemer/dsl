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

The first image or video an item names is its displayed attachment (`media`
in the API's item, `views.media`): above the note, as the thumbnail in lists.
The note's attach tool replaces or removes that one only
(`files.attach`/`files.clear`); other `media` clauses stay as they are. The
item's other files are listed below its content (`FileList`).

To add a kind: add it to `KINDS` in `file_kinds.py` and in `files.ts`, with a
module in `kinds/` for what only it does.

## API

- `GET /api/files/<path>`: the file.
- `PUT /api/files/<path>` with `{text}`: writes a file of a kind edited as text, creating it.
- `GET /api/file-path?p=<path>`: its absolute path (the media modal's Copy Path).
- `PUT /api/items/<name>/media` (the upload's bytes and type) and `DELETE`: the displayed attachment.

## When files are deleted

`files.referenced` is the one rule for whether a file is still needed: another
item names it in a `media` clause or mentions its path anywhere in its text. A
file in `images/` or `files/` that nothing references is deleted

- when the item's displayed attachment is replaced or removed,
- with the item, when it's deleted in the Graph (restored by its undo) or as a past appointment,
- by Settings → maintenance → "orphaned files", which lists every unreferenced file in both folders first.
