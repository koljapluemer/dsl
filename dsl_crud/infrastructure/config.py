"""Atomic persistence for the application's user configuration."""

import json
import os
import threading
from pathlib import Path

from dsl_crud.infrastructure.errors import ValidationError

CONFIG_PATH = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "dsl-crud" / "config.json"
_lock = threading.Lock()


def read() -> dict:
    try:
        value = json.loads(CONFIG_PATH.read_text())
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def update(changes: dict) -> None:
    with _lock:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = CONFIG_PATH.with_name(CONFIG_PATH.name + ".tmp")
        temporary.write_text(json.dumps(read() | changes, indent=2) + "\n")
        os.replace(temporary, CONFIG_PATH)


def get_path() -> Path | None:
    value = read().get("path")
    return Path(value) if value else None


def set_path(path: str) -> Path:
    value = Path(path).expanduser().resolve()
    value.mkdir(parents=True, exist_ok=True)
    update({"path": str(value)})
    return value


def set_llm(value: dict) -> None:
    url = value.get("url")
    if url is not None and not isinstance(url, str):
        raise ValidationError("llm.url must be a string")
    update({"llm": {"url": url.strip()} if url and url.strip() else {}})


def get_export_paths(key: str) -> list[str]:
    return list(read().get(key) or [])


def set_export_paths(key: str, paths, default_name: str) -> list[str]:
    if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
        raise ValidationError(f"{key}: expected list of paths")
    output: list[str] = []
    for raw in paths:
        if not raw.strip():
            continue
        path = Path(raw.strip()).expanduser()
        if path.is_absolute():
            path = path.resolve()
            if path.is_dir():
                path /= default_name
        if str(path) not in output:
            output.append(str(path))
    update({key: output})
    return output
