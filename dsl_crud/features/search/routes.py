from flask import Blueprint, jsonify, request

from dsl_crud.features.search import service
from dsl_crud.features.search import semantic
from dsl_crud.infrastructure import ollama
from dsl_crud.web import excluded

blueprint = Blueprint("search", __name__)


@blueprint.get("/api/search")
def search():
    a = request.args
    return jsonify(service.search(a.get("q", ""), a.get("scope", "all"), a.get("orphan", "any"),
                                  a.get("page", 0, type=int), a.get("regex", "1") == "1",
                                  a.get("semantic") == "1", excluded(),
                                  a.get("limit", service.PAGE_SIZE, type=int)))


@blueprint.get("/api/search/filenames")
def filenames():
    a = request.args
    return jsonify(service.filenames(a.get("q", ""), a.get("scope", "all"), a.get("orphan", "any"),
                                     a.get("cap", service.PIN_ALL_CAP, type=int), a.get("semantic") == "1"))


def _semantic_status():
    return jsonify(semantic.status() | {"model": semantic.MODEL, "pull": ollama.pull_status(semantic.MODEL)})


@blueprint.get("/api/semantic")
def semantic_status(): return _semantic_status()


@blueprint.post("/api/semantic/model/pull")
def pull_semantic_model():
    ollama.pull(semantic.MODEL)
    return _semantic_status()
