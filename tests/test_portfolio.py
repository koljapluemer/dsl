import pytest

import exports
import files
import portfolio
import store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
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
    import app
    client = app.app.test_client()
    template = client.post("/api/portfolio").get_json()["template"]
    assert client.put(f"/api/files/{template}", json={"text": "<b>{{ title }}</b>"}).status_code == 204
    assert client.get(f"/api/files/{template}").data == b"<b>{{ title }}</b>"
    assert client.get("/api/portfolio/preview").data.decode() == f"{portfolio.MARKER}\n<b>Portfolio</b>"
    assert client.put("/api/files/images/x.png", json={"text": "x"}).status_code == 400
    assert client.get("/api/settings").get_json()["exports"] == {"bibtex": [], "portfolio": []}
    assert client.put("/api/settings", json={"exports": {"nope": []}}).status_code == 400
