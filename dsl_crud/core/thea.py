"""```thea fences: a visualization's spec in the body or a `text` block,
generated into `files/thea/<name>-<version>/` (see docs/thea.md). Not part of
the item language: to it these are ordinary fences."""

import re
from collections.abc import Callable
from dataclasses import dataclass

from dsl_crud.core import dsl

INFO = "thea"
DIR = "files/thea"
# what a version's folder holds besides the sources
BUILT, THUMB, META = "index.html", "thumb.webp", "thea.json"
# the built page has no network, wherever it's opened (the app adds `sandbox allow-scripts` as a header)
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:")
_HEADER = re.compile(r"^([ \t]{0,3}(?:`{3,}|~{3,}))[ \t]*thea(?:[ \t]+(\S+))?[ \t]*$")
_ID = re.compile(r"^([a-z]+-[a-z]+)(?:-([1-9][0-9]*))?$")
_DIR_ID = re.compile(r"^([a-z]+-[a-z]+)-([1-9][0-9]*)$")


@dataclass(frozen=True)
class Block:
    # "body" or the text block's keyword (`extra`, `publish`)
    section: str
    # its place among the item's thea blocks
    index: int
    # the 0-based line of its opening fence, and of its closing one
    line: int
    end: int
    # `<adjective>-<noun>`, None until it's first generated; version None until a generation succeeded
    name: str | None
    version: int | None
    spec: str

    @property
    def id(self) -> str | None:
        """Its current version's id, `<name>-<version>`; None when there's none."""
        return f"{self.name}-{self.version}" if self.name and self.version else None


def blocks(schema: dict, text: str) -> list[Block]:
    """Every closed thea fence in the body and the `text` blocks, in order."""
    lines = [l.replace("\r", "") for l in text.split("\n")]
    out: list[Block] = []
    for keyword, start, stop in dsl.text_spans(schema, text):
        i = start
        while i < stop:
            end = dsl.fence_end(lines, i)
            if end is None or end >= stop:
                i += 1
                continue
            if m := _HEADER.match(lines[i]):
                ident = _ID.match(m[2] or "")
                out.append(Block(keyword or "body", len(out), i, end,
                                 ident[1] if ident else None, int(ident[2]) if ident and ident[2] else None,
                                 "\n".join(lines[i + 1 : end]).strip()))
            i = end + 1
    return out


def replace(schema: dict, text: str, fn: Callable[[Block], str]) -> list[tuple[str | None, str]]:
    """Each Markdown part of `text` (`dsl.text_spans`: the body, keyword None,
    and each `text` block) as `(keyword, its text)`, every thea block's fence
    swapped for `fn(block)`, as lines of their own."""
    lines = [l.replace("\r", "") for l in text.split("\n")]
    viz = {b.line: b for b in blocks(schema, text)}
    out = []
    for keyword, start, stop in dsl.text_spans(schema, text):
        kept, i = [], start
        while i < stop:
            if block := viz.get(i):
                if part := fn(block):
                    kept += ["", part, ""]
                i = block.end + 1
                continue
            kept.append(lines[i])
            i += 1
        out.append((keyword, "\n".join(kept)))
    return out


def with_header(text: str, block: Block, name: str, version: int | None) -> str:
    """`text` with `block`'s opening fence naming `name` (and `version`)."""
    lines = text.split("\n")
    m = _HEADER.match(lines[block.line].replace("\r", ""))
    lines[block.line] = f"{m[1]}{INFO} {name}" + (f"-{version}" if version else "")
    return "\n".join(lines)


def kept(ids: list[str]) -> frozenset[str]:
    """The version ids whose folders `ids` (current versions) keep: each and the one before."""
    out = set()
    for ident in ids:
        if m := _DIR_ID.match(ident):
            out.add(ident)
            if int(m[2]) > 1:
                out.add(f"{m[1]}-{int(m[2]) - 1}")
    return frozenset(out)


def dir_id(rel: str) -> str | None:
    """The version id of the folder a data-folder path lies in, if it's in DIR."""
    prefix = DIR + "/"
    if not rel.startswith(prefix):
        return None
    ident = rel[len(prefix):].split("/")[0]
    return ident if _DIR_ID.match(ident) else None


def parse_id(ident: str) -> tuple[str, int] | None:
    m = _DIR_ID.match(ident)
    return (m[1], int(m[2])) if m else None
