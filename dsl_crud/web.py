"""Small helpers shared by HTTP adapters."""

from flask import request


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def excluded() -> list[str]:
    return [name for name in request.args.get("exclude", "").split(",") if name]
