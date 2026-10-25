from flask import Blueprint, jsonify, request

from dsl_crud.features.questions import service
from dsl_crud.infrastructure import items, ollama
from dsl_crud.web import excluded

blueprint = Blueprint("questions", __name__)


@blueprint.get("/api/questions/next")
def next_note(): return jsonify(service.random_candidate(excluded()))


@blueprint.get("/api/questions/pick/<name>")
def pick(name):
    missing_model = reason = None
    try:
        ids = service.pick(items.get(name)["text"])
    except ollama.Unavailable as error:
        ids, reason = [q["id"] for q in service.QUESTIONS[:service.ASK_COUNT]], str(error)
        if isinstance(error, ollama.ModelMissing):
            missing_model = service.MODEL
    return jsonify(questions=[service.by_id(qid) for qid in ids], reason=reason, missing_model=missing_model)


def _model_status():
    try:
        installed, reason = service.MODEL in ollama.models(), None
    except ollama.Unavailable as error:
        installed, reason = False, str(error)
    return jsonify(model=service.MODEL, installed=installed, reason=reason, pull=ollama.pull_status(service.MODEL))


@blueprint.get("/api/questions/model")
def model_status(): return _model_status()


@blueprint.post("/api/questions/model/pull")
def pull_model():
    ollama.pull(service.MODEL)
    return _model_status()


@blueprint.post("/api/questions/answer/<name>")
def answer(name): return jsonify(service.answer(name, request.get_json(silent=True)))


@blueprint.post("/api/questions/disable/<name>")
def disable(name):
    service.disable(name)
    return "", 204
