from flask import Blueprint, jsonify, request

from dsl_crud.features.typst import service
from dsl_crud.infrastructure import items

blueprint = Blueprint("typst", __name__)


@blueprint.get("/api/typst/status")
def status(): return jsonify(service.status())


@blueprint.get("/api/typst/notes")
def notes(): return jsonify(items.typst_notes())


@blueprint.get("/api/typst/cite-sources")
def cite_sources():
    note = request.args.get("note")
    if not note:
        raise items.ValidationError("note required")
    return jsonify(service.cite_sources(note))


@blueprint.post("/api/items/<name>/typst")
def create(name): return jsonify(service.create(name)), 201


@blueprint.put("/api/typst/<path:rel>")
def save(rel):
    body = request.get_json(silent=True) or {}
    text, note = body.get("text"), body.get("note")
    if not isinstance(text, str):
        raise items.ValidationError("text required")
    if note is not None and not isinstance(note, str):
        raise items.ValidationError("note: expected a file name")
    return jsonify(service.save(rel, text, note))
