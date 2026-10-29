"""Typst documents attached to notes: a `.typ` file a note names in a `media`
clause, compiled to the PDF beside it whenever it's written, citing sources
from the bibliography written before each compile. See docs/files.md."""

import secrets

from dsl_crud.core import canvas, dsl, edits, file_kinds
from dsl_crud.features.typst.citations import cited_keys
from dsl_crud.infrastructure import items as store
from dsl_crud.infrastructure import media, typst

# the relationship a note gets to each source its Typst files cite
SOURCE_LABEL = "source"


def status() -> dict:
    return typst.available()


def _require() -> None:
    if (reason := typst.missing()) is not None:
        raise typst.Unavailable(f"Typst files can't be built here: {reason}")


def create(name: str) -> dict:
    """A new Typst file from the template, named in another `media` clause of the
    note and compiled: the updated note, the file's path and the build's errors."""
    _require()
    store.get(name)
    stem = name.removesuffix(".txt")
    while media.exists(rel := f"{media.FILES_DIR}/{stem}-{secrets.token_hex(3)}.typ"):
        pass
    media.write_text(rel, file_kinds.TYPST.default)
    item = media.add(name, rel)
    return {"item": store.payload(item), "path": rel, "errors": typst.compile(rel)}


def save(rel: str, text: str, note: str | None = None) -> dict:
    """Writes the Typst file and compiles it; a failed build keeps the previous PDF.
    With `note` (which must name the file), the note gets a relationship to each
    source cited that it doesn't have yet; `item` is the note then, if it changed."""
    if file_kinds.kind(rel) is not file_kinds.TYPST:
        raise store.ValidationError(f"'{rel}' isn't a Typst file")
    _require()
    item = store.get(note) if note is not None else None
    if item is not None and rel not in item["files"]:
        raise store.ValidationError(f"'{note}' doesn't name '{rel}'")
    media.write_text(rel, text)
    errors = typst.compile(rel)
    out = {"errors": errors, "pdf": media.exists(file_kinds.pdf_of(rel))}
    if item is not None:
        by_key = store.source_files_by_key()
        cited = [by_key[k] for k in cited_keys(text) if k in by_key and by_key[k] != note]
        related = edits.add_relations(store.SCHEMA, item["text"], SOURCE_LABEL, cited)
        if related != item["text"]:
            out["item"] = store.payload(store.update(note, {"text": related}))
    return out


def cite_sources(note: str) -> list[str]:
    """The sources to offer first when citing in the note's Typst files: those it
    relates to (explicitly, then inline), then those on its canvas, each once."""
    doc = dsl.parse(store.SCHEMA, store.get(note)["text"])
    entries = store._INDEX.refresh()
    related = [f"{r.target}.txt" for r in doc.relations] + [t for _, t, inline in entries[note].graph_rels if inline]
    on_canvas = [f"{n['note']}.txt" for n in canvas.read(doc)["nodes"] if "note" in n]
    return [f for f in dict.fromkeys(related + on_canvas) if f in entries and entries[f].source_key is not None]
