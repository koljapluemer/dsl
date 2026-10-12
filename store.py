"""Config and one-.txt-file-per-item storage, directly inside the data folder."""

import json
import os
import re
import secrets
import threading
from dataclasses import dataclass
from pathlib import Path

import dsl

CONFIG_PATH = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dsl-crud" / "config.json"
# The calendar app's folder setting, offered as the default on first start.
CALENDAR_PREFS = Path.home() / ".local/share/com.example.calendar/shared_preferences.json"

SCHEMA = dsl.load_schema()

_NAME_RE = re.compile(r"^[^/\\\x00]+\.txt$")

PAGE_SIZE = 50


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


def get_path() -> Path | None:
    p = _config().get("path")
    return Path(p) if p else None


def set_path(path: str) -> Path:
    p = Path(path).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True)
    cfg = _config() | {"path": str(p)}
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2) + "\n")
    return p


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


@dataclass
class _Entry:
    mtime_ns: int
    lower: str
    flagged: bool


class _Index:
    """Every item's lowercased text and whether it needs attention, re-read
    only when its mtime changes - so filtering a folder of 200k+ items doesn't
    read every file on every request."""

    def __init__(self):
        self._lock = threading.Lock()
        self._dir: Path | None = None
        self._entries: dict[str, _Entry] = {}

    def refresh(self) -> dict[str, _Entry]:
        with self._lock:
            d = _dir()
            if d != self._dir:
                self._dir, self._entries = d, {}
            seen = {}
            with os.scandir(d) as it:
                for e in it:
                    if e.is_file() and e.name.lower().endswith(".txt") and not e.name.startswith("."):
                        seen[e.name] = e.stat().st_mtime_ns
            for name in self._entries.keys() - seen.keys():
                del self._entries[name]
            for name, mtime in seen.items():
                if (cur := self._entries.get(name)) is None or cur.mtime_ns != mtime:
                    item = _read(d / name)
                    self._entries[name] = _Entry(mtime, item["text"].lower(), bool(item["errors"] or item["warnings"]))
            return dict(self._entries)


_INDEX = _Index()


def list_page(q: str = "", attention: bool = False, page: int = 0) -> dict:
    """One page of items (by file name) whose text contains `q`, optionally
    only those needing attention; plus the counts and the recently edited."""
    entries = _INDEX.refresh()
    needle = q.strip().lower()
    names = sorted(
        n for n, e in entries.items() if (not attention or e.flagged) and (not needle or needle in e.lower)
    )
    start = max(page, 0) * PAGE_SIZE
    return {
        "items": [_read(_dir() / n) for n in names[start : start + PAGE_SIZE]],
        "total": len(names),
        "flagged": sum(e.flagged for e in entries.values()),
        "page_size": PAGE_SIZE,
        "recent": recent(entries),
    }


def recent(entries: dict[str, _Entry], n: int = 3) -> list[str]:
    """File names of the n most recently modified items, newest first."""
    return sorted(entries, key=lambda name: entries[name].mtime_ns, reverse=True)[:n]


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
            return  # unchanged: keep mtime so "recently edited" stays meaningful
    except OSError:
        pass
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


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
