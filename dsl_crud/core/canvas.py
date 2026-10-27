"""A note's canvas: the nodes under `canvas` in its `data` block. See docs/canvas.md."""

import hashlib
import json
import math
import re

from dsl_crud.core import dsl

CANVAS_KEY = "canvas"
# a linked note, named as relationship targets are: without .txt
_NOTE_RE = re.compile(r"^[^\s|\[\]/\\]+$")
_FIELDS = {"id", "x", "y", "text", "note"}


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(nodes) -> tuple[list[dict], list[str]]:
    """The nodes, each `{id, x, y}` and exactly one of `text` or `note`, in
    that key order; and what's wrong with any that aren't. Nothing invalid is
    dropped quietly: a caller with problems must not write the canvas back."""
    if not isinstance(nodes, list):
        return [], ["`nodes` is not a list"]
    valid, problems, ids = [], [], set()
    for i, node in enumerate(nodes):
        where = f"node {i + 1}"
        if not isinstance(node, dict):
            problems.append(f"{where} is not a mapping")
            continue
        if unknown := set(node) - _FIELDS:
            problems.append(f"{where} has unknown keys: {', '.join(sorted(map(str, unknown)))}")
            continue
        id_ = node.get("id")
        if not isinstance(id_, str) or not id_:
            problems.append(f"{where} has no id")
            continue
        if id_ in ids:
            problems.append(f"{where} repeats the id {id_}")
            continue
        if not _number(node.get("x")) or not _number(node.get("y")):
            problems.append(f"{where} ({id_}) needs numbers x and y")
            continue
        text, note = node.get("text"), node.get("note")
        if (text is None) == (note is None):
            problems.append(f"{where} ({id_}) needs exactly one of text or note")
            continue
        if text is not None and not isinstance(text, str):
            problems.append(f"{where} ({id_}): text is not a string")
            continue
        if note is not None and not (isinstance(note, str) and _NOTE_RE.match(note)):
            problems.append(f"{where} ({id_}): note is not a note name")
            continue
        ids.add(id_)
        kind = {"text": text} if text is not None else {"note": note}
        valid.append({"id": id_, "x": node["x"], "y": node["y"], **kind})
    return valid, problems


def read(doc: dsl.Document) -> dict:
    """`{nodes, problems, rev, dataError}`: `dataError` when the `data` block
    can't be read (then there's nothing to write over safely)."""
    if "data" in doc.blocks and doc.data is None and any(line.strip() for line in doc.blocks["data"]):
        detail = next((d.detail for d in doc.diagnostics if d.code == "invalid_yaml"), None)
        return {"nodes": [], "problems": [], "rev": rev(None), "dataError": detail or "the data block is invalid"}
    stored = (doc.data or {}).get(CANVAS_KEY)
    if stored is None:
        return {"nodes": [], "problems": [], "rev": rev(None), "dataError": None}
    if not isinstance(stored, dict) or set(stored) != {"nodes"}:
        return {"nodes": [], "problems": ["`canvas` is not a mapping with just `nodes`"], "rev": rev(stored), "dataError": None}
    nodes, problems = validate(stored["nodes"])
    return {"nodes": nodes, "problems": problems, "rev": rev(stored), "dataError": None}


def rev(stored) -> str:
    """Identifies the stored canvas, to tell whether it changed since it was read."""
    return hashlib.sha1(json.dumps(stored, sort_keys=True, default=str).encode()).hexdigest()
