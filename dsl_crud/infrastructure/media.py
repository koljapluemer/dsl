"""Files in the data folder that aren't items, as items name them in `media`
clauses: reading, writing and deleting them, and editing those clauses. What
depends on a file's kind is in file_kinds. See docs/files.md."""

import re
import time
from pathlib import Path

from dsl_crud.core import documents as views
from dsl_crud.core import dsl, file_kinds, thea
from dsl_crud.infrastructure import items as store

# Uploads go to IMAGES_DIR, files the app creates otherwise to FILES_DIR. The
# app deletes files only inside these folders.
IMAGES_DIR = "images"
FILES_DIR = "files"
MANAGED_DIRS = (IMAGES_DIR, FILES_DIR)


def _stem(name: str) -> str:
    return name.removesuffix(".txt")


def _resolve(rel: str) -> Path:
    """The file `rel` names in the data folder: a valid `path` value that isn't an item."""
    if not dsl.value_type(rel, ["path"]) or ("/" not in rel and rel.endswith(".txt")):
        raise store.ValidationError(f"invalid file path '{rel}'")
    return store._dir() / rel


def path(rel: str) -> Path:
    """An existing file in the data folder, never outside it."""
    p = _resolve(rel)
    if not p.is_file():
        raise store.NotFound(rel)
    return p


def exists(rel: str) -> bool:
    return _resolve(rel).is_file()


def read(rel: str) -> bytes:
    return path(rel).read_bytes()


def restore(rel: str, data: bytes) -> None:
    p = _resolve(rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def read_text(rel: str) -> str:
    if not file_kinds.kind(rel).text:
        raise store.ValidationError(f"'{rel}' isn't a text file")
    return path(rel).read_text(encoding="utf-8")


def write(rel: str, data: bytes) -> None:
    """Replaces the file at once (a reader never sees it half written), creating it (and its folder) when needed."""
    p = _resolve(rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.tmp")
    tmp.write_bytes(data)
    tmp.replace(p)


def write_text(rel: str, text: str) -> None:
    """Writes a file of a text kind, creating it (and its folder) when needed."""
    if not file_kinds.kind(rel).text:
        raise store.ValidationError(f"'{rel}' isn't a text file")
    write(rel, text.encode("utf-8"))


def _managed(rel: str) -> bool:
    parts = rel.split("/")
    return len(parts) > 1 and parts[0] in MANAGED_DIRS


def typst_texts(entries: dict, ignoring: str | None = None) -> list[str]:
    """The lowercased texts of the Typst files items (but `ignoring`) name, read
    now: a Typst file changes without its item's mtime changing."""
    out = []
    for name, e in entries.items():
        if name == ignoring:
            continue
        for rel in e.files:
            if file_kinds.kind(rel) is file_kinds.TYPST:
                try:
                    out.append(path(rel).read_text(encoding="utf-8").lower())
                except (store.NotFound, store.ValidationError, OSError, UnicodeDecodeError):
                    continue
    return out


def referenced(rel: str, entries: dict, ignoring: str | None = None, typst: list[str] | None = None) -> bool:
    """Whether an item other than `ignoring` names `rel`, in a `media` clause or
    anywhere in its text or its Typst files' (`typst`: their typst_texts, read
    when not given), or names the Typst file a PDF is compiled from, or, for a
    file in a viz version's folder, has a viz block keeping that version (see thea.kept)."""
    low = rel.lower()
    viz = thea.dir_id(rel)
    source = file_kinds.typst_source(rel)
    if any(rel in e.files or low in e.lower or (viz is not None and viz in e.thea_dirs) or (source is not None and source in e.files)
           for name, e in entries.items() if name != ignoring):
        return True
    return any(low in text for text in (typst_texts(entries, ignoring) if typst is None else typst))


def release(rel: str, ignoring: str | None = None) -> None:
    """Deletes a file in a managed folder once no item (but `ignoring`) names it,
    with the PDF compiled from it, for a Typst file."""
    if _managed(rel) and not referenced(rel, store._INDEX.refresh(), ignoring):
        _resolve(rel).unlink(missing_ok=True)
        if file_kinds.kind(rel) is file_kinds.TYPST:
            _resolve(file_kinds.pdf_of(rel)).unlink(missing_ok=True)


def orphaned() -> list[str]:
    """Files in the managed folders that no item names."""
    entries = store._INDEX.refresh()
    typst = typst_texts(entries)
    out = []
    for folder in MANAGED_DIRS:
        d = store._dir() / folder
        if not d.is_dir():
            continue
        for p in d.rglob("*"):
            rel = p.relative_to(store._dir()).as_posix()
            if p.is_file() and not p.name.startswith(".") and not referenced(rel, entries, typst=typst):
                out.append(rel)
    return sorted(out)


def delete_orphaned() -> int:
    rels = orphaned()
    for rel in rels:
        _resolve(rel).unlink(missing_ok=True)
    _prune(store._dir() / thea.DIR)
    return len(rels)


def _prune(folder: Path) -> None:
    """Removes the empty folders below `folder`."""
    if not folder.is_dir():
        return
    for d in sorted((p for p in folder.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        if not any(d.iterdir()):
            d.rmdir()


# --- the `media` clauses ---------------------------------------------------------


def _token(rel: str) -> str:
    return '"' + rel.replace('"', '\\"') + '"' if re.search(r'[\s"]', rel) else rel


def _line(rel: str) -> str:
    return f"{views.MEDIA_KEYWORD} {_token(rel)}"


def _insert_at(lines: list[str], doc: dsl.Document) -> int | None:
    """Where a new `media` line goes: after the last one, else at the keyword
    section's start; None for the end of the file."""
    last = max((c.line for c in doc.clauses if c.keyword == views.MEDIA_KEYWORD), default=None)
    if last is not None:
        return last
    first = next(i for i, line in enumerate(lines) if line.strip())
    return next((i for i in range(first + 1, len(lines)) if dsl.is_section_opener(store.SCHEMA, lines[i])), None)


def _insert(lines: list[str], doc: dsl.Document, rel: str) -> None:
    at = _insert_at(lines, doc)
    if at is not None:
        lines.insert(at, _line(rel))
        return
    while lines and not lines[-1].strip():
        lines.pop()
    lines.extend([_line(rel), ""])


def _drop(lines: list[str], doc: dsl.Document, clause: dsl.Clause) -> None:
    """Removes `clause`, keeping other clauses on its line."""
    i = clause.line - 1
    alone = ([c for c in doc.clauses if c.line == clause.line] == [clause]
             and not any(d.code == "unknown_keyword" and d.line == clause.line for d in doc.diagnostics))
    if alone:
        del lines[i]
        return
    arg = clause.args[0]
    pattern = rf'(?<!\S){views.MEDIA_KEYWORD}\s+(?:{re.escape(_token(arg))}|{re.escape(arg)})(?!\S)\s*'
    lines[i] = re.sub(pattern, "", lines[i], count=1).rstrip()


def _edit(name: str, change) -> dict:
    """Applies `change(lines, doc)` to the item's text and writes it."""
    text = store.get(name)["text"]
    lines = text.replace("\r", "").split("\n")
    change(lines, dsl.parse(store.SCHEMA, text))
    return store.update(name, {"text": "\n".join(lines)})


def add(name: str, rel: str) -> dict:
    """Names `rel` in another `media` clause of the item, unless it already does."""
    def change(lines, doc):
        if rel not in views.files(doc):
            _insert(lines, doc, rel)
    return _edit(name, change)


def attach(name: str, data: bytes, content_type: str) -> dict:
    """Writes an uploaded image or video, names it in a new `media` clause after
    the item's others and returns the updated item (the upload is its last file)."""
    try:
        ext = file_kinds.upload_extension(content_type, len(data))
    except file_kinds.UploadError as e:
        raise store.ValidationError(str(e)) from e
    ms = int(time.time() * 1000)
    while _resolve(rel := f"{IMAGES_DIR}/{_stem(name)}-{ms}.{ext}").exists():
        ms += 1
    restore(rel, data)
    return store.payload(add(name, rel))


def remove(name: str, rel: str) -> dict:
    """Removes the item's `media` clause naming `rel` (if it still has one), deletes
    the file once nothing references it, and returns the updated item."""
    def change(lines, doc):
        clause = next((c for c in doc.clauses if c.keyword == views.MEDIA_KEYWORD and c.args and c.args[0] == rel), None)
        if clause is not None:
            _drop(lines, doc, clause)
    item = store.get(name)
    updated = _edit(name, change) if rel in item["files"] else item
    release(rel)
    return store.payload(updated)
