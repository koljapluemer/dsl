import io

import pytest

from dsl_crud.application import create_app
from dsl_crud.infrastructure import config, items as store, media as files

pytest.importorskip("typst")


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


@pytest.fixture
def client():
    return create_app().test_client()


def test_status(client):
    assert client.get("/api/typst/status").get_json() == {"available": True, "reason": None}


def test_create_names_the_file_and_builds_it(client, data_dir):
    store.create({"file": "a.txt", "text": "A"})
    res = client.post("/api/items/a.txt/typst")
    assert res.status_code == 201
    body = res.get_json()
    rel = body["path"]
    assert rel.startswith("files/a-") and rel.endswith(".typ")
    assert body["errors"] is None
    assert body["item"]["files"] == [rel]
    assert (data_dir / rel.removesuffix(".typ")).with_suffix(".pdf").read_bytes().startswith(b"%PDF")


def test_notes_lists_those_naming_a_typst_file(client):
    store.create({"file": "a.txt", "text": "A"})
    store.create({"file": "b.txt", "text": "B"})
    client.post("/api/items/a.txt/typst")
    assert [i["file"] for i in client.get("/api/typst/notes").get_json()] == ["a.txt"]


def test_create_needs_the_note(client):
    assert client.post("/api/items/missing.txt/typst").status_code == 404


def test_a_failed_build_keeps_the_source_and_the_previous_pdf(client, data_dir):
    store.create({"file": "a.txt", "text": "A"})
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    pdf = data_dir / (rel.removesuffix(".typ") + ".pdf")
    before = pdf.read_bytes()
    res = client.put(f"/api/typst/{rel}", json={"text": "#let x = \n"})
    body = res.get_json()
    assert "expected expression" in body["errors"] and body["pdf"]
    assert files.read_text(rel) == "#let x = \n"
    assert pdf.read_bytes() == before


def test_save_only_typst_files(client):
    assert client.put("/api/typst/files/t.j2", json={"text": "x"}).status_code == 400


def test_images_from_the_data_folder_webp_included(client, data_dir):
    from PIL import Image

    store.create({"file": "a.txt", "text": "A"})
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buf, "WEBP", lossless=True)
    img = files.attach("a.txt", buf.getvalue(), "image/webp")["files"][-1]
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    res = client.put(f"/api/typst/{rel}", json={"text": f'#image("/{img}")'})
    assert res.get_json() == {"errors": None, "pdf": True}


def test_without_typst_nothing_is_written(client, monkeypatch):
    from dsl_crud.infrastructure import typst

    store.create({"file": "a.txt", "text": "A"})
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    monkeypatch.setattr(typst, "missing", lambda: "not here")
    assert client.get("/api/typst/status").get_json() == {"available": False, "reason": "not here"}
    assert client.put(f"/api/typst/{rel}", json={"text": "x"}).status_code == 503
    assert client.post("/api/items/a.txt/typst").status_code == 503
    assert files.read_text(rel) != "x"
