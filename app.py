import socket
import threading
import webbrowser

from flask import Flask, jsonify, render_template, request

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
    path = ((request.get_json() or {}).get("path") or "").strip()
    if not path:
        raise store.ValidationError("path required")
    store.set_path(path)
    return _settings()


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
