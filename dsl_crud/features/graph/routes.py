from flask import Blueprint, jsonify, request

from dsl_crud.features.graph import service
from dsl_crud.web import excluded, json_body

blueprint = Blueprint("graph", __name__)


@blueprint.get("/api/graph/pins")
def pins(): return jsonify(service.pins())


@blueprint.post("/api/graph")
def open_graph(): return jsonify(service.open_graph(json_body().get("pins")))


@blueprint.get("/api/graph/random")
def random_note(): return jsonify(filename=service.random_note(excluded(), request.args.get("orphan") == "1"))


@blueprint.put("/api/graph/notes/<name>")
def update(name):
    service.update(name, json_body())
    return "", 204


@blueprint.delete("/api/graph/notes/<name>")
def delete(name):
    service.delete(name)
    return "", 204


@blueprint.post("/api/graph/notes/<name>/hide")
def hide(name):
    service.hide(name)
    return "", 204


@blueprint.post("/api/graph/undo")
def undo(): return jsonify(service.undo())


@blueprint.post("/api/graph/relations")
def connect(): return jsonify(service.connect(json_body()))


@blueprint.patch("/api/graph/relations")
def relabel():
    service.relabel(json_body())
    return "", 204


@blueprint.delete("/api/graph/relations")
def delete_relation():
    service.delete_relation(json_body())
    return "", 204
