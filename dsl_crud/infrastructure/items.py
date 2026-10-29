"""Indexed one-.txt-file-per-item storage and item payloads."""

import bisect
import math
import os
import random
import re
import secrets
import threading
import time
import unicodedata
import zlib
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from dsl_crud.core import documents as views
from dsl_crud.core import canvas, dsl, edits, file_kinds, inline_refs, thea
from dsl_crud.infrastructure import config
from dsl_crud.infrastructure.errors import Conflict, NotFound, ValidationError

SCHEMA = dsl.load_schema()

_NAME_RE = re.compile(r"^[^/\\\x00]+\.txt$")

PAGE_SIZE = 50
TASKS_KEYWORD = "tasks"


def _dir() -> Path:
    p = config.get_path()
    if p is None or not p.is_dir():
        raise ValidationError("path not set")
    return p


def _file(name: str) -> Path:
    if not _NAME_RE.match(name) or name.startswith("."):
        raise ValidationError(f"invalid file name '{name}'")
    return _dir() / name


def _item(path: Path, text: str) -> dict:
    doc = dsl.parse(SCHEMA, text)
    cover = views.media(doc) or _thea_thumb(path.parent, text)
    return {"file": path.name, "text": text, "media": cover, "files": views.files(doc), **dsl.diagnostics(doc)}


def _thea_thumb(folder: Path, text: str) -> str | None:
    """The thumbnail of the item's first generated viz: its cover when it names no image or video."""
    for b in thea.blocks(SCHEMA, text) if "thea" in text else ():
        if b.id and (folder / (rel := f"{thea.DIR}/{b.id}/thumb.webp")).is_file():
            return rel
    return None


def _read(path: Path) -> dict:
    try:
        return _item(path, path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as e:
        return {"file": path.name, "text": "", "media": None, "files": [], "warnings": [],
                "errors": [{"code": "unreadable", "line": None, "detail": str(e)}]}


_WORD_RE = re.compile(r"\w+")
# Words a query token may expand to as a prefix; bounds the cost of one-letter queries.
_MAX_EXPANSION = 500


def words(s: str) -> list[str]:
    """Lowercase words without accents, in order."""
    folded = "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))
    return _WORD_RE.findall(folded)


@dataclass
class _Entry:
    mtime_ns: int
    lower: str
    flagged: bool
    has_tasks: bool
    heading: str
    body: str
    words: frozenset[str]
    primary: str | None
    tags: frozenset[str]
    when: dict | None
    # the date of a daily note (see views.daily)
    daily: str | None
    # what the graph reads (see graph.py)
    valid: bool
    explicit_rels: tuple[tuple[str, str], ...]
    # explicit and inline relationships used by graph/search; (label, target, inline)
    graph_rels: tuple[tuple[str, str, bool], ...]
    media: str | None
    # every file it names (see views.files)
    files: tuple[str, ...]
    extra: str
    data_text: str | None
    body_compact: str
    extra_compact: str
    body_words: frozenset[str]
    extra_words: frozenset[str]
    # where it's published (see views.route)
    route: str | None
    # its viz blocks' names, and the version folders they keep (see thea.kept)
    thea_names: frozenset[str]
    thea_dirs: frozenset[str]
    # its data block has a canvas (see canvas.CANVAS_KEY)
    has_canvas: bool
    # a source's BibTeX key (see views.source_key)
    source_key: str | None


UNLABELED_RELATION = "related"
_SPACE_RE = re.compile(r"\s+")


def effective_graph_rels(entry: _Entry) -> tuple[tuple[str, str, bool], ...]:
    """Graph relationships after an explicit source→target suppresses inline."""
    explicit_targets = {target for _, target, inline in entry.graph_rels if not inline}
    return tuple(rel for rel in entry.graph_rels if not rel[2] or rel[1] not in explicit_targets)


def _entry(mtime_ns: int, item: dict) -> "_Entry":
    text = item["text"]
    doc = dsl.parse(SCHEMA, text)
    extra = "\n".join(doc.extra or [])
    body = "\n".join(doc.body)
    inline = {r.target for text in (body, *dsl.text_blocks(SCHEMA, doc)) for r in inline_refs.references(text)}
    vizzes = thea.blocks(SCHEMA, text) if "thea" in text else []
    explicit = tuple((r.label or UNLABELED_RELATION, f"{r.target}.txt") for r in doc.relations)
    return _Entry(
        mtime_ns,
        text.lower(),
        bool(item["errors"] or item["warnings"]),
        any(c.keyword == TASKS_KEYWORD for c in doc.clauses),
        doc.heading,
        body,
        frozenset(words(text)),
        views.primary(SCHEMA, doc),
        frozenset(views.tags(doc)),
        views.when(doc),
        views.daily(doc),
        not item["errors"],
        explicit,
        tuple((label, target, False) for label, target in explicit)
        + tuple(("", f"{target}.txt", True) for target in sorted(inline)),
        views.media(doc),
        tuple(views.files(doc)),
        extra,
        "\n".join(doc.blocks["data"]) if "data" in doc.blocks else None,
        _SPACE_RE.sub(" ", body).strip(),
        _SPACE_RE.sub(" ", extra).strip(),
        frozenset(words(body)),
        frozenset(words(extra)),
        views.route(doc),
        frozenset(b.name for b in vizzes if b.name),
        thea.kept([b.id for b in vizzes if b.id]),
        isinstance(doc.data, dict) and canvas.CANVAS_KEY in doc.data,
        views.source_key(SCHEMA, doc, item["file"]),
    )


class _Index:
    """Every item's lowercased text, whether it needs attention, and a word
    index for search, re-read only when its mtime changes - so filtering a
    folder of 200k+ items doesn't read every file on every request."""

    def __init__(self):
        self._lock = threading.Lock()
        self._dir: Path | None = None
        self._entries: dict[str, _Entry] = {}
        self._postings: dict[str, set[str]] = {}
        # relationship target -> its (source, label, inline)s; tuples, replaced rather
        # than mutated, so a shallow copy of the map is a consistent snapshot
        self._incoming: dict[str, tuple[tuple[str, str, bool], ...]] = {}
        self._vocab: list[str] = []
        self._vocab_dirty = False
        self._scanned = -math.inf

    def invalidate(self) -> None:
        """Our own writes: the next refresh rescans even within `max_age`."""
        self._scanned = -math.inf

    def _remove(self, name: str) -> None:
        entry = self._entries.pop(name)
        for w in entry.words:
            names = self._postings[w]
            names.discard(name)
            if not names:
                del self._postings[w]
                self._vocab_dirty = True
        for target in {t for _, t, _ in entry.graph_rels}:
            if kept := tuple(r for r in self._incoming[target] if r[0] != name):
                self._incoming[target] = kept
            else:
                del self._incoming[target]

    def _add(self, name: str, entry: _Entry) -> None:
        self._entries[name] = entry
        for w in entry.words:
            if w not in self._postings:
                self._postings[w] = set()
                self._vocab_dirty = True
            self._postings[w].add(name)
        for label, target, inline in entry.graph_rels:
            self._incoming[target] = self._incoming.get(target, ()) + ((name, label, inline),)

    @contextmanager
    def locked(self, max_age: float = 0):
        """The index, refreshed (see `refresh`) and held still while in use."""
        with self._lock:
            self._refresh(max_age)
            yield self

    @property
    def entries(self) -> dict[str, _Entry]:
        return self._entries

    @property
    def incoming(self) -> dict[str, tuple[tuple[str, str, bool], ...]]:
        return self._incoming

    def names_with(self, word: str) -> set[str]:
        return self._postings.get(word, set())

    def refresh(self, max_age: float = 0) -> dict[str, _Entry]:
        """Rescans the folder unless that was done less than `max_age` seconds ago."""
        with self._lock:
            self._refresh(max_age)
            return dict(self._entries)

    def _refresh(self, max_age: float) -> None:
        d = _dir()
        if d != self._dir:
            self._dir, self._entries, self._postings, self._incoming, self._vocab = d, {}, {}, {}, []
        elif time.monotonic() - self._scanned < max_age:
            return
        seen = {}
        with os.scandir(d) as it:
            for e in it:
                if e.is_file() and e.name.lower().endswith(".txt") and not e.name.startswith("."):
                    seen[e.name] = e.stat().st_mtime_ns
        for name in self._entries.keys() - seen.keys():
            self._remove(name)
        for name, mtime in seen.items():
            if (cur := self._entries.get(name)) is None or cur.mtime_ns != mtime:
                if cur is not None:
                    self._remove(name)
                self._add(name, _entry(mtime, _read(d / name)))
        self._scanned = time.monotonic()

    def expand(self, token: str) -> list[str]:
        """Indexed words starting with `token`."""
        if self._vocab_dirty:
            self._vocab = sorted(self._postings)
            self._vocab_dirty = False
        i = bisect.bisect_left(self._vocab, token)
        out = []
        while i < len(self._vocab) and self._vocab[i].startswith(token) and len(out) < _MAX_EXPANSION:
            out.append(self._vocab[i])
            i += 1
        return out

_INDEX = _Index()


def index(max_age: float = 0):
    """The index, locked: `with store.index() as ix: ...`."""
    return _INDEX.locked(max_age)


def list_page(attention: bool | None = None, page: int = 0, seed: int = 0, tasks: bool = False) -> dict:
    """One page of items, optionally only those needing attention (`attention`
    True) or not (False) and only those with a tasks line, in an order
    shuffled by `seed` (stable across pages for one seed); plus the counts."""
    entries = _INDEX.refresh()
    seed &= 0xFFFFFFFF
    names = sorted(
        (n for n, e in entries.items() if (attention is None or e.flagged == attention) and (not tasks or e.has_tasks)),
        key=lambda n: (zlib.crc32(n.encode(), seed), n),
    )
    page = max(page, 0)
    start = page * PAGE_SIZE
    return {
        "items": [_note(n, entries) for n in names[start : start + PAGE_SIZE]],
        "total": len(names),
        "flagged": sum(e.flagged for e in entries.values()),
        "tasks": sum(e.has_tasks for e in entries.values()),
        "page_size": PAGE_SIZE,
        "page": page,
    }


def _payload(item: dict, entries: dict[str, _Entry]) -> dict:
    """The item as the API sends it, with ``refs``: every explicit or inline
    target's current heading, None for a missing one; ``sourceKey``
    (see views.source_key); and ``route`` (see views.route)."""
    doc = dsl.parse(SCHEMA, item["text"])
    targets = ({r.target for r in doc.relations}
               | {r.target for text in ("\n".join(doc.body), *dsl.text_blocks(SCHEMA, doc))
                  for r in inline_refs.references(text)})
    item["refs"] = {t: e.heading if (e := entries.get(f"{t}.txt")) else None for t in sorted(targets)}
    item["sourceKey"] = views.source_key(SCHEMA, doc, item["file"])
    item["route"] = views.route(doc)
    return item


def _note(name: str, entries: dict[str, _Entry]) -> dict:
    """The item in `name`, read now, as the API sends it."""
    return _payload(_read(_dir() / name), entries)


def get(name: str) -> dict:
    path = _file(name)
    if not path.exists():
        raise NotFound(name)
    return _read(path)


def _text(body) -> str:
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("text required")
    return text if text.endswith("\n") else text + "\n"


def _new_name(text: str) -> str:
    """`<slug of the first line>-<hex>.txt`; the name stays when the text changes."""
    slug = re.sub(r"[^a-z0-9]+", "-", dsl.parse(SCHEMA, text).heading.lower()).strip("-")[:40].rstrip("-") or "item"
    while (_dir() / (name := f"{slug}-{secrets.token_hex(3)}.txt")).exists():
        pass
    return name


def _write(path: Path, text: str) -> None:
    try:
        if path.read_text(encoding="utf-8") == text:
            return  # unchanged: keep the mtime
    except OSError:
        pass
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    _INDEX.invalidate()


def create(body: dict) -> dict:
    """`file` is only given when restoring a deleted item."""
    text = _text(body)
    if body.get("file"):
        path = _file(body["file"])
        if path.exists():
            raise Conflict(f"'{path.name}' exists")
    else:
        path = _dir() / _new_name(text)
    _write(path, text)
    return _item(path, text)


def update(name: str, body: dict) -> dict:
    text = _text(body)
    path = _file(name)
    if not path.exists():
        raise NotFound(name)
    _write(path, text)
    return _item(path, text)


def delete(name: str) -> None:
    path = _file(name)
    if not path.exists():
        raise NotFound(name)
    path.unlink()
    _INDEX.invalidate()


def payload(item: dict) -> dict:
    """The item as the API sends it (see _payload)."""
    return _payload(item, _INDEX.refresh())


def get_payload(name: str) -> dict:
    return payload(get(name))


def relate(name: str, body: dict) -> dict:
    """Links the note under any `label`, possibly empty (see _relate)."""
    body = body if isinstance(body, dict) else {}
    label = body.get("label")
    if not isinstance(label, str) or "\n" in label:
        raise ValidationError("invalid relationship label")
    return _relate(name, label.strip(), body)


def _relate(name: str, label: str, body: dict) -> dict:
    """Links the note to the existing note `target` (a file name), or to a new
    note with `text`. Returns the updated note with refs, and `target` as
    `{file, heading}`."""
    note = get(name)
    if body.get("target"):
        target = get(body["target"])
    else:
        target = create({"text": body.get("text")})
    updated = update(name, {"text": edits.add_relation(note["text"], label, target["file"].removesuffix(".txt"))})
    return {
        **payload(updated),
        "target": {"file": target["file"], "heading": dsl.parse(SCHEMA, target["text"]).heading},
    }


def _relation_line(name: str, body: dict) -> tuple[dict, list[str], int]:
    """The note, its lines, and the index of its first relationship line with
    `label` ("" for none) to `target` (a name without .txt)."""
    note = get(name)
    rel = next((r for r in dsl.parse(SCHEMA, note["text"]).relations
                if (r.label or "") == body.get("label") and r.target == body.get("target")), None)
    if rel is None:
        raise NotFound("relationship")
    return note, note["text"].split("\n"), rel.line - 1


def detach(name: str, body: dict) -> dict:
    """Removes the note's first relationship with `label` ("" for none) to
    `target` (a name without .txt). Returns the updated note."""
    body = body if isinstance(body, dict) else {}
    _, lines, i = _relation_line(name, body)
    del lines[i]
    return payload(update(name, {"text": "\n".join(lines)}))


def relabel(name: str, body: dict) -> dict:
    """Gives the note's first relationship with `label` to `target` (as for
    `detach`) the label `nextLabel`, possibly empty. Returns the updated note."""
    body = body if isinstance(body, dict) else {}
    next_label = body.get("nextLabel")
    if not isinstance(next_label, str) or "\n" in next_label:
        raise ValidationError("invalid relationship label")
    _, lines, i = _relation_line(name, body)
    next_label = next_label.strip()
    lines[i] = f"-> {next_label} @{body['target']}" if next_label else f"-> @{body['target']}"
    return payload(update(name, {"text": "\n".join(lines)}))


def set_tag(name: str, body: dict) -> dict:
    """Adds the tag `tag` to the note (`on`) or removes it. Returns the updated note."""
    body = body if isinstance(body, dict) else {}
    tag = body.get("tag")
    if not isinstance(tag, str) or not dsl.is_tag(tag):
        raise ValidationError("invalid tag")
    change = edits.add_tag if body.get("on") else edits.remove_tag
    return payload(update(name, {"text": change(SCHEMA, get(name)["text"], tag)}))


def backlinks(name: str) -> list[dict]:
    """`{file, label, heading}` for each relationship line in another note that
    points to the note, by label then heading. The label is as written ("" for
    none), unlike the index's, so it can be passed to `detach`."""
    get(name)
    target = name.removesuffix(".txt")
    with _INDEX.locked() as ix:
        incoming = tuple(ix.incoming.get(name, ()))
        linkers = {s for s, _, _ in incoming}
    out = []
    for source in linkers:
        try:
            doc = dsl.parse(SCHEMA, get(source)["text"])
        except NotFound:
            continue
        out += [{"file": source, "label": r.label or "", "heading": doc.heading, "inline": False}
                for r in doc.relations if r.target == target]
        if any(s == source and inline for s, _, inline in incoming):
            out.append({"file": source, "label": "", "heading": doc.heading, "inline": True})
    return sorted(out, key=lambda b: (b["inline"], b["label"].casefold(), b["heading"].casefold(), b["file"]))


def backlink(name: str, body: dict) -> dict:
    """Links the existing note `source` (a file name), or a new note with
    `text`, to the note under `label`. Returns the note's `backlinks`."""
    body = body if isinstance(body, dict) else {}
    label = body.get("label")
    if not isinstance(label, str) or "\n" in label:
        raise ValidationError("invalid relationship label")
    get(name)
    target = name.removesuffix(".txt")
    if body.get("source"):
        source = get(body["source"])
        update(source["file"], {"text": edits.add_relation(source["text"], label.strip(), target)})
    else:
        create({"text": edits.add_relation(_text(body), label.strip(), target)})
    return backlinks(name)


QUEUE_SIZE = 3
FLOAT_BATCH = 20


def hide(name: str, hiding: views.Hiding) -> None:
    """Tags the note so the view `hiding` belongs to leaves it out."""
    note = get(name)
    update(name, {"text": edits.add_tag(SCHEMA, note["text"], hiding.tag)})


def _draw(hiding: views.Hiding, size: int, q: str = "") -> dict:
    """Up to `size` random items `hiding` doesn't hide whose text contains `q`;
    `total` counts all of those."""
    needle = q.strip().lower()
    names = sorted(n for n, e in _INDEX.refresh().items()
                   if not hiding.hides(e.primary, e.tags) and needle in e.lower)
    entries = _INDEX.refresh()
    return {"items": [_note(n, entries) for n in random.sample(names, min(size, len(names)))], "total": len(names)}


def queue_draw() -> dict:
    """Up to QUEUE_SIZE random items views.QUEUE_HIDING doesn't hide."""
    return _draw(views.QUEUE_HIDING, QUEUE_SIZE)


def float_draw(q: str = "") -> dict:
    """Up to FLOAT_BATCH random items views.FLOAT_HIDING doesn't hide, containing `q`."""
    return _draw(views.FLOAT_HIDING, FLOAT_BATCH, q)


def all_tags() -> list[str]:
    """Every tag."""
    return sorted({t for e in _INDEX.refresh().values() for t in e.tags})


def tagged_items(tag: str) -> list[dict]:
    """Every item tagged `tag`."""
    entries = _INDEX.refresh()
    return [_note(n, entries) for n, e in sorted(entries.items()) if tag in e.tags]


def _tagged_recent(tag: str) -> list[dict]:
    """Every item tagged `tag`, the last edited first."""
    entries = _INDEX.refresh()
    names = sorted((n for n, e in entries.items() if tag in e.tags), key=lambda n: (-entries[n].mtime_ns, n))
    return [_note(n, entries) for n in names]


def explorations() -> list[dict]:
    """Every item tagged views.EXPLORATION_TAG, the last edited first."""
    return _tagged_recent(views.EXPLORATION_TAG)


def canvases() -> list[dict]:
    """Every item whose data block has a canvas, the last edited first."""
    entries = _INDEX.refresh()
    names = sorted((n for n, e in entries.items() if e.has_canvas), key=lambda n: (-entries[n].mtime_ns, n))
    return [_note(n, entries) for n in names]


def source_files_by_key() -> dict[str, str]:
    """Each source's file by its BibTeX key; with a key taken twice, the first file by name."""
    entries = _INDEX.refresh()
    out: dict[str, str] = {}
    for n in sorted(entries):
        if (key := entries[n].source_key) is not None:
            out.setdefault(key, n)
    return out


def typst_notes() -> list[dict]:
    """Every item naming a Typst file, the last edited first."""
    entries = _INDEX.refresh()
    names = sorted((n for n, e in entries.items() if any(file_kinds.kind(f) is file_kinds.TYPST for f in e.files)),
                   key=lambda n: (-entries[n].mtime_ns, n))
    return [_note(n, entries) for n in names]


def published() -> list[dict]:
    """Every item with a valid `publish` route, by route."""
    entries = _INDEX.refresh()
    names = sorted((n for n, e in entries.items() if e.route), key=lambda n: (entries[n].route, n))
    return [_note(n, entries) for n in names]


def goals() -> list[dict]:
    """Every item tagged views.GOAL_TAG without an attached image (that marks
    it done), by heading."""
    entries = _INDEX.refresh()
    names = [n for n, e in entries.items() if views.GOAL_TAG in e.tags and not any(file_kinds.kind(f) is file_kinds.IMAGE for f in e.files)]
    return [_note(n, entries) for n in sorted(names, key=lambda n: (entries[n].heading.lower(), n))]


def suggest_tags() -> list[str]:
    """Every tag starting with views.SUGGEST_PREFIX."""
    return sorted({t for e in _INDEX.refresh().values() for t in e.tags if t.startswith(views.SUGGEST_PREFIX)})


def suggest_random(tag: str, exclude: list[str] = ()) -> dict | None:
    """A random item carrying the tag `tag`, other than those in `exclude`
    - or, when that leaves none, any; None when none carries it."""
    names = sorted(n for n, e in _INDEX.refresh().items() if tag in e.tags)
    pool = [n for n in names if n not in set(exclude)] or names
    return _note(random.choice(pool), _INDEX.refresh()) if pool else None


def calendar_items() -> list[dict]:
    """Every item that falls on some day, with `when` (see views.when)."""
    entries = _INDEX.refresh()
    return [_note(name, entries) | {"when": e.when} for name, e in sorted(entries.items()) if e.when]


def projects() -> dict:
    """Every project (tagged views.PROJECT_TAG) with the issues belonging to it, and the issues belonging
    to none (see views.PROJECT_RELATION); by heading, issues to think about
    (views.THINK_TAG) first."""
    entries = _INDEX.refresh()
    by_heading = lambda n: (entries[n].heading.lower(), n)
    thinks_first = lambda n: (views.THINK_TAG not in entries[n].tags, *by_heading(n))
    owned: dict[str, list[str]] = {n: [] for n, e in entries.items() if views.PROJECT_TAG in e.tags}
    orphans = []
    for name, e in entries.items():
        if e.primary != views.ISSUE_KEYWORD:
            continue
        targets = {t for label, t in e.explicit_rels if label == views.PROJECT_RELATION and t in owned}
        for t in targets:
            owned[t].append(name)
        if not targets:
            orphans.append(name)
    issues = lambda names: [_note(n, entries) for n in sorted(names, key=thinks_first)]
    return {
        "projects": [_note(n, entries) | {"issues": issues(owned[n])} for n in sorted(owned, key=by_heading)],
        "orphans": issues(orphans),
    }


