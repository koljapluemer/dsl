"""One image or video attachment per item, stored beside the item collection."""

import re
import time
from pathlib import Path

import dsl
import store
import views

IMAGES_DIR = "images"
MAX_VIDEO_BYTES = 250 * 1024 * 1024

_MEDIA_CLAUSE_RE = re.compile(r'(?<!\S)media\s+("(?:[^"\\]|\\.)*"|\S+)\s*')
_EXTENSIONS = {("image", "jpeg"): "jpg", ("video", "quicktime"): "mov"}


def _stem(name: str) -> str:
    return name.removesuffix(".txt")


def _media_token(path: str) -> str:
    quoted = '"' + path.replace('"', '\\"') + '"' if re.search(r'[\s"]', path) else path
    return f"{views.MEDIA_KEYWORD} {quoted}"


def _append_line(lines: list[str], line: str) -> None:
    while lines and not lines[-1].strip():
        lines.pop()
    lines.extend([line, ""])


def _set_media(lines: list[str], doc: dsl.Document, path: str | None) -> None:
    """Points the media clause at ``path``, preserving other clauses on its line."""
    clause = next((c for c in doc.clauses if c.keyword == views.MEDIA_KEYWORD), None)
    if clause is None:
        if path is None:
            return
        first = next(i for i, line in enumerate(lines) if line.strip())
        at = next((i for i in range(first + 1, len(lines)) if dsl.is_section_opener(store.SCHEMA, lines[i])), None)
        if at is None:
            _append_line(lines, _media_token(path))
        else:
            lines.insert(at, _media_token(path))
        return

    i = clause.line - 1
    alone = (all(c.keyword == views.MEDIA_KEYWORD for c in doc.clauses if c.line == clause.line)
             and not any(d.code == "unknown_keyword" and d.line == clause.line for d in doc.diagnostics))
    if alone:
        if path is None:
            del lines[i]
        else:
            lines[i] = _media_token(path)
    else:
        replaced = _MEDIA_CLAUSE_RE.sub(lambda match: "" if path is None else _media_token(path) + " ", lines[i], count=1)
        lines[i] = replaced.rstrip()


def _media_file(rel: str) -> Path:
    return store._dir() / rel


def release(owner: str, rel: str) -> None:
    """Deletes app-managed media once no item other than ``owner`` references it."""
    parts = rel.split("/")
    if len(parts) != 2 or parts[0] != IMAGES_DIR:
        return
    with store.index() as ix:
        if any(entry.media == rel for name, entry in ix.entries.items() if name != owner):
            return
    _media_file(rel).unlink(missing_ok=True)


def read(rel: str) -> bytes:
    return _media_file(rel).read_bytes()


def restore(rel: str, data: bytes) -> None:
    path = _media_file(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def attach(name: str, data: bytes, content_type: str) -> dict:
    """Writes an attachment and returns the updated item."""
    item = store.get(name)
    doc = dsl.parse(store.SCHEMA, item["text"])
    previous = views.media(doc)
    match = re.fullmatch(r"(image|video)/(\w+)", (content_type or "").split(";")[0].strip().lower())
    if not match:
        raise store.ValidationError("Unsupported media data.")
    kind, subtype = match.groups()
    ext = _EXTENSIONS.get((kind, subtype), subtype)
    allowed = views.IMAGE_EXTENSIONS if kind == "image" else views.VIDEO_EXTENSIONS
    if f".{ext}" not in allowed:
        raise store.ValidationError(f"Unsupported {kind} type: {ext}.")
    if kind == "video" and len(data) > MAX_VIDEO_BYTES:
        raise store.ValidationError(f"Video is too large; keep clips under {MAX_VIDEO_BYTES // (1024 * 1024)}MB.")

    rel = f"{IMAGES_DIR}/{_stem(name)}-{int(time.time() * 1000)}.{ext}"
    path = _media_file(rel)
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(data)
    lines = item["text"].replace("\r", "").split("\n")
    _set_media(lines, doc, rel)
    updated = store.update(name, {"text": "\n".join(lines)})
    if previous and previous != rel:
        release(name, previous)
    return store.with_refs(updated)


def clear(name: str) -> dict:
    """Removes an item's attachment and returns the updated item."""
    item = store.get(name)
    doc = dsl.parse(store.SCHEMA, item["text"])
    previous = views.media(doc)
    if not previous:
        return store.with_refs(item)
    lines = item["text"].replace("\r", "").split("\n")
    _set_media(lines, doc, None)
    updated = store.update(name, {"text": "\n".join(lines)})
    release(name, previous)
    return store.with_refs(updated)
