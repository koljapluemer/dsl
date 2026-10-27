from flask import Blueprint, jsonify, request

from dsl_crud.features.canvas import service

blueprint = Blueprint("canvas", __name__)


@blueprint.get("/api/items/<name>/canvas")
def get_canvas(name): return jsonify(service.get(name))


@blueprint.put("/api/items/<name>/canvas")
def put_canvas(name): return jsonify(service.put(name, request.get_json(silent=True)))


@blueprint.post("/api/canvas/note")
def create_note(): return jsonify(service.create_note(request.get_json(silent=True))), 201
