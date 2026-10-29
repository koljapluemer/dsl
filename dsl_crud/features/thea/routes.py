from flask import Blueprint, jsonify, request, send_file

from dsl_crud.features.thea import service

blueprint = Blueprint("thea", __name__)

# the built page runs in an opaque origin with no network, wherever it's opened
VIEW_CSP = ("sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
            "img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:")


@blueprint.get("/api/thea/status")
def status(): return jsonify(service.status())


@blueprint.get("/api/thea/jobs")
def jobs(): return jsonify(service.jobs())


@blueprint.post("/api/thea/generate")
def generate():
    body = request.get_json(silent=True) or {}
    return jsonify(service.start(str(body.get("file", "")), body.get("index"), body.get("errors"))), 202


@blueprint.post("/api/thea/use")
def use():
    body = request.get_json(silent=True) or {}
    return jsonify(service.use(str(body.get("file", "")), body.get("index"), str(body.get("id", ""))))


@blueprint.get("/api/thea/<ident>/view")
def view(ident):
    response = send_file(service.view(ident), mimetype="text/html", conditional=True)
    response.headers["Content-Security-Policy"] = VIEW_CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
