from flask import Blueprint, jsonify

from dsl_crud.features.site import service

blueprint = Blueprint("site", __name__)


@blueprint.post("/api/site")
def ensure(): return jsonify(service.ensure())
