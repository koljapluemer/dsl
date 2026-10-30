import pytest

from dsl_crud.features.portfolio import collage

from dsl_crud.features.portfolio import service as portfolio
from dsl_crud.infrastructure import chromium, config, exports, items as store, media as files


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    monkeypatch.setattr(collage, "CACHE_DIR", tmp_path / "cache")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def tagged(data_dir) -> list[str]:
    return sorted(p.name for p in data_dir.glob("*.txt") if "tags portfolio" in p.read_text())


def test_ensure_is_idempotent(data_dir):
    first = portfolio.ensure()
    second = portfolio.ensure()
    assert first == second
    assert tagged(data_dir) == [first["note"]["file"]]
    assert first["note"]["files"] == [first["template"]]
    assert files.read_text(first["template"]).startswith("<!doctype html>")
    assert len(list((data_dir / "files").iterdir())) == 1


def test_ensure_gives_an_existing_note_a_template(data_dir):
    store.create({"file": "me.txt", "text": "Me\nmedia images/me.png\ntags portfolio"})
    files.write_text("files/me.html.j2", "kept")
    result = portfolio.ensure()
    assert result["template"] == "files/me.html.j2"
    assert (data_dir / "me.txt").read_text() == "Me\nmedia images/me.png\nmedia files/me.html.j2\ntags portfolio\n"
    assert files.read_text("files/me.html.j2") == "kept"


def test_several_tagged_notes_are_an_error(data_dir):
    store.create({"file": "a.txt", "text": "A\ntags portfolio"})
    store.create({"file": "b.txt", "text": "B\ntags portfolio"})
    with pytest.raises(store.ValidationError, match="a.txt, b.txt"):
        portfolio.ensure()


def test_render(data_dir):
    store.create({"file": "me.txt", "text": "# Jane & Doe\nI *build* things.\nline two\n\nmedia files/t.j2\ntags portfolio\ndata\nrole: dev"})
    files.write_text("files/t.j2", "<title>{{ title }}</title>{{ body }}<p>{{ data.role }}</p>")
    html = portfolio.render()
    assert html == (portfolio.MARKER + "\n<title>Jane &amp; Doe</title><h1>Jane &amp; Doe</h1>\n"
                    "<p>I <em>build</em> things.<br />\nline two</p>\n<p>dev</p>")
    files.write_text("files/t.j2", "{{ body")
    with pytest.raises(store.ValidationError, match="template"):
        portfolio.render()


def test_export(data_dir, tmp_path):
    portfolio.ensure()
    out = tmp_path / "site"
    out.mkdir()
    [path] = exports.set_paths("portfolio", [str(out)])
    assert path == str(out / "index.html")
    exports.sync("portfolio")
    assert exports.status["portfolio"] == {path: None}
    assert (out / "index.html").read_text().startswith(portfolio.MARKER)


def test_endpoints(data_dir):
    from dsl_crud.application import app
    client = app.test_client()
    template = client.post("/api/portfolio").get_json()["template"]
    assert client.put(f"/api/files/{template}", json={"text": "<b>{{ title }}</b>"}).status_code == 204
    assert client.get(f"/api/files/{template}").data == b"<b>{{ title }}</b>"
    assert client.get("/api/portfolio/preview").data.decode() == f"{portfolio.MARKER}\n<b>Portfolio</b>"
    assert client.put("/api/files/images/x.png", json={"text": "x"}).status_code == 400
    assert client.get("/api/settings").get_json()["exports"] == {"bibtex": [], "portfolio": [], "site": []}
    assert client.put("/api/settings", json={"exports": {"nope": []}}).status_code == 400


needs_chromium = pytest.mark.skipif(not collage.available()["available"], reason=str(collage.available()["reason"]))


def add_card(data_dir, name="c.txt", text="# Card [[x|ref]]\n\nmedia images/p.png\ntags card\nextra\nsome *text*"):
    (data_dir / "images").mkdir(exist_ok=True)
    # a 1x1 PNG
    (data_dir / "images" / "p.png").write_bytes(bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082"))
    store.create({"file": name, "text": text})


@pytest.fixture
def unavailable(monkeypatch):
    monkeypatch.setattr(chromium, "missing", lambda: "Chromium missing")


def test_render_cards(data_dir):
    add_card(data_dir)
    store.create({"file": "me.txt", "text": "Me\nmedia files/t.j2\ntags portfolio"})
    files.write_text("files/t.j2", "{% for c in cards %}{{ c.title }} {{ c.image }} {{ c.thumb }}{% endfor %}")
    assert portfolio.render() == f"{portfolio.MARKER}\nCard [[x|ref]] cards/c.webp cards/c-thumb.webp"
    assert [c["file"] for c in portfolio.cards()] == ["c.txt"]


def test_default_template_shows_the_cards(data_dir):
    add_card(data_dir)
    portfolio.ensure()
    assert '<a href="cards/c.webp" target="_blank" rel="noopener"><img src="cards/c-thumb.webp" alt="Card [[x|ref]]"' in portfolio.render()


@needs_chromium
def test_export_writes_the_cards(data_dir, tmp_path):
    add_card(data_dir)
    portfolio.ensure()
    out = tmp_path / "site"
    (out / "cards").mkdir(parents=True)
    (out / "cards" / "gone.webp").write_bytes(b"old")
    exports.set_paths("portfolio", [str(out)])
    exports.sync("portfolio")
    assert exports.status["portfolio"] == {str(out / "index.html"): None}
    assert sorted(p.name for p in (out / "cards").iterdir()) == ["c-thumb.webp", "c.webp"]
    assert (out / "cards" / "c.webp").read_bytes() == portfolio.card_images("c.txt")[0]


@needs_chromium
def test_card_endpoints(data_dir):
    from dsl_crud.application import app
    add_card(data_dir)
    client = app.test_client()
    assert [c["file"] for c in client.get("/api/portfolio/cards").get_json()] == ["c.txt"]
    r = client.get("/api/portfolio/cards/c-thumb.webp")
    assert r.status_code == 200 and r.content_type == "image/webp"
    assert r.data == portfolio.card_images("c.txt")[1]
    assert client.get("/api/portfolio/cards/nope.webp").status_code == 404


def test_without_chromium_the_export_writes_nothing(data_dir, tmp_path, unavailable):
    portfolio.ensure()
    out = tmp_path / "site"
    out.mkdir()
    exports.set_paths("portfolio", [str(out)])
    exports.sync("portfolio")
    assert exports.status["portfolio"] == {str(out / "index.html"): None}
    add_card(data_dir)
    (out / "cards" / "kept.webp").write_bytes(b"old")
    before = (out / "index.html").read_text()
    exports.sync("portfolio")
    assert "Chromium missing" in exports.status["portfolio"][str(out / "index.html")]
    assert (out / "index.html").read_text() == before
    assert (out / "cards" / "kept.webp").read_bytes() == b"old"


def test_without_chromium_the_tab_and_preview_say_so(data_dir, unavailable):
    from dsl_crud.application import app
    add_card(data_dir)
    client = app.test_client()
    assert client.post("/api/portfolio").get_json()["cards"] == {"available": False, "reason": "Chromium missing"}
    assert client.get("/api/portfolio/preview").status_code == 200
    r = client.get("/api/portfolio/cards/c.webp")
    assert r.status_code == 503 and "Chromium missing" in r.get_json()["error"]
