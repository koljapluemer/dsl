"""Typst files compiled to PDFs through the `typst` bindings. Needs the `typst`
dependency group; `available` says whether this install has it (not on Termux).
The compile runs in-process: Typst's own limits on loops and recursion stand in
for a timeout. Before each compile the bibliography (all sources, rendered by
the renderer the application registers) is written to BIBLIOGRAPHY, so a
document's `#bibliography("/sources.bib")` is always current. See docs/files.md."""

import functools
import threading
from typing import Callable

from dsl_crud.core import file_kinds
from dsl_crud.infrastructure import items as store
from dsl_crud.infrastructure import media

_lock = threading.Lock()

# in the data folder's root, where the app never deletes files
BIBLIOGRAPHY = "sources.bib"
_bibliography: Callable[[], str] | None = None


class Unavailable(RuntimeError):
    pass


@functools.cache
def missing() -> str | None:
    """Why Typst can't be used here, None if it can. Checked once per process."""
    try:
        import typst  # noqa: F401
    except ImportError:
        return "typst isn't installed (the `typst` dependency group)"
    return None


def available() -> dict:
    reason = missing()
    return {"available": reason is None, "reason": reason}


def register_bibliography(render: Callable[[], str]) -> None:
    global _bibliography
    _bibliography = render


def _write_bibliography() -> None:
    """Writes the bibliography when it changed (keeping the mtime otherwise)."""
    if _bibliography is None:
        return
    data = _bibliography().encode("utf-8")
    p = store._dir() / BIBLIOGRAPHY
    if not p.is_file() or p.read_bytes() != data:
        media.write(BIBLIOGRAPHY, data)


def compile(rel: str) -> str | None:
    """Compiles the Typst file `rel` (paths in it from the data folder) to its PDF,
    replacing the old one only on success; the errors, as Typst renders them, otherwise."""
    if (reason := missing()) is not None:
        raise Unavailable(f"Typst files can't be built here: {reason}")
    import typst

    source = media.path(rel)
    with _lock:
        _write_bibliography()
        try:
            pdf = typst.compile(str(source), root=str(store._dir()), format="pdf")
        except typst.TypstError as e:
            return e.diagnostic or e.message
        media.write(file_kinds.pdf_of(rel), pdf)
    return None
