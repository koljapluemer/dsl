from urllib.parse import quote

from flask import Blueprint, jsonify, request

from dsl_crud.features.pdf import service

blueprint = Blueprint("pdf", __name__)


@blueprint.get("/api/pdf/status")
def status(): return jsonify(service.status())


@blueprint.get("/api/items/<name>/pdf")
def export(name):
    pdf = service.render(name, request.args.get("content", "both"), request.args.get("images", "1") != "0",
                         request.args.get("paper", "A4"))
    filename = name.removesuffix(".txt") + ".pdf"
    return pdf, 200, {"Content-Type": "application/pdf",
                      "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
