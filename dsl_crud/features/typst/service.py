"""Typst documents attached to notes: a `.typ` file a note names in a `media`
clause, compiled to the PDF beside it whenever it's written. See docs/files.md."""

import secrets

from dsl_crud.core import file_kinds
from dsl_crud.infrastructure import items as store
from dsl_crud.infrastructure import media, typst


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


def save(rel: str, text: str) -> dict:
    """Writes the Typst file and compiles it; a failed build keeps the previous PDF."""
    if file_kinds.kind(rel) is not file_kinds.TYPST:
        raise store.ValidationError(f"'{rel}' isn't a Typst file")
    _require()
    media.write_text(rel, text)
    errors = typst.compile(rel)
    return {"errors": errors, "pdf": media.exists(file_kinds.pdf_of(rel))}
