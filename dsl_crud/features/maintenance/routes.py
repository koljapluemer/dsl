from flask import Blueprint, jsonify

from dsl_crud.features.maintenance import service
from dsl_crud.infrastructure import media

blueprint = Blueprint("maintenance", __name__)


@blueprint.get("/api/maintenance")
def status(): return jsonify(pastAppointments=service.past_appointments(), orphanedFiles=media.orphaned())


@blueprint.post("/api/maintenance/past-appointments")
def delete_past(): return jsonify(deleted=service.delete_past_appointments())


@blueprint.post("/api/maintenance/orphaned-files")
def delete_orphaned(): return jsonify(deleted=media.delete_orphaned())
