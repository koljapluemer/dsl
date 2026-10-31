from flask import Blueprint, jsonify

from dsl_crud.features.learn import service
from dsl_crud.web import json_body

blueprint = Blueprint("learn", __name__)


@blueprint.get("/api/learn/next")
def next_card(): return jsonify(service.next_card())


@blueprint.post("/api/learn/review")
def review():
    body = json_body()
    return jsonify(service.review(str(body.get("file") or ""), str(body.get("id") or ""), str(body.get("rating") or "")))
