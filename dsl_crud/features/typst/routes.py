from flask import Blueprint, jsonify, request

from dsl_crud.features.typst import service
from dsl_crud.infrastructure import items

blueprint = Blueprint("typst", __name__)


@blueprint.get("/api/typst/status")
def status(): return jsonify(service.status())


@blueprint.post("/api/items/<name>/typst")
def create(name): return jsonify(service.create(name)), 201


@blueprint.put("/api/typst/<path:rel>")
def save(rel):
    text = (request.get_json(silent=True) or {}).get("text")
    if not isinstance(text, str):
        raise items.ValidationError("text required")
    return jsonify(service.save(rel, text))
