from flask import Blueprint, jsonify

from dsl_crud.features.sources import bibtex_import, fields, service
from dsl_crud.infrastructure import items
from dsl_crud.web import json_body

blueprint = Blueprint("sources", __name__)


@blueprint.get("/api/sources")
def listing(): return jsonify(service.listing())


def _entries(text):
    try:
        return bibtex_import.parse(str(text))
    except ValueError as error:
        raise fields.ValidationError(str(error)) from None


@blueprint.post("/api/sources/match")
def match(): return jsonify(service.match(_entries(json_body().get("text", ""))))


@blueprint.post("/api/sources/resolve")
def resolve():
    body = json_body()
    resolved = service.resolve(body.get("entries"))
    out = {"sources": [source | {"item": items.get_payload(source["file"])} for source in resolved]}
    if isinstance(body.get("text"), str):
        out["text"] = service.link(body["text"], [source["file"] for source in resolved], str(body.get("label") or ""))
    return jsonify(out), 201


@blueprint.post("/api/sources/merge")
def merge():
    body = json_body()
    entries = _entries(body.get("bibtex", ""))
    if len(entries) != 1:
        raise fields.ValidationError(f"expected one BibTeX entry, found {len(entries)}")
    return jsonify(service.merge(body.get("file"), body.get("text"), entries[0], body.get("take") or []))
