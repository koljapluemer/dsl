import socket
import threading
import webbrowser

from flask import Flask, jsonify, render_template, request

import llm
import questions
import semantic
import store

PORT = 8766

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.errorhandler(store.ValidationError)
def _invalid(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(store.Conflict)
def _conflict(e):
    return jsonify(error=str(e)), 409


@app.errorhandler(store.NotFound)
def _not_found(e):
    return jsonify(error=f"'{e}' not found"), 404


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/schema")
def get_schema():
    return jsonify(store.SCHEMA)


def _settings():
    p = store.get_path()
    return jsonify(path=str(p) if p else None, suggested=store.calendar_path())


@app.get("/api/settings")
def get_settings():
    return _settings()


@app.put("/api/settings")
def put_settings():
    """`path` and/or `llm` (`{url}`)."""
    body = request.get_json(silent=True) or {}
    if "llm" in body:
        if not isinstance(body["llm"], dict):
            raise store.ValidationError("llm must be an object")
        store.set_llm(body["llm"])
    if "path" in body or "llm" not in body:
        path = (body.get("path") or "").strip()
        if not path:
            raise store.ValidationError("path required")
        store.set_path(path)
    return _settings()


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
    return jsonify(store.search(request.args.get("q", ""), _excluded()))


@app.get("/api/questions/next")
def next_question_note():
    return jsonify(store.random_candidate(_excluded()))


@app.get("/api/questions/note/<name>")
def question_note(name):
    return jsonify(store.get_with_refs(name))


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


@app.get("/api/items")
def list_items():
    args = request.args
    return jsonify(store.list_page(
        args.get("q", ""),
        args.get("attention") == "1",
        args.get("page", 0, type=int),
        args.get("seed", 0, type=int),
        args.get("focus") or None,
        args.get("tasks") == "1",
        args.get("semantic") == "1",
    ))


@app.get("/api/items/<name>")
def get_item(name):
    return jsonify(store.get(name))


@app.post("/api/items")
def create_item():
    return jsonify(store.create(request.get_json())), 201


@app.put("/api/items/<name>")
def update_item(name):
    return jsonify(store.update(name, request.get_json()))


@app.delete("/api/items/<name>")
def delete_item(name):
    store.delete(name)
    return "", 204


def _running() -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PORT)) == 0


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    if _running():
        webbrowser.open(url)
    else:
        threading.Timer(0.8, webbrowser.open, args=(url,)).start()
        app.run(port=PORT)
