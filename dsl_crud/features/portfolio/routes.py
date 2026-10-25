from flask import Blueprint, jsonify

from dsl_crud.features.portfolio import service

blueprint = Blueprint("portfolio", __name__)


@blueprint.post("/api/portfolio")
def ensure(): return jsonify(service.ensure())


@blueprint.get("/api/portfolio/preview")
def preview(): return service.render(), 200, {"Content-Type": "text/html; charset=utf-8"}


@blueprint.get("/api/portfolio/cards")
def cards(): return jsonify(service.cards())


@blueprint.get("/api/portfolio/cards/<path:rel>")
def card(rel):
    return service.card_file(rel), 200, {"Content-Type": "image/webp", "Cache-Control": "no-cache"}
