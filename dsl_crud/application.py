"""Application composition: Flask, feature blueprints, and process-wide hooks."""

import os
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

from dsl_crud.features.canvas.routes import blueprint as canvas
from dsl_crud.features.graph.routes import blueprint as graph
from dsl_crud.features.items.routes import blueprint as items_routes
from dsl_crud.features.maintenance.routes import blueprint as maintenance
from dsl_crud.features.portfolio import service as portfolio_service
from dsl_crud.features.portfolio.routes import blueprint as portfolio
from dsl_crud.features.questions.routes import blueprint as questions
from dsl_crud.features.search.routes import blueprint as search
from dsl_crud.features.settings.routes import blueprint as settings
from dsl_crud.features.sources import fields
from dsl_crud.features.sources import bibtex_export
from dsl_crud.features.sources.routes import blueprint as sources
from dsl_crud.features.thea.routes import blueprint as thea
from dsl_crud.features.typst.routes import blueprint as typst
from dsl_crud.features.views.routes import blueprint as views
from dsl_crud.infrastructure import chromium, exports, items, typst as typst_compiler

ROOT = Path(__file__).parent.parent


def create_app() -> Flask:
    exports.register(bibtex_export.definition())
    exports.register(portfolio_service.export_definition())
    app = Flask(__name__, static_folder=None)
    for blueprint in (settings, search, questions, views, sources, graph, canvas, maintenance, items_routes, portfolio, thea, typst):
        app.register_blueprint(blueprint)
    app.register_error_handler(items.ValidationError, _invalid)
    app.register_error_handler(fields.ValidationError, _invalid)
    app.register_error_handler(items.Conflict, _conflict)
    app.register_error_handler(chromium.Unavailable, _unavailable)
    app.register_error_handler(typst_compiler.Unavailable, _unavailable)
    app.register_error_handler(items.NotFound, _not_found)
    app.after_request(_export_after_change)
    dist = Path(os.environ.get("DSL_FRONTEND_DIST", ROOT / "frontend" / "dist")).resolve()

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        if path.startswith("api/"):
            abort(404)
        if path and (dist / path).is_file():
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")
    return app


def _invalid(error): return jsonify(error=str(error)), 400
def _conflict(error): return jsonify(error=str(error)), 409
def _unavailable(error): return jsonify(error=str(error)), 503
def _not_found(error): return jsonify(error=f"'{error}' not found"), 404


def _export_after_change(response):
    if (request.method in ("POST", "PUT", "PATCH", "DELETE")
            and request.path.startswith("/api/") and response.status_code < 400):
        exports.schedule()
    return response


app = create_app()
