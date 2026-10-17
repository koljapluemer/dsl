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
from dataclasses import dataclass
from pathlib import Path

import dsl
import questions

CONFIG_PATH = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dsl-crud" / "config.json"
# The calendar app's folder setting, offered as the default on first start.
CALENDAR_PREFS = Path.home() / ".local/share/com.example.calendar/shared_preferences.json"

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


def calendar_path() -> str | None:
    try:
        return json.loads(CALENDAR_PREFS.read_text()).get("flutter.data_folder")
    except (OSError, ValueError, AttributeError):
        return None


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
    return {"file": path.name, "text": text, **dsl.diagnostics(dsl.parse(SCHEMA, text))}


def _read(path: Path) -> dict:
    try:
        return _item(path, path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as e:
        return {"file": path.name, "text": "", "warnings": [],
                "errors": [{"code": "unreadable", "line": None, "detail": str(e)}]}


_WORD_RE = re.compile(r"\w+")
# Search: how much a match counts when it's only a prefix of the word, or in the heading.
_PREFIX_WEIGHT = 0.6
_HEADING_WEIGHT = 2.0
# Words a query token may expand to as a prefix; bounds the cost of one-letter queries.
_MAX_EXPANSION = 500


def _words(s: str) -> list[str]:
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
    head_words: frozenset[str]
    words: frozenset[str]


class _Index:
    """Every item's lowercased text, whether it needs attention, and a word
    index for search, re-read only when its mtime changes - so filtering a
    folder of 200k+ items doesn't read every file on every request."""

    def __init__(self):
        self._lock = threading.Lock()
        self._dir: Path | None = None
        self._entries: dict[str, _Entry] = {}
        self._postings: dict[str, set[str]] = {}
        self._vocab: list[str] = []
        self._vocab_dirty = False
        self._scanned = -math.inf

    def invalidate(self) -> None:
        """Our own writes: the next refresh rescans even within `max_age`."""
        self._scanned = -math.inf

    def _remove(self, name: str) -> None:
        for w in self._entries.pop(name).words:
            names = self._postings[w]
            names.discard(name)
            if not names:
                del self._postings[w]
                self._vocab_dirty = True

    def _add(self, name: str, entry: _Entry) -> None:
        self._entries[name] = entry
        for w in entry.words:
            if w not in self._postings:
                self._postings[w] = set()
                self._vocab_dirty = True
            self._postings[w].add(name)

    def refresh(self, max_age: float = 0) -> dict[str, _Entry]:
        """Rescans the folder unless that was done less than `max_age` seconds ago."""
        with self._lock:
            self._refresh(max_age)
            return dict(self._entries)

    def _refresh(self, max_age: float) -> None:
        d = _dir()
        if d != self._dir:
            self._dir, self._entries, self._postings, self._vocab = d, {}, {}, []
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
                item = _read(d / name)
                doc = dsl.parse(SCHEMA, item["text"])
                self._add(name, _Entry(
                    mtime,
                    item["text"].lower(),
                    bool(item["errors"] or item["warnings"]),
                    any(c.keyword == TASKS_KEYWORD for c in doc.clauses),
                    questions.is_candidate(doc),
                    doc.heading,
                    frozenset(_words(doc.heading)),
                    frozenset(_words(item["text"])),
                ))
        self._scanned = time.monotonic()

    def _expand(self, token: str) -> list[str]:
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

    def search(self, q: str, exclude: set[str], limit: int, max_age: float) -> list[dict]:
        """Items matching the words of `q`, each word also as a prefix: those
        matching all words first, then those matching the most; within that by
        idf-weighted score, exact over prefix matches, heading over body."""
        tokens = list(dict.fromkeys(_words(q)))
        if not tokens:
            return []
        with self._lock:
            self._refresh(max_age)
            n = len(self._entries)
            matched: dict[str, int] = {}
            score: dict[str, float] = {}
            for token in tokens:
                best: dict[str, float] = {}
                for w in self._expand(token):
                    names = self._postings[w]
                    base = math.log(1 + n / len(names)) * (1.0 if w == token else _PREFIX_WEIGHT)
                    for name in names:
                        s = base * (_HEADING_WEIGHT if w in self._entries[name].head_words else 1.0)
                        if s > best.get(name, 0.0):
                            best[name] = s
                for name, s in best.items():
                    matched[name] = matched.get(name, 0) + 1
                    score[name] = score.get(name, 0.0) + s
            ranked = sorted(
                (name for name in matched if name not in exclude),
                key=lambda name: (-matched[name], -score[name], name),
            )
            return [{"file": name, "heading": self._entries[name].heading} for name in ranked[:limit]]


_INDEX = _Index()


def list_page(
    q: str = "", attention: bool = False, page: int = 0, seed: int = 0, focus: str | None = None, tasks: bool = False
) -> dict:
    """One page of items whose text contains `q`, optionally only those needing
    attention or only those with a tasks line, in an order shuffled by `seed` (stable across pages and filters
    for one seed); plus the counts. With `focus`, the page holding that file
    instead, and `focused` says whether it was among the matches."""
    entries = _INDEX.refresh()
    needle = q.strip().lower()
    seed &= 0xFFFFFFFF
    names = sorted(
        (
            n for n, e in entries.items()
            if (not attention or e.flagged) and (not tasks or e.has_tasks) and (not needle or needle in e.lower)
        ),
        key=lambda n: (zlib.crc32(n.encode(), seed), n),
    )
    focused = focus is not None and focus in names
    if focused:
        page = names.index(focus) // PAGE_SIZE
    page = max(page, 0)
    start = page * PAGE_SIZE
    return {
        "items": [_with_refs(_read(_dir() / n), entries) for n in names[start : start + PAGE_SIZE]],
        "total": len(names),
        "flagged": sum(e.flagged for e in entries.values()),
        "tasks": sum(e.has_tasks for e in entries.values()),
        "page_size": PAGE_SIZE,
        "page": page,
        "focused": focused,
    }


def _with_refs(item: dict, entries: dict[str, _Entry]) -> dict:
    """Adds `refs`: each relationship target's heading, or None when there's no
    such item."""
    targets = {r.target for r in dsl.parse(SCHEMA, item["text"]).relations}
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


SEARCH_LIMIT = 8
# Search runs per keystroke: a folder scan per query would lag on a big folder.
SEARCH_MAX_AGE = 2.0


def search(q: str, exclude: list[str] = ()) -> list[dict]:
    """Up to SEARCH_LIMIT `{file, heading}` best matching `q`, for picking a note to link."""
    return _INDEX.search(q, set(exclude), SEARCH_LIMIT, SEARCH_MAX_AGE)


def random_candidate(exclude: list[str] = ()) -> dict:
    """A random note to ask questions about (see questions.is_candidate), other
    than those in `exclude` - or, when that leaves none, any; `item` is None
    when there are none at all. `total` counts all candidates."""
    entries = _INDEX.refresh()
    names = sorted(n for n, e in entries.items() if e.candidate)
    pool = [n for n in names if n not in set(exclude)] or names
    item = _with_refs(_read(_dir() / random.choice(pool)), entries) if pool else None
    return {"item": item, "total": len(names)}


def get_with_refs(name: str) -> dict:
    return _with_refs(get(name), _INDEX.refresh())


def answer(name: str, body: dict) -> dict:
    """Links the note to the answer of question `qid`: to the existing note
    `target` (a file name), or to a new note with `text`. Returns the updated
    note with refs, and `target` as `{file, heading}`."""
    body = body if isinstance(body, dict) else {}
    q = questions.by_id(body.get("qid") or "")
    if q is None:
        raise ValidationError(f"unknown question '{body.get('qid')}'")
    note = get(name)
    if body.get("target"):
        target = get(body["target"])
    else:
        target = create({"text": body.get("text")})
    updated = update(name, {"text": questions.add_relation(note["text"], q["label"], target["file"].removesuffix(".txt"))})
    return {
        **_with_refs(updated, _INDEX.refresh()),
        "target": {"file": target["file"], "heading": dsl.parse(SCHEMA, target["text"]).heading},
    }


def disable(name: str) -> None:
    """Tags the note so the questions view skips it."""
    note = get(name)
    update(name, {"text": questions.add_tag(SCHEMA, note["text"], questions.NO_QUESTIONS_TAG)})
