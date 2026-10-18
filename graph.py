"""The graph view's backend: notes linked by their relationships, pinned onto a
canvas, searched with a small query language, and edited where the graph
owns their lines (relationships, `media`). Only error-free notes are part of
the graph; a relationship to anything else is left out until it is fixed."""

import heapq
import math
import random
import re
import time
import unicodedata
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import regex

import dsl
import questions
import store
import views

MAX_DIRECT_RELATIONS = 28
MAX_SECONDARY_RELATIONS = 12
MAX_GRAPH_NODES = 140
PAGE_SIZE = 40
PIN_ALL_CAP = 100
# Search runs per keystroke: a folder scan per query would lag on a big folder.
SEARCH_MAX_AGE = 2.0

IMAGES_DIR = "images"
MAX_VIDEO_BYTES = 250 * 1024 * 1024
UNLABELED_RELATION = store.UNLABELED_RELATION


# --- the graph's view of the index -------------------------------------------


class _View:
    """Error-free notes and the relationships between them, from one locked
    look at the index."""

    def __init__(self, ix):
        self.notes = {n: e for n, e in ix.entries.items() if e.valid}
        self._incoming = dict(ix.incoming)

    def outgoing(self, name: str) -> list[tuple[str, str]]:
        """(label, target)s, by label then target."""
        return sorted(((l, t) for l, t in self.notes[name].rels if t in self.notes), key=lambda r: (r[0].casefold(), r[1]))

    def incoming(self, name: str) -> list[tuple[str, str]]:
        """(source, label)s, by label then source."""
        return sorted(((s, l) for s, l in self._incoming.get(name, ()) if s in self.notes), key=lambda r: (r[1].casefold(), r[0]))

    def degree(self, name: str) -> int:
        """Relationships in and out."""
        return (sum(t in self.notes for _, t in self.notes[name].rels)
                + sum(s in self.notes for s, _ in self._incoming.get(name, ())))

    def neighbors(self, name: str) -> set[str]:
        return ({t for _, t in self.notes[name].rels if t in self.notes}
                | {s for s, _ in self._incoming.get(name, ()) if s in self.notes})


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
    out = [(name, t, l, "outgoing") for l, t in view.outgoing(name)]
    inc = [(s, name, l, "incoming") for s, l in view.incoming(name)]
    for relations in (out, inc):
        limit = MAX_DIRECT_RELATIONS if depth == 0 else MAX_SECONDARY_RELATIONS
        b.skipped_relations += max(0, len(relations) - limit)
        for source, target, label, direction in relations[:limit]:
            edge_id = f"{source}__{target}__{label}"
            b.edges.setdefault(edge_id, {"id": edge_id, "source": source, "target": target, "label": label,
                                         "direction": direction, "depth": depth + 1})
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
    e = view.notes[name]
    return {
        "filename": name,
        "body": e.body,
        "image": e.media,
        "extraContent": e.extra,
        "sectionLines": list(e.section_lines),
        "dataText": e.data_text,
        "depth": depth,
        "degree": view.degree(name),
        # what pinning it at depth 1 would bring in
        "hiddenNeighbors": sum(n != name and n not in shown for n in view.neighbors(name)),
    }


# --- search query language ------------------------------------------------------

FIELDS = ("content", "body", "extra", "file")


class IncompleteQuery(Exception):
    """A valid query prefix that only needs more input."""


@dataclass
class Term:
    value: str
    match: str  # fuzzy | exact | regex
    flags: str = ""


@dataclass
class Op:
    type: str  # and | or
    children: list


@dataclass
class Not:
    child: object


@dataclass
class Scope:
    field: str
    child: object


def _tokenize_query(source: str) -> list[tuple]:
    """(type, value, flags)s."""
    tokens, i = [], 0
    while i < len(source):
        c = source[i]
        if c.isspace():
            i += 1
        elif c in "()-:":
            tokens.append(({"(": "open", ")": "close", "-": "minus", ":": "colon"}[c], None, None))
            i += 1
        elif c == '"':
            value, i = _read_delimited(source, i + 1, '"')
            tokens.append(("phrase", re.sub(r'\\(["\\])', r"\1", value), None))
        elif c == "/":
            value, i = _read_delimited(source, i + 1, "/")
            start = i
            while i < len(source) and source[i].isascii() and source[i].isalpha():
                i += 1
            flags = source[start:i]
            if not re.fullmatch(r"[ims]*", flags):
                raise store.ValidationError("Regex flags may only contain i, m, or s.")
            tokens.append(("regex", value, flags))
        else:
            start = i
            while i < len(source) and not (source[i].isspace() or source[i] in "():"):
                i += 1
            value = source[start:i]
            tokens.append(("or" if value == "OR" else "word", value, None))
    return tokens


def _read_delimited(source: str, start: int, delimiter: str) -> tuple[str, int]:
    value, escaped = [], False
    for i in range(start, len(source)):
        c = source[i]
        if not escaped and c == delimiter:
            return "".join(value), i + 1
        escaped = not escaped and c == "\\"
        value.append(c)
    raise IncompleteQuery("Unclosed quoted phrase." if delimiter == '"' else "Unclosed regular expression.")


class _Parser:
    """Adjacent expressions are an implicit AND; OR binds looser."""

    def __init__(self, tokens: list[tuple]):
        self.tokens, self.i = tokens, 0

    def peek(self, offset: int = 0):
        j = self.i + offset
        return self.tokens[j] if j < len(self.tokens) else None

    def parse(self):
        query = self.parse_or()
        if self.peek():
            raise store.ValidationError("Unexpected token in search query.")
        return query

    def parse_or(self):
        children = [self.parse_and()]
        while (t := self.peek()) and t[0] == "or":
            self.i += 1
            children.append(self.parse_and())
        return children[0] if len(children) == 1 else Op("or", children)

    def parse_and(self):
        children = []
        while (t := self.peek()) and t[0] in ("word", "phrase", "regex", "minus", "open"):
            children.append(self.parse_unary())
        if not children:
            raise IncompleteQuery("Expected a search term.")
        return children[0] if len(children) == 1 else Op("and", children)

    def parse_unary(self):
        t = self.peek()
        if t and t[0] == "minus":
            self.i += 1
            return Not(self.parse_unary())
        nxt = self.peek(1)
        if t and t[0] == "word" and nxt and nxt[0] == "colon":
            if t[1].lower() in FIELDS:
                self.i += 2
                return Scope(t[1].lower(), self.parse_unary())
            value = self.peek(2)
            if value and value[0] == "word":
                self.i += 3
                return Term(f"{t[1]}:{value[1]}", "fuzzy")
        return self.parse_primary()

    def parse_primary(self):
        t = self.peek()
        if not t:
            raise IncompleteQuery("Expected a search term.")
        self.i += 1
        if t[0] == "open":
            query = self.parse_or()
            close = self.peek()
            self.i += 1
            if not close or close[0] != "close":
                raise IncompleteQuery("Unclosed parenthesis in search query.")
            return query
        if t[0] in ("word", "phrase", "regex"):
            return Term(t[1], {"word": "fuzzy", "phrase": "exact", "regex": "regex"}[t[0]], t[2] or "")
        raise store.ValidationError("Expected a search term.")


def parse_query(source: str):
    return _Parser(_tokenize_query(source)).parse()


# --- search ---------------------------------------------------------------------

# Re-ranked by score at the head of a result list; the tail keeps the engine's
# order. Fixed, so every page slices the same total order.
RERANKED_HEAD_SIZE = 120
# Sinks every hit only in a note's extra content below every body hit.
EXTRA_ONLY_RANK_PENALTY = 100_000
PREVIEW_LENGTH = 180
EXCERPT_CONTEXT = 40
EXCERPT_MAX_MATCH = 60
ELLIPSIS = "…"
# Matches a prefix of a word only, for the engine's own order.
_PREFIX_WEIGHT = 0.6
REGEX_TIMEOUT = 5.0
_COMBINING_RE = re.compile("[̀-ͯ]")
_TOKEN_RE = re.compile(r"[\w-]+")


def normalize(s: str) -> str:
    """Case and diacritics folded."""
    return _COMBINING_RE.sub("", unicodedata.normalize("NFKD", s)).lower()


@dataclass
class _Fuzzy:
    normalized: str
    tokens: list[str]


@dataclass
class _Raw:
    """Where an exact or regex term matched, in the compacted fields."""
    body: tuple[int, int] | None
    extra: tuple[int, int] | None


@dataclass
class _Hit:
    raw: _Raw | None
    fuzzy: _Fuzzy | None
    rank: int

    @property
    def displayable(self) -> bool:
        return self.raw is not None or self.fuzzy is not None


def _evaluate(view: _View, ix, query, scope: str) -> dict[str, _Hit]:
    """Matches by note, in the engine's order, each with its best match to show."""
    if isinstance(query, Scope):
        return _evaluate(view, ix, query.child, query.field)
    if isinstance(query, Term):
        return _term_hits(view, ix, query, scope)
    if isinstance(query, Not):
        excluded = _evaluate(view, ix, query.child, scope)
        kept = (n for n in sorted(view.notes) if n not in excluded)
        return {n: _Hit(None, None, i) for i, n in enumerate(kept)}
    parts = [_evaluate(view, ix, c, scope) for c in query.children]
    if query.type == "or":
        out: dict[str, _Hit] = {}
        for part in parts:
            for name, hit in part.items():
                cur = out.get(name)
                if cur is None or hit.rank < cur.rank or not cur.displayable:
                    out[name] = hit
        return out
    out = dict(parts[0])
    for part in parts[1:]:
        for name, cur in list(out.items()):
            other = part.get(name)
            if other is None:
                del out[name]
            elif not cur.displayable and other.displayable:
                out[name] = other
    return out


def _term_hits(view: _View, ix, term: Term, scope: str) -> dict[str, _Hit]:
    if scope == "file":
        return _filename_hits(view, term)
    if term.match != "fuzzy":
        return _raw_hits(view, term, ("body", "extra") if scope == "content" else (scope,))
    fuzzy = _Fuzzy(normalize(term.value), _TOKEN_RE.findall(normalize(term.value)))
    return {n: _Hit(None, fuzzy, i) for i, n in enumerate(_fuzzy_names(view, ix, term.value, scope))}


def _fuzzy_names(view: _View, ix, value: str, scope: str) -> list[str]:
    """Notes holding every word of `value`, each also as a word's prefix, in
    the field(s) of `scope`; by idf-weighted score, exact over prefix matches."""
    tokens = list(dict.fromkeys(store.words(value)))
    if not tokens:
        return []
    in_body, in_extra = scope in ("content", "body"), scope in ("content", "extra")
    n = len(view.notes)
    score: dict[str, float] | None = None
    for token in tokens:
        best: dict[str, float] = {}
        for w in ix.expand(token):
            names = ix.names_with(w)
            base = math.log(1 + n / len(names)) * (1.0 if w == token else _PREFIX_WEIGHT)
            for name in names:
                e = view.notes.get(name)
                if e is not None and ((in_body and w in e.body_words) or (in_extra and w in e.extra_words)):
                    best[name] = max(best.get(name, 0.0), base)
        score = best if score is None else {k: score[k] + s for k, s in best.items() if k in score}
    return sorted(score, key=lambda k: (-score[k], k))


def _filename_hits(view: _View, term: Term) -> dict[str, _Hit]:
    if term.match == "regex":
        search = _regex_search(term)
        test = lambda name: search(name) is not None
    else:
        needle = normalize(term.value)
        test = lambda name: needle in normalize(name)
    return {n: _Hit(None, None, i) for i, n in enumerate(n for n in sorted(view.notes) if test(n))}


def _regex_search(term: Term):
    """`search(s)` for the regex term, as a (start, length) or None; all
    searches with it together are given up on after REGEX_TIMEOUT."""
    flags = regex.V0
    for f, value in (("i", regex.IGNORECASE), ("m", regex.MULTILINE), ("s", regex.DOTALL)):
        if f in term.flags:
            flags |= value
    try:
        pattern = regex.compile(term.value, flags)
    except regex.error as e:
        raise store.ValidationError(f"Invalid regular expression: {e}") from None
    deadline = time.monotonic() + REGEX_TIMEOUT

    def search(s: str):
        try:
            m = pattern.search(s, timeout=max(deadline - time.monotonic(), 0.001))
        except TimeoutError:
            raise store.ValidationError("Regex search timed out.") from None
        return (m.start(), m.end() - m.start()) if m else None
    return search


def _raw_hits(view: _View, term: Term, fields: tuple[str, ...]) -> dict[str, _Hit]:
    """Notes whose compacted body or extra holds the phrase (case-insensitively)
    or matches the regex."""
    if term.match == "regex":
        find = _regex_search(term)
    else:
        needle = term.value.lower()

        def find(s: str):
            i = s.lower().find(needle)
            return (i, len(needle)) if i != -1 else None

    out = {}
    for name in sorted(view.notes):
        e = view.notes[name]
        body = find(e.body_compact) if "body" in fields else None
        extra = find(e.extra_compact) if "extra" in fields else None
        if body or extra:
            out[name] = _Hit(_Raw(body, extra), None, len(out))
    return out


def _extra_only(e, q: _Fuzzy) -> tuple[str, str, bool]:
    """The folded body and extra, and whether the query is only in the extra."""
    body, extra = normalize(e.body), normalize(e.extra)
    occurs = lambda hay: q.normalized in hay or any(t in hay for t in q.tokens)
    return body, extra, not occurs(body) and occurs(extra)


def _score(view: _View, name: str, hit: _Hit, rank: int) -> float:
    e = view.notes[name]
    score = 1000 - rank * 5 + min(view.degree(name), 24)
    if hit.raw is not None:
        if hit.raw.body is not None:
            score += 140
        elif hit.raw.extra is not None:
            score -= EXTRA_ONLY_RANK_PENALTY
    elif hit.fuzzy is not None:
        q = hit.fuzzy
        body, extra, extra_only = _extra_only(e, q)
        if q.normalized in body:
            score += 140
        matching = [t for t in q.tokens if t in body or t in extra]
        score += len(matching) * 35
        if len(q.tokens) > 1 and len(matching) == len(q.tokens):
            score += 120
        if extra_only:
            score -= EXTRA_ONLY_RANK_PENALTY
    return score


def _ordered(view: _View, ix, q: str, orphan: str) -> list[tuple[str, _Hit]]:
    q = q.strip()
    if not q:
        return []
    try:
        query = parse_query(q)
    except IncompleteQuery:
        return []
    keep = {"any": lambda n: True, "orphan": lambda n: view.degree(n) == 0, "connected": lambda n: view.degree(n) > 0}[orphan]
    hits = [(n, h) for n, h in _evaluate(view, ix, query, "content").items() if keep(n)]
    head = sorted(((n, h, _score(view, n, h, i)) for i, (n, h) in enumerate(hits[:RERANKED_HEAD_SIZE])),
                  key=lambda x: (-x[2], x[0]))
    return [(n, h) for n, h, _ in head] + hits[RERANKED_HEAD_SIZE:]


def _orphan(value: str) -> str:
    if value not in ("any", "orphan", "connected"):
        raise store.ValidationError(f"invalid orphan filter '{value}'")
    return value


def search(q: str, orphan: str = "any", page: int = 0) -> dict:
    """One page of the notes matching `q`, each with where it matched; `total` counts all."""
    with store.index(SEARCH_MAX_AGE) as ix:
        view = _View(ix)
        hits = _ordered(view, ix, q, _orphan(orphan))
    start = max(page, 0) * PAGE_SIZE
    return {"results": [_result(view, n, h) for n, h in hits[start : start + PAGE_SIZE]], "total": len(hits)}


def search_filenames(q: str, orphan: str = "any", cap: int = PIN_ALL_CAP) -> dict:
    """The first `cap` matches, in `search`'s order, and how many there are."""
    with store.index(SEARCH_MAX_AGE) as ix:
        hits = _ordered(_View(ix), ix, q, _orphan(orphan))
    return {"filenames": [n for n, _ in hits[: max(cap, 0)]], "total": len(hits)}


# --- match display ------------------------------------------------------------


def _u16(text: str, start: int, length: int) -> dict:
    """A range of `text` in UTF-16 units, as the client's strings count."""
    astral = lambda s: sum(ord(c) > 0xFFFF for c in s)
    return {"start": start + astral(text[:start]), "length": length + astral(text[start : start + length])}


def _preview(e) -> str:
    return e.body_compact[:PREVIEW_LENGTH] or "Empty note"


def _result(view: _View, name: str, hit: _Hit) -> dict:
    """The note's opening text, with the match highlighted there when it
    shows, else an excerpt around it."""
    e = view.notes[name]
    preview = _preview(e)
    out = {"filename": name, "preview": preview, "previewMatch": None, "excerpt": None}
    located = _locate(e, hit)
    if located is None:
        return out
    field, (start, length) = located
    if field == "body" and start + length <= PREVIEW_LENGTH:
        out["previewMatch"] = _u16(preview, start, length)
        return out
    source = e.body_compact if field == "body" else e.extra_compact
    length = min(length, EXCERPT_MAX_MATCH)
    lo, hi = max(0, start - EXCERPT_CONTEXT), min(len(source), start + length + EXCERPT_CONTEXT)
    text = (ELLIPSIS if lo > 0 else "") + source[lo:hi] + (ELLIPSIS if hi < len(source) else "")
    out["excerpt"] = {"text": text, "match": _u16(text, (1 if lo > 0 else 0) + start - lo, length)}
    return out


def _locate(e, hit: _Hit) -> tuple[str, tuple[int, int]] | None:
    if hit.raw is not None:
        if hit.raw.body is not None:
            return "body", hit.raw.body
        return ("extra", hit.raw.extra) if hit.raw.extra is not None else None
    if hit.fuzzy is None:
        return None
    _, _, extra_only = _extra_only(e, hit.fuzzy)
    field = "extra" if extra_only else "body"
    found = _locate_fuzzy(e.extra_compact if extra_only else e.body_compact, hit.fuzzy)
    return (field, found) if found else None


def _locate_fuzzy(compact: str, q: _Fuzzy) -> tuple[int, int] | None:
    """The whole phrase if it occurs, else the earliest token; found on folded
    text but returned in `compact`'s own positions."""
    spans: list[tuple[int, int]] = []
    folded = []
    for i, c in enumerate(compact):
        f = normalize(c)
        spans.extend([(i, i + 1)] * len(f))
        folded.append(f)
    hay = "".join(folded)

    def earliest(needles):
        found = [(hay.find(n), len(n)) for n in needles if n and n in hay]
        return min(found) if found else None

    hit = earliest([q.normalized]) or earliest(q.tokens)
    if hit is None:
        return None
    start, end = spans[hit[0]][0], spans[hit[0] + hit[1] - 1][1]
    return start, end - start


# --- lists ----------------------------------------------------------------------


def recent(page: int = 0) -> dict:
    """One page of notes by modification, newest first."""
    view = _view()
    start = max(page, 0) * PAGE_SIZE
    ranked = heapq.nsmallest(start + PAGE_SIZE, view.notes.items(), key=lambda kv: (-kv[1].mtime_ns, kv[0]))
    return {"results": [{"filename": n, "preview": _preview(e)} for n, e in ranked[start:]], "total": len(view.notes)}


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


def create(body: dict) -> dict:
    """A note with the text `body`, related to `related` (`related -> new`, or
    `new -> related` when `reverse`) unless that's omitted."""
    text, related = body.get("body"), body.get("related")
    if not isinstance(text, str) or not text.strip():
        raise store.ValidationError("body required")
    if not related:
        return {"filename": store.create({"text": text})["file"]}
    _require(related)
    label = _label(body.get("label"))
    if body.get("reverse"):
        name = store.create({"text": questions.add_relation(text, label, _stem(related))})["file"]
    else:
        name = store.create({"text": text})["file"]
        _mutate(related, lambda lines, doc: _append(lines, label, name))
    return {"filename": name, "label": label}


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


# --- media ----------------------------------------------------------------------

_MEDIA_CLAUSE_RE = re.compile(r'(?<!\S)media\s+("(?:[^"\\]|\\.)*"|\S+)\s*')


def _media_token(path: str) -> str:
    quoted = '"' + path.replace('"', '\\"') + '"' if re.search(r'[\s"]', path) else path
    return f"{views.MEDIA_KEYWORD} {quoted}"


def _set_media(lines: list[str], doc: dsl.Document, path: str | None) -> None:
    """Points the `media` line at `path`, or removes it for None; other
    clauses on its line stay."""
    clause = next((c for c in doc.clauses if c.keyword == views.MEDIA_KEYWORD), None)
    if clause is None:
        if path is None:
            return
        first = next(i for i, l in enumerate(lines) if l.strip())
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
        replaced = _MEDIA_CLAUSE_RE.sub(lambda m: "" if path is None else _media_token(path) + " ", lines[i], count=1)
        lines[i] = replaced.rstrip()


def _append_line(lines: list[str], line: str) -> None:
    while lines and not lines[-1].strip():
        lines.pop()
    lines.extend([line, ""])


def _media_file(rel: str) -> Path:
    return store._dir() / rel


def _release(owner: str, rel: str) -> None:
    """Deletes media `owner` no longer points at, if this app manages it
    (directly inside images/) and no other note points at it."""
    parts = rel.split("/")
    if len(parts) != 2 or parts[0] != IMAGES_DIR:
        return
    with store.index() as ix:
        if any(e.media == rel for n, e in ix.entries.items() if n != owner):
            return
    _media_file(rel).unlink(missing_ok=True)


_EXTENSIONS = {("image", "jpeg"): "jpg", ("video", "quicktime"): "mov"}


def attach(name: str, data: bytes, content_type: str) -> dict:
    """Writes `data` to images/<stem>-<ms>.<ext> and points the note's `media`
    line at it, replacing any media attached before."""
    e = _require(name)
    m = re.fullmatch(r"(image|video)/(\w+)", (content_type or "").split(";")[0].strip().lower())
    if not m:
        raise store.ValidationError("Unsupported media data.")
    kind, subtype = m.groups()
    ext = _EXTENSIONS.get((kind, subtype), subtype)
    if f".{ext}" not in (views.IMAGE_EXTENSIONS if kind == "image" else views.VIDEO_EXTENSIONS):
        raise store.ValidationError(f"Unsupported {kind} type: {ext}.")
    if kind == "video" and len(data) > MAX_VIDEO_BYTES:
        raise store.ValidationError(f"Video is too large; keep clips under {MAX_VIDEO_BYTES // (1024 * 1024)}MB.")
    rel = f"{IMAGES_DIR}/{_stem(name)}-{int(time.time() * 1000)}.{ext}"
    path = _media_file(rel)
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(data)
    _mutate(name, lambda lines, doc: _set_media(lines, doc, rel))
    if e.media and e.media != rel:
        _release(name, e.media)
    return {"image": rel}


def clear_media(name: str) -> None:
    """Removes the note's `media` line and the file it named."""
    e = _require(name)
    if not e.media:
        return
    _mutate(name, lambda lines, doc: _set_media(lines, doc, None))
    _release(name, e.media)


def media_path(rel: str) -> str:
    return str(store.media_path(rel))


# --- delete and undo --------------------------------------------------------------

# The last deletion, for the undo popup: a note (its text and media bytes) or a relationship.
_undo: dict | None = None


def delete(name: str) -> None:
    global _undo
    e = _require(name)
    text = store.get(name)["text"]
    media = None
    if e.media:
        try:
            media = (e.media, _media_file(e.media).read_bytes())
        except FileNotFoundError:
            pass
        _release(name, e.media)
    store.delete(name)
    _undo = {"type": "note", "file": name, "text": text, "media": media}


def undo() -> dict:
    """Restores the last deletion; `restored` is false when there was none."""
    global _undo
    pending, _undo = _undo, None
    if pending is None:
        return {"restored": False}
    if pending["type"] == "note":
        store.create({"file": pending["file"], "text": pending["text"]})
        if pending["media"]:
            rel, data = pending["media"]
            _media_file(rel).parent.mkdir(parents=True, exist_ok=True)
            _media_file(rel).write_bytes(data)
    else:
        _mutate(pending["source"], lambda lines, doc: _append(lines, pending["label"], pending["target"]))
    return {"restored": True}
