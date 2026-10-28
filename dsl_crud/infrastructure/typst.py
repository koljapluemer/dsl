"""Typst files compiled to PDFs through the `typst` bindings. Needs the `typst`
dependency group; `available` says whether this install has it (not on Termux).
The compile runs in-process: Typst's own limits on loops and recursion stand in
for a timeout. See docs/files.md."""

import functools
import threading

from dsl_crud.core import file_kinds
from dsl_crud.infrastructure import items as store
from dsl_crud.infrastructure import media

_lock = threading.Lock()


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


def compile(rel: str) -> str | None:
    """Compiles the Typst file `rel` (paths in it from the data folder) to its PDF,
    replacing the old one only on success; the errors, as Typst renders them, otherwise."""
    if (reason := missing()) is not None:
        raise Unavailable(f"Typst files can't be built here: {reason}")
    import typst

    source = media.path(rel)
    with _lock:
        try:
            pdf = typst.compile(str(source), root=str(store._dir()), format="pdf")
        except typst.TypstError as e:
            return e.diagnostic or e.message
        media.write(file_kinds.pdf_of(rel), pdf)
    return None
