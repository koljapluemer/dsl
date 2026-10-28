from flask import Blueprint, jsonify, request

from dsl_crud.infrastructure import config, exports, items, ollama

blueprint = Blueprint("settings", __name__)


def _settings():
    path = config.get_path()
    return jsonify(path=str(path) if path else None,
                   exports={key: exports.paths(key) for key in exports.EXPORTS},
                   thea=config.get_thea())


@blueprint.get("/api/settings")
def get_settings(): return _settings()


@blueprint.put("/api/settings")
def put_settings():
    body = request.get_json(silent=True) or {}
    if "llm" in body:
        if not isinstance(body["llm"], dict):
            raise items.ValidationError("llm must be an object")
        config.set_llm(body["llm"])
    if "thea" in body:
        if not isinstance(body["thea"], dict):
            raise items.ValidationError("thea must be an object")
        config.set_thea(body["thea"])
    if "exports" in body:
        if not isinstance(body["exports"], dict):
            raise items.ValidationError("exports must be an object")
        for key, value in body["exports"].items():
            exports.set_paths(key, value)
    if "path" in body or not body.keys() & {"llm", "thea", "exports"}:
        path = (body.get("path") or "").strip()
        if not path:
            raise items.ValidationError("path required")
        config.set_path(path)
    if body.keys() & {"path", "exports"}:
        exports.sync()
    return _settings()


@blueprint.get("/api/llm")
def llm_status():
    try:
        ollama.models()
        available, reason = True, None
    except ollama.Unavailable as error:
        available, reason = False, str(error)
    return jsonify(available=available, reason=reason, url=ollama.url(), default_url=ollama.default_url())


