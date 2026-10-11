"""Config and one-.txt-file-per-item storage, directly inside the data folder."""

import json
import os
import re
import secrets
from pathlib import Path

import dsl

CONFIG_PATH = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dsl-crud" / "config.json"
# The calendar app's folder setting, offered as the default on first start.
CALENDAR_PREFS = Path.home() / ".local/share/com.example.calendar/shared_preferences.json"

SCHEMA = dsl.load_schema()

_NAME_RE = re.compile(r"^[^/\\\x00]+\.txt$")


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


def _files() -> list[Path]:
    return [f for f in _dir().iterdir() if f.is_file() and f.suffix.lower() == ".txt"]


def list_items() -> list[dict]:
    return [_read(f) for f in sorted(_files(), key=lambda f: f.name)]


def recent(n: int = 3) -> list[str]:
    """File names of the n most recently modified items, newest first."""
    return [f.name for f in sorted(_files(), key=lambda f: f.stat().st_mtime_ns, reverse=True)[:n]]


def _text(body) -> str:
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("text required")
    return text if text.endswith("\n") else text + "\n"


def _new_name(text: str) -> str:
    """`<slug of the first line>-<hex>.txt`; the name stays when the text changes."""
    slug = re.sub(r"[^a-z0-9]+", "-", dsl.parse(SCHEMA, text).title.lower()).strip("-")[:40].rstrip("-") or "item"
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
