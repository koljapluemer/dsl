"""Config and one-.txt-file-per-item storage, directly inside the data folder."""

import bisect
import json
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

import dsl
import inline_refs
import questions
import views

CONFIG_PATH = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dsl-crud" / "config.json"

SCHEMA = dsl.load_schema()

_NAME_RE = re.compile(r"^[^/\\\x00]+\.txt$")

PAGE_SIZE = 50
TASKS_KEYWORD = "tasks"


class ValidationError(ValueError):
    pass


class Conflict(Exception):
    pass


class NotFound(Exception):
    pass


def _config() -> dict:
    try:
        cfg = json.loads(CONFIG_PATH.read_text())
    except (OSError, ValueError):
        return {}
    return cfg if isinstance(cfg, dict) else {}


def _save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2) + "\n")


def get_path() -> Path | None:
    p = _config().get("path")
    return Path(p) if p else None


def set_path(path: str) -> Path:
    p = Path(path).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True)
    _save_config(_config() | {"path": str(p)})
    return p


def set_llm(llm: dict) -> None:
    """Sets the Ollama `url`; an empty one means the default."""
    url = llm.get("url")
    if url is not None and not isinstance(url, str):
        raise ValidationError("llm.url must be a string")
    _save_config(_config() | {"llm": {"url": url.strip()} if url and url.strip() else {}})


def get_bib_paths() -> list[str]:
    return list(_config().get("bibtex") or [])


def set_bib_paths(paths) -> list[str]:
    """Stores the .bib export targets (see bibtex_export). `~` is expanded, a
    directory gets `sources.bib` appended."""
    if not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
        raise ValidationError("bibtex: expected list of paths")
    out: list[str] = []
    for raw in paths:
        if not raw.strip():
            continue
        p = Path(raw.strip()).expanduser()
        if p.is_absolute():
            p = p.resolve()
            if p.is_dir():
                p = p / "sources.bib"
        if str(p) not in out:
            out.append(str(p))
    _save_config(_config() | {"bibtex": out})
    return out


def _dir() -> Path:
    p = get_path()
    if p is None or not p.is_dir():
        raise ValidationError("path not set")
    return p


def _file(name: str) -> Path:
    if not _NAME_RE.match(name) or name.startswith("."):
        raise ValidationError(f"invalid file name '{name}'")
    return _dir() / name


def _item(path: Path, text: str) -> dict:
    doc = dsl.parse(SCHEMA, text)
    return {"file": path.name, "text": text, "media": views.media(doc), **dsl.diagnostics(doc)}


def _read(path: Path) -> dict:
    try:
        return _item(path, path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as e:
        return {"file": path.name, "text": "", "media": None, "warnings": [],
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
    candidate: bool
    heading: str
    body: str
    words: frozenset[str]
    primary: str | None
    tags: frozenset[str]
    when: dict | None
    # what the graph reads (see graph.py)
    valid: bool
    explicit_rels: tuple[tuple[str, str], ...]
    # explicit and inline relationships used by graph/search; (label, target, inline)
    graph_rels: tuple[tuple[str, str, bool], ...]
    media: str | None
    extra: str
    section_lines: tuple[str, ...]
    data_text: str | None
    body_compact: str
    extra_compact: str
    body_words: frozenset[str]
    extra_words: frozenset[str]


UNLABELED_RELATION = "related"
# keyword lines that would only repeat a card or don't matter on it
_UNSHOWN_KEYWORDS = {views.MEDIA_KEYWORD, views.TAGS_KEYWORD}
_SPACE_RE = re.compile(r"\s+")


def effective_graph_rels(entry: _Entry) -> tuple[tuple[str, str, bool], ...]:
    """Graph relationships after an explicit source→target suppresses inline."""
    explicit_targets = {target for _, target, inline in entry.graph_rels if not inline}
    return tuple(rel for rel in entry.graph_rels if not rel[2] or rel[1] not in explicit_targets)


def _section_lines(doc: dsl.Document, lines: list[str]) -> tuple[str, ...]:
    """Keyword lines, verbatim, but not those holding only `media` and `tags`;
    unknown keyword lines are kept."""
    by_line: dict[int, list[str]] = {}
    for c in doc.clauses:
        by_line.setdefault(c.line, []).append(c.keyword)
    for d in doc.diagnostics:
        if d.code == "unknown_keyword" and not lines[d.line - 1].lstrip().startswith("("):
            by_line.setdefault(d.line, []).append("")
    return tuple(lines[n - 1].strip() for n, kws in sorted(by_line.items()) if not set(kws) <= _UNSHOWN_KEYWORDS)


def _entry(mtime_ns: int, item: dict) -> "_Entry":
    text = item["text"]
    doc = dsl.parse(SCHEMA, text)
    extra = "\n".join(doc.extra or [])
    body = "\n".join(doc.body)
    inline = {r.target for text in (body, extra) for r in inline_refs.references(text)}
    explicit = tuple((r.label or UNLABELED_RELATION, f"{r.target}.txt") for r in doc.relations)
    return _Entry(
        mtime_ns,
        text.lower(),
        bool(item["errors"] or item["warnings"]),
        any(c.keyword == TASKS_KEYWORD for c in doc.clauses),
        questions.is_candidate(doc),
        doc.heading,
        body,
        frozenset(words(text)),
        views.primary(SCHEMA, doc),
        frozenset(views.tags(doc)),
        views.when(doc),
        not item["errors"],
        explicit,
        tuple((label, target, False) for label, target in explicit)
        + tuple(("", f"{target}.txt", True) for target in sorted(inline)),
        views.media(doc),
        extra,
        _section_lines(doc, [l.replace("\r", "") for l in text.split("\n")]),
        "\n".join(doc.blocks["data"]) if "data" in doc.blocks else None,
        _SPACE_RE.sub(" ", body).strip(),
        _SPACE_RE.sub(" ", extra).strip(),
        frozenset(words(body)),
        frozenset(words(extra)),
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
        "items": [_with_refs(_read(_dir() / n), entries) for n in names[start : start + PAGE_SIZE]],
        "total": len(names),
        "flagged": sum(e.flagged for e in entries.values()),
        "tasks": sum(e.has_tasks for e in entries.values()),
        "page_size": PAGE_SIZE,
        "page": page,
    }


def _with_refs(item: dict, entries: dict[str, _Entry]) -> dict:
    """Adds ``refs``: every explicit or inline target's current heading."""
    doc = dsl.parse(SCHEMA, item["text"])
    targets = ({r.target for r in doc.relations}
               | {r.target for text in ("\n".join(doc.body), "\n".join(doc.extra or []))
                  for r in inline_refs.references(text)})
    item["refs"] = {t: _heading(t) if f"{t}.txt" in entries else None for t in sorted(targets)}
    return item


def _heading(name: str) -> str | None:
    try:
        return dsl.parse(SCHEMA, (_dir() / f"{name}.txt").read_text(encoding="utf-8")).heading
    except (OSError, UnicodeDecodeError):
        return None


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


def random_candidate(exclude: list[str] = ()) -> dict:
    """A random note to ask questions about (see questions.is_candidate), other
    than those in `exclude` - or, when that leaves none, any; `item` is None
    when there are none at all. `total` counts all candidates."""
    entries = _INDEX.refresh()
    names = sorted(n for n, e in entries.items() if e.candidate)
    pool = [n for n in names if n not in set(exclude)] or names
    item = _with_refs(_read(_dir() / random.choice(pool)), entries) if pool else None
    return {"item": item, "total": len(names)}


def with_refs(item: dict) -> dict:
    """The item with `refs` (see _with_refs)."""
    return _with_refs(item, _INDEX.refresh())


def get_with_refs(name: str) -> dict:
    return with_refs(get(name))


def answer(name: str, body: dict) -> dict:
    """Links the note to the answer of question `qid` (see _relate)."""
    body = body if isinstance(body, dict) else {}
    q = questions.by_id(body.get("qid") or "")
    if q is None:
        raise ValidationError(f"unknown question '{body.get('qid')}'")
    return _relate(name, q["label"], body)


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
    updated = update(name, {"text": questions.add_relation(note["text"], label, target["file"].removesuffix(".txt"))})
    return {
        **_with_refs(updated, _INDEX.refresh()),
        "target": {"file": target["file"], "heading": dsl.parse(SCHEMA, target["text"]).heading},
    }


def detach(name: str, body: dict) -> dict:
    """Removes the note's first relationship with `label` ("" for none) to
    `target` (a name without .txt). Returns the updated note with refs."""
    body = body if isinstance(body, dict) else {}
    note = get(name)
    rel = next((r for r in dsl.parse(SCHEMA, note["text"]).relations
                if (r.label or "") == body.get("label") and r.target == body.get("target")), None)
    if rel is None:
        raise NotFound("relationship")
    lines = note["text"].split("\n")
    del lines[rel.line - 1]
    return _with_refs(update(name, {"text": "\n".join(lines)}), _INDEX.refresh())


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
        update(source["file"], {"text": questions.add_relation(source["text"], label.strip(), target)})
    else:
        create({"text": questions.add_relation(_text(body), label.strip(), target)})
    return backlinks(name)


def disable(name: str) -> None:
    """Tags the note so the questions view skips it."""
    note = get(name)
    update(name, {"text": questions.add_tag(SCHEMA, note["text"], questions.NO_QUESTIONS_TAG)})


def _view(name: str) -> dict:
    item = _with_refs(_read(_dir() / name), _INDEX.refresh())
    return views.view(item, dsl.parse(SCHEMA, item["text"]))


QUEUE_SIZE = 3
FLOAT_BATCH = 20


def hide(name: str, hiding: views.Hiding) -> None:
    """Tags the note so the view `hiding` belongs to leaves it out."""
    note = get(name)
    update(name, {"text": questions.add_tag(SCHEMA, note["text"], hiding.tag)})


def _draw(hiding: views.Hiding, size: int, q: str = "") -> dict:
    """Up to `size` random items `hiding` doesn't hide whose text contains `q`;
    `total` counts all of those."""
    needle = q.strip().lower()
    names = sorted(n for n, e in _INDEX.refresh().items()
                   if not hiding.hides(e.primary, e.tags) and needle in e.lower)
    return {"items": [_view(n) for n in random.sample(names, min(size, len(names)))], "total": len(names)}


def queue_draw() -> dict:
    """Up to QUEUE_SIZE random items views.QUEUE_HIDING doesn't hide."""
    return _draw(views.QUEUE_HIDING, QUEUE_SIZE)


def float_draw(q: str = "") -> dict:
    """Up to FLOAT_BATCH random items views.FLOAT_HIDING doesn't hide, containing `q`."""
    return _draw(views.FLOAT_HIDING, FLOAT_BATCH, q)


def zero_items() -> list[dict]:
    """Every item tagged `zero`."""
    return [_view(n) for n, e in sorted(_INDEX.refresh().items()) if views.ZERO_TAG in e.tags]


def explorations() -> list[dict]:
    """Every item tagged views.EXPLORATION_TAG, as `{file, heading}`, the last edited first."""
    entries = _INDEX.refresh()
    names = sorted((n for n, e in entries.items() if views.EXPLORATION_TAG in e.tags), key=lambda n: (-entries[n].mtime_ns, n))
    return [{"file": n, "heading": entries[n].heading} for n in names]


def suggest_tags() -> list[str]:
    """Every tag starting with views.SUGGEST_PREFIX."""
    return sorted({t for e in _INDEX.refresh().values() for t in e.tags if t.startswith(views.SUGGEST_PREFIX)})


def suggest_random(tag: str, exclude: list[str] = ()) -> dict | None:
    """A random item carrying the tag `tag`, other than those in `exclude`
    - or, when that leaves none, any; None when none carries it."""
    names = sorted(n for n, e in _INDEX.refresh().items() if tag in e.tags)
    pool = [n for n in names if n not in set(exclude)] or names
    return _view(random.choice(pool)) if pool else None


def calendar_items() -> list[dict]:
    """Every item that falls on some day (see views.when), with its heading
    and the rest of its body as `details`."""
    out = []
    for name, e in sorted(_INDEX.refresh().items()):
        if e.when:
            body = e.body.split("\n")
            out.append({"file": name, "heading": e.heading, "details": body[1:], "when": e.when})
    return out


def projects() -> dict:
    """Every project with the issues belonging to it, by heading, and the
    issues belonging to none (see views.PROJECT_RELATION)."""
    entries = _INDEX.refresh()
    ref = lambda name: {"file": name, "heading": entries[name].heading}
    issue = lambda name: ref(name) | {"think": views.THINK_TAG in entries[name].tags}
    by_heading = lambda r: (r["heading"].lower(), r["file"])
    thinks_first = lambda r: (not r["think"], *by_heading(r))
    owned: dict[str, list[dict]] = {n: [] for n, e in entries.items() if e.primary == views.PROJECT_KEYWORD}
    orphans = []
    for name, e in entries.items():
        if e.primary != views.ISSUE_KEYWORD:
            continue
        targets = {t for label, t in e.explicit_rels if label == views.PROJECT_RELATION and t in owned}
        for t in targets:
            owned[t].append(issue(name))
        if not targets:
            orphans.append(issue(name))
    return {
        "projects": sorted(
            (ref(n) | {"issues": sorted(issues, key=thinks_first)} for n, issues in owned.items()), key=by_heading),
        "orphans": sorted(orphans, key=thinks_first),
    }


def set_think(name: str, think: bool) -> None:
    """Tags the issue views.THINK_TAG, or untags it."""
    text = get(name)["text"]
    change = questions.add_tag if think else questions.remove_tag
    update(name, {"text": change(SCHEMA, text, views.THINK_TAG)})


def media_path(rel: str) -> Path:
    """An attachment's file in the data folder; only images and videos, never outside it."""
    if not dsl.value_type(rel, ["path"]) or Path(rel).suffix.lower() not in views.MEDIA_EXTENSIONS:
        raise ValidationError(f"invalid media path '{rel}'")
    path = _dir() / rel
    if not path.is_file():
        raise NotFound(rel)
    return path
