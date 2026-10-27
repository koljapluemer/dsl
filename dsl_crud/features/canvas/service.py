"""A note's canvas, read and written as one value in its `data` block."""

import threading

from dsl_crud.core import canvas, dsl, edits
from dsl_crud.infrastructure import items
from dsl_crud.infrastructure.errors import Conflict, ValidationError

# a write reads, checks and rewrites the note: one at a time
_LOCK = threading.Lock()


def get(name: str) -> dict:
    return canvas.read(dsl.parse(items.SCHEMA, items.get(name)["text"]))


def put(name: str, body) -> dict:
    """Writes `nodes` over the stored canvas if it's still the one with `rev`
    (else Conflict). Only the canvas key's lines change, so edits to the rest
    of the note in the meantime are kept."""
    body = body if isinstance(body, dict) else {}
    nodes, problems = canvas.validate(body.get("nodes"))
    if problems:
        raise ValidationError("; ".join(problems))
    with _LOCK:
        text = items.get(name)["text"]
        current = canvas.read(dsl.parse(items.SCHEMA, text))
        if current["dataError"]:
            raise ValidationError(f"the note's data block is invalid: {current['dataError']}")
        if current["problems"]:
            raise ValidationError("the stored canvas has problems; fix them in the note first")
        if body.get("rev") != current["rev"]:
            raise Conflict("the canvas was changed elsewhere")
        try:
            written = edits.set_data_key(items.SCHEMA, text, canvas.CANVAS_KEY, {"nodes": nodes})
        except edits.DataError as e:
            raise ValidationError(str(e)) from e
        items.update(name, {"text": written})
        return {"rev": canvas.read(dsl.parse(items.SCHEMA, written))["rev"]}


def create_note(body) -> dict:
    """A new note with the text as its body (lines that would start its keyword section indented)."""
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("text required")
    return items.payload(items.create({"text": edits.body_text(items.SCHEMA, text.strip("\n"))}))
