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


THEA_DEFAULTS = {"cli": "claude", "model": "", "budget_usd": None, "timeout_min": 20}


def get_thea() -> dict:
    """How viz blocks are generated (see docs/thea.md): the claude CLI's
    command, its model ("" for the CLI's default), a cap per run in USD as the
    CLI estimates it at API prices (with a subscription nothing is billed;
    it bounds usage), None for none, and a time limit in minutes."""
    value = read().get("thea")
    return THEA_DEFAULTS | (value if isinstance(value, dict) else {})


def set_thea(value: dict) -> None:
    current = get_thea()
    cli, model = value.get("cli", current["cli"]), value.get("model", current["model"])
    budget, timeout = value.get("budget_usd", current["budget_usd"]), value.get("timeout_min", current["timeout_min"])
    if not isinstance(cli, str) or not isinstance(model, str):
        raise ValidationError("thea.cli and thea.model must be strings")
    if budget is not None and (isinstance(budget, bool) or not isinstance(budget, (int, float)) or budget <= 0):
        raise ValidationError("thea.budget_usd must be a positive number or null")
    if isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 240:
        raise ValidationError("thea.timeout_min must be a whole number of minutes, 1 to 240")
    update({"thea": {"cli": cli.strip() or THEA_DEFAULTS["cli"], "model": model.strip(),
                     "budget_usd": budget, "timeout_min": timeout}})


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
