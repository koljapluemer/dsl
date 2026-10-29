from flask import Blueprint, jsonify

from dsl_crud.features.daily import service

blueprint = Blueprint("daily", __name__)


@blueprint.post("/api/daily/<date>")
def ensure(date): return jsonify(service.ensure(date))
