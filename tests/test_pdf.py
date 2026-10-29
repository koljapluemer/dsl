import pytest

from dsl_crud.application import create_app
from dsl_crud.features.pdf import service
from dsl_crud.infrastructure import chromium, config, items as store

TEXT = "# Title\nSee [[b]] and [[b|that one]].\n\nextra\nThe **extra** part.\n"


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


@pytest.fixture
def client():
    return create_app().test_client()


def test_both_sections_references_as_their_text():
    store.create({"file": "a.txt", "text": TEXT})
    store.create({"file": "b.txt", "text": "Bee"})
    page = service.page_html("a.txt")
    assert "<h1>Title</h1>" in page and "See Bee and that one." in page
    assert "<strong>extra</strong>" in page and "<hr>" in page
    assert "<title>Title</title>" in page


def test_body_or_extra_only():
    store.create({"file": "a.txt", "text": TEXT})
    body = service.page_html("a.txt", "body")
    assert "Title" in body and "extra" not in body.split("</style>")[1]
    extra = service.page_html("a.txt", "extra")
    assert "<strong>extra</strong>" in extra and "<h1>" not in extra


def test_extra_needs_one():
    store.create({"file": "a.txt", "text": "A"})
    with pytest.raises(store.ValidationError):
        service.page_html("a.txt", "extra")


def test_viz_blocks_as_their_thumbnail_else_left_out(data_dir):
    text = "A\n```thea calm-river-1\nspec\n```\n```thea\nother\n```\nafter\n"
    store.create({"file": "a.txt", "text": text})
    thumb = data_dir / "files/thea/calm-river-1/thumb.webp"
    thumb.parent.mkdir(parents=True)
    thumb.write_bytes(b"RIFF")
    page = service.page_html("a.txt")
    assert page.count('class="viz"><img src="data:image/webp;base64,') == 1
    assert "spec" not in page and "other" not in page and "after" in page


def test_images_only_when_asked(data_dir):
    (data_dir / "images").mkdir()
    (data_dir / "images/x.png").write_bytes(b"png")
    store.create({"file": "a.txt", "text": "A\nmedia images/x.png\n"})
    assert 'class="images"' in service.page_html("a.txt")
    assert 'class="images"' not in service.page_html("a.txt", images=False)


def test_invalid_options(client):
    store.create({"file": "a.txt", "text": "A"})
    assert client.get("/api/items/a.txt/pdf?content=all").status_code == 400
    assert client.get("/api/items/a.txt/pdf?paper=A3").status_code == 400
    assert client.get("/api/items/missing.txt/pdf").status_code == 404


def test_unavailable_without_chromium(client, monkeypatch):
    monkeypatch.setattr(chromium, "missing", lambda: "no Chromium")
    store.create({"file": "a.txt", "text": "A"})
    assert client.get("/api/pdf/status").get_json() == {"available": False, "reason": "no Chromium"}
    assert client.get("/api/items/a.txt/pdf").status_code == 503


@pytest.mark.skipif(chromium.missing() is not None, reason=str(chromium.missing()))
def test_export(client):
    store.create({"file": "a.txt", "text": TEXT})
    res = client.get("/api/items/a.txt/pdf?content=extra&paper=Letter")
    assert res.status_code == 200 and res.data.startswith(b"%PDF")
    assert res.headers["Content-Disposition"] == "attachment; filename*=UTF-8''a.pdf"
