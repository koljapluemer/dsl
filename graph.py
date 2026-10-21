"""The graph view's backend: notes linked by their relationships, pinned onto a
canvas, and edited where the graph owns their relationship lines. Only
error-free notes are part of the graph; a relationship to anything else is
left out until it is fixed. Searching it is search.py's, scope "graph"."""

import random
import re
from collections import deque
from dataclasses import dataclass, field

import attachments
import dsl
import questions
import store
import views

MAX_DIRECT_RELATIONS = 28
MAX_SECONDARY_RELATIONS = 12
MAX_GRAPH_NODES = 140

UNLABELED_RELATION = store.UNLABELED_RELATION


# --- the graph's view of the index -------------------------------------------


class _View:
    """Error-free notes views.GRAPH_HIDING doesn't hide, and the relationships
    between them, from one locked look at the index."""

    def __init__(self, ix):
        self.entries = dict(ix.entries)
        self.notes = {n: e for n, e in ix.entries.items() if e.valid and not views.GRAPH_HIDING.hides(e.primary, e.tags)}
        self._rels = {name: store.effective_graph_rels(entry) for name, entry in self.notes.items()}
        self._incoming: dict[str, list[tuple[str, str, bool]]] = {}
        for source, rels in self._rels.items():
            for label, target, inline in rels:
                self._incoming.setdefault(target, []).append((source, label, inline))

    def outgoing(self, name: str) -> list[tuple[str, str, bool]]:
        """(label, target, inline)s, by kind, label, then target."""
        return sorted(((l, t, i) for l, t, i in self._rels[name] if t in self.notes),
                      key=lambda r: (r[2], r[0].casefold(), r[1]))

    def incoming(self, name: str) -> list[tuple[str, str, bool]]:
        """(source, label, inline)s, by kind, label, then source."""
        return sorted(((s, l, i) for s, l, i in self._incoming.get(name, ()) if s in self.notes),
                      key=lambda r: (r[2], r[1].casefold(), r[0]))

    def degree(self, name: str) -> int:
        """Relationships in and out."""
        return (sum(t in self.notes for _, t, _ in self._rels[name])
                + sum(s in self.notes for s, _, _ in self._incoming.get(name, ())))

    def neighbors(self, name: str) -> set[str]:
        return ({t for _, t, _ in self._rels[name] if t in self.notes}
                | {s for s, _, _ in self._incoming.get(name, ()) if s in self.notes})


def _view(max_age: float = 0) -> _View:
    with store.index(max_age) as ix:
        return _View(ix)


# --- graph --------------------------------------------------------------------


@dataclass
class _Build:
    nodes: dict[str, list[int]] = field(default_factory=dict)  # name -> [depth, order]
    edges: dict[str, dict] = field(default_factory=dict)
    queue: deque = field(default_factory=deque)
    skipped_relations: int = 0
    skipped_nodes: int = 0


def build(pins: list[dict]) -> dict:
    """Every pin with the notes within its depth: a breadth-first search from
    all pins at once, so when MAX_GRAPH_NODES is hit the notes left out are
    the farthest from every pin."""
    view = _view()
    b = _Build()
    for pin in pins:
        if pin["filename"] not in view.notes:
            continue
        existing = b.nodes.get(pin["filename"])
        b.nodes[pin["filename"]] = [0, existing[1] if existing else len(b.nodes)]
        if pin["depth"] > 0:
            _expand(view, b, pin["filename"], 0, pin["depth"])
    while b.queue:
        _expand(view, b, *b.queue.popleft())
    return _finalize(view, b)


def _expand(view: _View, b: _Build, name: str, depth: int, max_depth: int) -> None:
    out = [(name, t, l, inline, "outgoing") for l, t, inline in view.outgoing(name)]
    inc = [(s, name, l, inline, "incoming") for s, l, inline in view.incoming(name)]
    for relations in (out, inc):
        limit = MAX_DIRECT_RELATIONS if depth == 0 else MAX_SECONDARY_RELATIONS
        b.skipped_relations += max(0, len(relations) - limit)
        for source, target, label, inline, direction in relations[:limit]:
            edge_id = f"{source}__{target}__{'inline' if inline else label}"
            b.edges.setdefault(edge_id, {"id": edge_id, "source": source, "target": target, "label": label,
                                         "inline": inline, "direction": direction, "depth": depth + 1})
            neighbor = target if source == name else source
            # a note at the depth budget is still expanded, for its edges to notes already shown
            if depth + 1 <= max_depth and _register(b, neighbor, depth + 1):
                b.queue.append((neighbor, depth + 1, max_depth))


def _register(b: _Build, name: str, depth: int) -> bool:
    """Whether `name` is new to the graph."""
    if (existing := b.nodes.get(name)) is not None:
        existing[0] = min(existing[0], depth)
        return False
    if len(b.nodes) >= MAX_GRAPH_NODES:
        b.skipped_nodes += 1
        return False
    b.nodes[name] = [depth, len(b.nodes)]
    return True


def _finalize(view: _View, b: _Build) -> dict:
    warnings = []
    if b.skipped_relations:
        warnings.append(f"Truncated {b.skipped_relations} relationships to keep the graph responsive.")
    if b.skipped_nodes:
        warnings.append(f"Skipped {b.skipped_nodes} additional notes after hitting the graph size cap.")
    nodes = [_node(view, name, depth, b.nodes) for name, (depth, _) in b.nodes.items()]
    nodes.sort(key=lambda n: (n["depth"], -n["degree"], n["filename"]))
    return {
        "nodes": nodes,
        # an edge can lead to a note past its pin's depth, or cut by the size cap
        "edges": [e for e in b.edges.values() if e["source"] in b.nodes and e["target"] in b.nodes],
        "truncated": bool(warnings),
        "warnings": warnings,
    }


def _node(view: _View, name: str, depth: int, shown: dict) -> dict:
    return {
        "filename": name,
        "item": store._note(name, view.entries),
        "depth": depth,
        "degree": view.degree(name),
        # what pinning it at depth 1 would bring in
        "hiddenNeighbors": sum(n != name and n not in shown for n in view.neighbors(name)),
    }


# --- lists ----------------------------------------------------------------------


def random_note(exclude: list[str] = (), orphan: bool = False) -> str | None:
    """Any note not in `exclude`, or only one without relationships; None when there's none."""
    view = _view()
    excluded = set(exclude)
    pool = [n for n in view.notes if n not in excluded and (not orphan or view.degree(n) == 0)]
    return random.choice(pool) if pool else None


# --- pins -----------------------------------------------------------------------


def _valid_pins(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    return [{"filename": p["filename"], "depth": p["depth"]} for p in raw
            if isinstance(p, dict) and isinstance(p.get("filename"), str) and p["filename"].strip()
            and isinstance(p.get("depth"), int) and not isinstance(p["depth"], bool) and p["depth"] >= 0]


def pins() -> list[dict]:
    """The pins of the last graph shown."""
    return _valid_pins((store._config().get("graph") or {}).get("pins"))


def open_graph(raw_pins) -> dict:
    """The graph for `raw_pins`, which are kept for the next start."""
    if not isinstance(raw_pins, list):
        raise store.ValidationError("pins must be a list")
    pinned = _valid_pins(raw_pins)
    store._save_config(store._config() | {"graph": {"pins": pinned}})
    return build(pinned)


# --- edits ----------------------------------------------------------------------


def _stem(name: str) -> str:
    return name.removesuffix(".txt")


def _require(name: str):
    """The note's index entry; NotFound unless it's part of the graph."""
    with store.index() as ix:
        e = ix.entries.get(name)
    if e is None or not e.valid:
        raise store.NotFound(name)
    return e


def _label(label) -> str:
    label = (label or "").strip() if isinstance(label, str) or label is None else None
    if label is None or "\n" in label:
        raise store.ValidationError("invalid relationship label")
    return label or UNLABELED_RELATION


def _mutate(name: str, edit) -> None:
    """Applies `edit(lines, doc)` to the note's lines and writes the result;
    an unchanged note isn't written, so its modification time stays."""
    text = store.get(name)["text"]
    doc = dsl.parse(store.SCHEMA, text)
    if doc.errors:
        raise store.ValidationError(f'"{name}" has syntax errors - fix it in a text editor first.')
    lines = text.split("\n")
    edit(lines, doc)
    store.update(name, {"text": "\n".join(lines)})


def _relation_index(doc: dsl.Document, label: str, target: str) -> int:
    for r in doc.relations:
        if (r.label or UNLABELED_RELATION) == label and f"{r.target}.txt" == target:
            return r.line - 1
    raise store.NotFound("relationship")


def _append(lines: list[str], label: str, target: str) -> None:
    lines[:] = questions.add_relation("\n".join(lines), label, _stem(target)).split("\n")


def update(name: str, body: dict) -> None:
    """Writes the note's full text; refused when it has errors, since the
    note would drop out of the graph."""
    _require(name)
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str):
        raise store.ValidationError("text required")
    if errors := dsl.parse(store.SCHEMA, text).errors:
        listed = ", ".join(e.code if e.line is None else f"{e.code} (line {e.line})" for e in errors)
        raise store.ValidationError(f"Not saved - fix these first: {listed}.")
    store.update(name, {"text": text})


def connect(body: dict) -> dict:
    source, target = body.get("source"), body.get("target")
    _require(source)
    _require(target)
    label = _label(body.get("label"))
    _mutate(source, lambda lines, doc: _append(lines, label, target))
    return {"label": label}


def relabel(body: dict) -> None:
    label, target = body.get("label"), body.get("target")
    next_label = (body.get("nextLabel") or "").strip() or label

    def edit(lines, doc):
        lines[_relation_index(doc, label, target)] = f"-> {_label(next_label)} @{_stem(target)}"
    _mutate(body.get("source"), edit)


def delete_relation(body: dict) -> None:
    global _undo
    source, label, target = body.get("source"), body.get("label"), body.get("target")
    _mutate(source, lambda lines, doc: lines.pop(_relation_index(doc, label, target)))
    _undo = {"type": "relation", "source": source, "label": label, "target": target}


# --- delete, hide and undo ---------------------------------------------------------

# The last deletion or hide, for the undo popup: a note (its text and media bytes),
# a relationship, or a hidden note's text before it was tagged.
_undo: dict | None = None


def delete(name: str) -> None:
    global _undo
    e = _require(name)
    text = store.get(name)["text"]
    media = None
    if e.media:
        try:
            media = (e.media, attachments.read(e.media))
        except FileNotFoundError:
            pass
        attachments.release(name, e.media)
    store.delete(name)
    _undo = {"type": "note", "file": name, "text": text, "media": media}


def hide(name: str) -> None:
    """Tags the note with views.GRAPH_HIDING's tag, so it leaves the graph."""
    global _undo
    _require(name)
    text = store.get(name)["text"]
    store.hide(name, views.GRAPH_HIDING)
    _undo = {"type": "hide", "file": name, "text": text}


def undo() -> dict:
    """Restores the last deletion or hide; `restored` is false when there was none."""
    global _undo
    pending, _undo = _undo, None
    if pending is None:
        return {"restored": False}
    if pending["type"] == "note":
        store.create({"file": pending["file"], "text": pending["text"]})
        if pending["media"]:
            rel, data = pending["media"]
            attachments.restore(rel, data)
    elif pending["type"] == "hide":
        # not through _mutate: the note is hidden, so not part of the graph
        store.update(pending["file"], {"text": pending["text"]})
    else:
        _mutate(pending["source"], lambda lines, doc: _append(lines, pending["label"], pending["target"]))
    return {"restored": True}
