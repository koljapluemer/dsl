"""Files in the data folder that aren't items, as items name them in `media`
clauses: reading, writing and deleting them, and editing those clauses. What
depends on a file's kind is in file_kinds. See docs/files.md."""

import re
import time
from pathlib import Path

import dsl
import file_kinds
import store
import views

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


def write_text(rel: str, text: str) -> None:
    """Writes a file of a text kind, creating it (and its folder) when needed."""
    if not file_kinds.kind(rel).text:
        raise store.ValidationError(f"'{rel}' isn't a text file")
    p = _resolve(rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)


def _managed(rel: str) -> bool:
    parts = rel.split("/")
    return len(parts) > 1 and parts[0] in MANAGED_DIRS


def referenced(rel: str, entries: dict, ignoring: str | None = None) -> bool:
    """Whether an item other than `ignoring` names `rel`, in a `media` clause or anywhere in its text."""
    low = rel.lower()
    return any(rel in e.files or low in e.lower for name, e in entries.items() if name != ignoring)


def release(rel: str, ignoring: str | None = None) -> None:
    """Deletes a file in a managed folder once no item (but `ignoring`) names it."""
    if _managed(rel) and not referenced(rel, store._INDEX.refresh(), ignoring):
        _resolve(rel).unlink(missing_ok=True)


def orphaned() -> list[str]:
    """Files in the managed folders that no item names."""
    entries = store._INDEX.refresh()
    out = []
    for folder in MANAGED_DIRS:
        d = store._dir() / folder
        if not d.is_dir():
            continue
        for p in d.rglob("*"):
            rel = p.relative_to(store._dir()).as_posix()
            if p.is_file() and not p.name.startswith(".") and not referenced(rel, entries):
                out.append(rel)
    return sorted(out)


def delete_orphaned() -> int:
    rels = orphaned()
    for rel in rels:
        _resolve(rel).unlink(missing_ok=True)
    return len(rels)


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


def _replace(lines: list[str], doc: dsl.Document, clause: dsl.Clause, rel: str | None) -> None:
    """Points `clause` at `rel`, or removes it, keeping other clauses on its line."""
    i = clause.line - 1
    alone = ([c for c in doc.clauses if c.line == clause.line] == [clause]
             and not any(d.code == "unknown_keyword" and d.line == clause.line for d in doc.diagnostics))
    if alone:
        if rel is None:
            del lines[i]
        else:
            lines[i] = _line(rel)
        return
    arg = clause.args[0]
    pattern = rf'(?<!\S){views.MEDIA_KEYWORD}\s+(?:{re.escape(_token(arg))}|{re.escape(arg)})(?!\S)\s*'
    lines[i] = re.sub(pattern, lambda _: "" if rel is None else _line(rel) + " ", lines[i], count=1).rstrip()


def _edit(name: str, change) -> dict:
    """Applies `change(lines, doc)` to the item's text and writes it."""
    text = store.get(name)["text"]
    lines = text.replace("\r", "").split("\n")
    change(lines, dsl.parse(store.SCHEMA, text))
    return store.update(name, {"text": "\n".join(lines)})


def _set_shown(lines: list[str], doc: dsl.Document, rel: str | None) -> None:
    """Points the displayed attachment's clause at `rel` (None removes it); other files stay."""
    shown = views.media(doc)
    clause = next((c for c in doc.clauses if c.keyword == views.MEDIA_KEYWORD and c.args and c.args[0] == shown), None)
    if clause is not None:
        _replace(lines, doc, clause, rel)
    elif rel is not None:
        _insert(lines, doc, rel)


def add(name: str, rel: str) -> dict:
    """Names `rel` in another `media` clause of the item, unless it already does."""
    def change(lines, doc):
        if rel not in views.files(doc):
            _insert(lines, doc, rel)
    return _edit(name, change)


def attach(name: str, data: bytes, content_type: str) -> dict:
    """Writes an uploaded image or video as the item's displayed attachment and returns the updated item."""
    previous = store.get(name)["media"]
    try:
        ext = file_kinds.upload_extension(content_type, len(data))
    except file_kinds.UploadError as e:
        raise store.ValidationError(str(e)) from e
    ms = int(time.time() * 1000)
    while _resolve(rel := f"{IMAGES_DIR}/{_stem(name)}-{ms}.{ext}").exists():
        ms += 1
    restore(rel, data)
    updated = _edit(name, lambda lines, doc: _set_shown(lines, doc, rel))
    if previous and previous != rel:
        release(previous)
    return store.payload(updated)


def clear(name: str) -> dict:
    """Removes the item's displayed attachment and returns the updated item."""
    item = store.get(name)
    previous = item["media"]
    if not previous:
        return store.payload(item)
    updated = _edit(name, lambda lines, doc: _set_shown(lines, doc, None))
    release(previous)
    return store.payload(updated)
