from flask import Blueprint, jsonify, request

from dsl_crud.infrastructure import items
from dsl_crud.web import excluded

blueprint = Blueprint("views", __name__)


@blueprint.get("/api/schema")
def schema(): return jsonify(items.SCHEMA)


@blueprint.get("/api/queue")
def queue(): return jsonify(items.queue_draw())


@blueprint.get("/api/float")
def float_items(): return jsonify(items.float_draw(request.args.get("q", "")))


@blueprint.get("/api/tags")
def tags(): return jsonify(items.all_tags())


@blueprint.get("/api/tagged")
def tagged(): return jsonify(items.tagged_items(request.args.get("tag", "")))


@blueprint.get("/api/explorations")
def explorations(): return jsonify(items.explorations())


@blueprint.get("/api/published")
def published(): return jsonify(items.published())


@blueprint.get("/api/goals")
def goals(): return jsonify(items.goals())


@blueprint.get("/api/suggest/tags")
def suggest_tags(): return jsonify(items.suggest_tags())


@blueprint.get("/api/suggest/random")
def suggest_random(): return jsonify(item=items.suggest_random(request.args.get("tag", ""), excluded()))


@blueprint.get("/api/calendar")
def calendar(): return jsonify(items.calendar_items())


@blueprint.get("/api/projects")
def projects(): return jsonify(items.projects())
