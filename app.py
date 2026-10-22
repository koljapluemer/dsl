import os
import socket
import threading
import webbrowser
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

import bibtex_export  # noqa: F401 - registers its export
import bibtex_import
import exports
import fields
import files
import graph
import llm
import maintenance
import portfolio
import questions
import search as note_search
import semantic
import sources
import store

PORT = 8766
ROOT = Path(__file__).parent
# The committed build is the default. `just run-build` overrides this with the
# ignored feature-branch build without changing application behavior elsewhere.
DIST = Path(os.environ.get("DSL_FRONTEND_DIST", ROOT / "frontend" / "dist")).resolve()

app = Flask(__name__, static_folder=None)


@app.errorhandler(store.ValidationError)
def _invalid(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(fields.ValidationError)
def _invalid_source(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(store.Conflict)
def _conflict(e):
    return jsonify(error=str(e)), 409


@app.errorhandler(store.NotFound)
def _not_found(e):
    return jsonify(error=f"'{e}' not found"), 404


@app.get("/api/schema")
def get_schema():
    return jsonify(store.SCHEMA)


def _settings():
    p = store.get_path()
    return jsonify(path=str(p) if p else None, exports={key: exports.paths(key) for key in exports.EXPORTS})


@app.get("/api/settings")
def get_settings():
    return _settings()


@app.put("/api/settings")
def put_settings():
    """Any of `path`, `llm` (`{url}`) and `exports` (`{<export>: [paths]}`, see exports.py)."""
    body = request.get_json(silent=True) or {}
    if "llm" in body:
        if not isinstance(body["llm"], dict):
            raise store.ValidationError("llm must be an object")
        store.set_llm(body["llm"])
    if "exports" in body:
        if not isinstance(body["exports"], dict):
            raise store.ValidationError("exports must be an object")
        for key, value in body["exports"].items():
            exports.set_paths(key, value)
    if "path" in body or not body.keys() & {"llm", "exports"}:
        path = (body.get("path") or "").strip()
        if not path:
            raise store.ValidationError("path required")
        store.set_path(path)
    if body.keys() & {"path", "exports"}:
        exports.sync()
    return _settings()


@app.after_request
def _export_after_change(response):
    """Any write may change what an export writes."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.path.startswith("/api/") and response.status_code < 400:
        exports.schedule()
    return response


@app.get("/api/llm")
def get_llm():
    try:
        llm.models()
        available, reason = True, None
    except llm.Unavailable as e:
        available, reason = False, str(e)
    return jsonify(available=available, reason=reason, url=llm.url(), default_url=llm.default_url())


def _excluded() -> list[str]:
    return [f for f in request.args.get("exclude", "").split(",") if f]


@app.get("/api/search")
def search():
    args = request.args
    return jsonify(note_search.search(
        args.get("q", ""),
        args.get("scope", "all"),
        args.get("orphan", "any"),
        args.get("page", 0, type=int),
        args.get("regex", "1") == "1",
        args.get("semantic") == "1",
        _excluded(),
        args.get("limit", note_search.PAGE_SIZE, type=int),
    ))


@app.get("/api/search/filenames")
def search_filenames():
    args = request.args
    return jsonify(note_search.filenames(
        args.get("q", ""), args.get("scope", "all"), args.get("orphan", "any"), args.get("cap", note_search.PIN_ALL_CAP, type=int),
        args.get("semantic") == "1"))


@app.get("/api/questions/next")
def next_question_note():
    return jsonify(store.random_candidate(_excluded()))


@app.get("/api/questions/pick/<name>")
def pick_questions(name):
    """The questions to ask about the note; the first ones when the LLM can't
    choose, with `missing_model` set when that's because its model isn't installed."""
    text = store.get(name)["text"]
    missing_model, reason = None, None
    try:
        ids = questions.pick(text)
    except llm.Unavailable as e:
        ids, reason = [q["id"] for q in questions.QUESTIONS[: questions.ASK_COUNT]], str(e)
        if isinstance(e, llm.ModelMissing):
            missing_model = questions.MODEL
    return jsonify(questions=[questions.by_id(i) for i in ids], reason=reason, missing_model=missing_model)


@app.get("/api/questions/model")
def question_model():
    """Whether the questions' model is installed, and this session's download of it."""
    try:
        installed, reason = questions.MODEL in llm.models(), None
    except llm.Unavailable as e:
        installed, reason = False, str(e)
    return jsonify(model=questions.MODEL, installed=installed, reason=reason, pull=llm.pull_status(questions.MODEL))


@app.post("/api/questions/model/pull")
def pull_question_model():
    llm.pull(questions.MODEL)
    return question_model()


@app.post("/api/questions/answer/<name>")
def answer_question(name):
    return jsonify(store.answer(name, request.get_json(silent=True)))


@app.post("/api/questions/disable/<name>")
def disable_questions(name):
    store.disable(name)
    return "", 204


@app.get("/api/semantic")
def semantic_status():
    """The background embedding's progress, and this session's download of its model."""
    return jsonify(semantic.status() | {"model": semantic.MODEL, "pull": llm.pull_status(semantic.MODEL)})


@app.post("/api/semantic/model/pull")
def pull_semantic_model():
    llm.pull(semantic.MODEL)
    return semantic_status()


@app.get("/api/queue")
def queue_draw():
    return jsonify(store.queue_draw())


@app.get("/api/float")
def float_draw():
    return jsonify(store.float_draw(request.args.get("q", "")))


@app.get("/api/tags")
def all_tags():
    return jsonify(store.all_tags())


@app.get("/api/tagged")
def tagged_items():
    return jsonify(store.tagged_items(request.args.get("tag", "")))


@app.get("/api/explorations")
def explorations():
    return jsonify(store.explorations())


@app.get("/api/suggest/tags")
def suggest_tags():
    return jsonify(store.suggest_tags())


@app.get("/api/suggest/random")
def suggest_random():
    return jsonify(item=store.suggest_random(request.args.get("tag", ""), _excluded()))


@app.get("/api/calendar")
def calendar_items():
    return jsonify(store.calendar_items())


@app.get("/api/projects")
def projects():
    return jsonify(store.projects())


@app.get("/api/sources")
def list_sources():
    return jsonify(sources.listing())


@app.post("/api/sources/match")
def match_sources():
    """`{text}` BibTeX: each source in it with the existing ones it may be."""
    try:
        entries = bibtex_import.parse(str(_json().get("text", "")))
    except ValueError as e:
        raise fields.ValidationError(str(e)) from None
    return jsonify(sources.match(entries))


@app.post("/api/sources/resolve")
def resolve_sources():
    """`{entries, text?, label?}`: the entries' sources, existing or created
    (see sources.resolve), each with its `item`, and `text` with a relationship to each."""
    body = _json()
    resolved = sources.resolve(body.get("entries"))
    out: dict = {"sources": [s | {"item": store.get_payload(s["file"])} for s in resolved]}
    if isinstance(body.get("text"), str):
        out["text"] = sources.link(body["text"], [s["file"] for s in resolved], str(body.get("label") or ""))
    return jsonify(out), 201


@app.post("/api/sources/merge")
def merge_source():
    """`{file, text, bibtex, take?}`: `text`, the source's as edited, updated from
    the one entry in `bibtex` (see sources.merge); nothing is written."""
    body = _json()
    try:
        entries = bibtex_import.parse(str(body.get("bibtex", "")))
    except ValueError as e:
        raise fields.ValidationError(str(e)) from None
    if len(entries) != 1:
        raise fields.ValidationError(f"expected one BibTeX entry, found {len(entries)}")
    return jsonify(sources.merge(body.get("file"), body.get("text"), entries[0], body.get("take") or []))


def _json() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


@app.get("/api/graph/pins")
def graph_pins():
    return jsonify(graph.pins())


@app.post("/api/graph")
def graph_open():
    return jsonify(graph.open_graph(_json().get("pins")))


@app.get("/api/graph/random")
def graph_random():
    return jsonify(filename=graph.random_note(_excluded(), request.args.get("orphan") == "1"))


@app.put("/api/graph/notes/<name>")
def graph_update(name):
    graph.update(name, _json())
    return "", 204


@app.delete("/api/graph/notes/<name>")
def graph_delete(name):
    graph.delete(name)
    return "", 204


@app.post("/api/graph/notes/<name>/hide")
def graph_hide(name):
    graph.hide(name)
    return "", 204


@app.post("/api/graph/undo")
def graph_undo():
    return jsonify(graph.undo())


@app.post("/api/graph/relations")
def graph_connect():
    return jsonify(graph.connect(_json()))


@app.patch("/api/graph/relations")
def graph_relabel():
    graph.relabel(_json())
    return "", 204


@app.delete("/api/graph/relations")
def graph_delete_relation():
    graph.delete_relation(_json())
    return "", 204


@app.get("/api/maintenance")
def get_maintenance():
    return jsonify(pastAppointments=maintenance.past_appointments(), orphanedFiles=files.orphaned())


@app.post("/api/maintenance/past-appointments")
def delete_past_appointments():
    return jsonify(deleted=maintenance.delete_past_appointments())


@app.post("/api/maintenance/orphaned-files")
def delete_orphaned_files():
    return jsonify(deleted=files.delete_orphaned())


@app.get("/api/files/<path:rel>")
def get_file(rel):
    return send_file(files.path(rel), conditional=True)


@app.put("/api/files/<path:rel>")
def put_file(rel):
    """Writes a text file (`{text}`), see file_kinds."""
    text = (request.get_json(silent=True) or {}).get("text")
    if not isinstance(text, str):
        raise store.ValidationError("text required")
    files.write_text(rel, text)
    return "", 204


@app.get("/api/file-path")
def file_path():
    return jsonify(path=str(files.path(request.args.get("p", ""))))


@app.post("/api/portfolio")
def ensure_portfolio():
    return jsonify(portfolio.ensure())


@app.get("/api/portfolio/preview")
def preview_portfolio():
    return portfolio.render(), 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/api/items")
def list_items():
    args = request.args
    return jsonify(store.list_page(
        {"1": True, "0": False}.get(args.get("attention", "")),
        args.get("page", 0, type=int),
        args.get("seed", 0, type=int),
        args.get("tasks") == "1",
    ))


@app.get("/api/items/<name>")
def get_item(name):
    return jsonify(store.get_payload(name))


@app.post("/api/items")
def create_item():
    return jsonify(store.payload(store.create(request.get_json()))), 201


@app.put("/api/items/<name>")
def update_item(name):
    return jsonify(store.payload(store.update(name, request.get_json())))


@app.put("/api/items/<name>/media")
def attach_item_media(name):
    return jsonify(files.attach(name, request.get_data(), request.content_type))


@app.delete("/api/items/<name>/media")
def clear_item_media(name):
    return jsonify(files.clear(name))


@app.post("/api/items/<name>/relate")
def relate_item(name):
    return jsonify(store.relate(name, request.get_json(silent=True)))


@app.post("/api/items/<name>/detach")
def detach_item(name):
    return jsonify(store.detach(name, request.get_json(silent=True)))


@app.post("/api/items/<name>/relabel")
def relabel_item(name):
    return jsonify(store.relabel(name, request.get_json(silent=True)))


@app.put("/api/items/<name>/tags")
def tag_item(name):
    return jsonify(store.set_tag(name, request.get_json(silent=True)))


@app.get("/api/items/<name>/backlinks")
def item_backlinks(name):
    return jsonify(store.backlinks(name))


@app.post("/api/items/<name>/backlinks")
def add_item_backlink(name):
    return jsonify(store.backlink(name, request.get_json(silent=True)))


@app.delete("/api/items/<name>")
def delete_item(name):
    store.delete(name)
    return "", 204


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def frontend(path):
    """The frontend's files; any other path is one of its routes."""
    if path.startswith("api/"):
        abort(404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


def _running() -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PORT)) == 0


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    if _running():
        webbrowser.open(url)
    else:
        threading.Timer(0.8, webbrowser.open, args=(url,)).start()
        exports.start()
        app.run(port=PORT)
