from flask import Blueprint, jsonify, request, send_file

from dsl_crud.infrastructure import items, media

blueprint = Blueprint("items", __name__)


@blueprint.get("/api/items")
def list_items():
    args = request.args
    return jsonify(items.list_page({"1": True, "0": False}.get(args.get("attention", "")),
                                   args.get("page", 0, type=int), args.get("seed", 0, type=int),
                                   args.get("tasks") == "1"))


@blueprint.get("/api/items/<name>")
def get_item(name): return jsonify(items.get_payload(name))


@blueprint.post("/api/items")
def create_item(): return jsonify(items.payload(items.create(request.get_json()))), 201


@blueprint.put("/api/items/<name>")
def update_item(name): return jsonify(items.payload(items.update(name, request.get_json())))


@blueprint.delete("/api/items/<name>")
def delete_item(name):
    items.delete(name)
    return "", 204


@blueprint.put("/api/items/<name>/media")
def attach_media(name): return jsonify(media.attach(name, request.get_data(), request.content_type))


@blueprint.delete("/api/items/<name>/media")
def clear_media(name): return jsonify(media.clear(name))


@blueprint.post("/api/items/<name>/relate")
def relate(name): return jsonify(items.relate(name, request.get_json(silent=True)))


@blueprint.post("/api/items/<name>/detach")
def detach(name): return jsonify(items.detach(name, request.get_json(silent=True)))


@blueprint.post("/api/items/<name>/relabel")
def relabel(name): return jsonify(items.relabel(name, request.get_json(silent=True)))


@blueprint.put("/api/items/<name>/tags")
def tag(name): return jsonify(items.set_tag(name, request.get_json(silent=True)))


@blueprint.get("/api/items/<name>/backlinks")
def backlinks(name): return jsonify(items.backlinks(name))


@blueprint.post("/api/items/<name>/backlinks")
def add_backlink(name): return jsonify(items.backlink(name, request.get_json(silent=True)))


@blueprint.get("/api/files/<path:rel>")
def get_file(rel): return send_file(media.path(rel), conditional=True)


@blueprint.put("/api/files/<path:rel>")
def put_file(rel):
    text = (request.get_json(silent=True) or {}).get("text")
    if not isinstance(text, str):
        raise items.ValidationError("text required")
    media.write_text(rel, text)
    return "", 204


@blueprint.get("/api/file-path")
def file_path(): return jsonify(path=str(media.path(request.args.get("p", ""))))
