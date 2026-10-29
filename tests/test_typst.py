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


SOURCE = ('Attention Is All You Need\n\nsource\ndata\nkey: vaswani2017\nentrytype: article\n'
          'author:\n- Vaswani, Ashish\n- Müller, Jörg\njournaltitle: NeurIPS\ndate: "2017"\n')
CITING = '= Doc\nAs shown @vaswani2017.\n\n#bibliography("/sources.bib", style: "association-for-computing-machinery")\n'


def test_cites_build_from_the_generated_bibliography(client, data_dir):
    store.create({"file": "s.txt", "text": SOURCE})
    store.create({"file": "a.txt", "text": "A"})
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    assert client.put(f"/api/typst/{rel}", json={"text": CITING}).get_json() == {"errors": None, "pdf": True}
    bib = (data_dir / "sources.bib").read_text()
    assert "@article{vaswani2017," in bib and "Müller, Jörg" in bib
    res = client.put(f"/api/typst/{rel}", json={"text": CITING.replace("vaswani2017", "nobody")}).get_json()
    assert "nobody" in res["errors"]


def test_saving_with_the_note_relates_it_to_the_sources_cited_once(client):
    store.create({"file": "s.txt", "text": SOURCE})
    store.create({"file": "a.txt", "text": "A"})
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    client.put(f"/api/typst/{rel}", json={"text": CITING})
    assert "-> source" not in store.get("a.txt")["text"]
    res = client.put(f"/api/typst/{rel}", json={"text": CITING, "note": "a.txt"}).get_json()
    assert res["item"]["text"].endswith("-> source @s\n")
    again = client.put(f"/api/typst/{rel}", json={"text": CITING, "note": "a.txt"}).get_json()
    assert "item" not in again
    assert store.get("a.txt")["text"].count("-> source @s") == 1


def test_saving_with_a_note_not_naming_the_file_is_refused(client):
    store.create({"file": "a.txt", "text": "A"})
    store.create({"file": "b.txt", "text": "B"})
    rel = client.post("/api/items/a.txt/typst").get_json()["path"]
    assert client.put(f"/api/typst/{rel}", json={"text": "x", "note": "b.txt"}).status_code == 400


def test_cite_sources_related_then_on_the_canvas(client):
    for f in ("s1", "s2", "s3"):
        store.create({"file": f"{f}.txt", "text": SOURCE.replace("vaswani2017", f)})
    store.create({"file": "other.txt", "text": "Other"})
    store.create({"file": "a.txt", "text": (
        "A [[s3]]\n-> source @s2\n-> @other\ndata\ncanvas:\n  nodes:\n"
        "  - {id: n1, x: 0, y: 0, note: s1}\n  - {id: n2, x: 0, y: 0, note: s2}\n  - {id: n3, x: 0, y: 0, note: other}\n")})
    assert client.get("/api/typst/cite-sources?note=a.txt").get_json() == ["s2.txt", "s3.txt", "s1.txt"]
