import json

import pytest

from dsl_crud.features.site import service as site
from dsl_crud.infrastructure import config, exports, items as store, media as files


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name, text):
    store.create({"file": name, "text": text})


def test_path():
    assert site.path("_index") == "index.html"
    assert site.path("essays/_index") == "essays/index.html"
    assert site.path("essays/a") == "essays/a.html"
    assert site.path("a") == "a.html"


def test_ensure_is_idempotent(data_dir):
    first = site.ensure()
    assert site.ensure() == first
    assert first["note"]["route"] == "_index"
    assert first["note"]["files"] == [first["template"]]
    assert files.read_text(first["template"]) == site.TEMPLATE
    assert len(list(data_dir.glob("*.txt"))) == 1


def test_ensure_gives_an_existing_root_a_template(data_dir):
    note("home.txt", "Home\npublish _index\nHi")
    assert site.ensure()["template"] == "files/home.html.j2"
    assert (data_dir / "home.txt").read_text() == "Home\nmedia files/home.html.j2\npublish _index\nHi\n"


def test_clash_is_an_error():
    note("a.txt", "A\npublish x\nA")
    note("b.txt", "B\npublish x\nB")
    with pytest.raises(store.ValidationError, match=r"x \(a.txt, b.txt\)"):
        site.ensure()
    with pytest.raises(store.ValidationError, match="several notes"):
        site.tree()


def pages():
    note("home.txt", "Home\nmedia files/t.j2\npublish _index\nSee [[essay|the essay]] and [[idx]].")
    files.write_text("files/t.j2", "{{ root }}|{{ title }}|{{ content }}")
    return {k: v.decode() if k.endswith(".html") else v for k, v in site.tree().items()}


def test_links(data_dir):
    note("essay.txt", "# Essay $1\nmedia images/a.png\nmedia images/v.mp4\npublish essays/deep/one\n"
         "Back [[home]], [[private]], [[gone|Gone *x* $y$]].\n![[a.png|A]] ![[images/v.mp4]] ![[nope.png]]")
    note("idx.txt", "Essays\npublish essays/_index\nIndex")
    note("private.txt", "Private stuff\nNot published.")
    (data_dir / "images").mkdir()
    (data_dir / "images" / "a.png").write_bytes(b"png")
    (data_dir / "images" / "v.mp4").write_bytes(b"mp4")
    out = pages()
    assert sorted(out) == ["essays/deep/one.html", "essays/index.html", "images/a.png", "images/v.mp4", "index.html"]
    assert out["images/a.png"] == b"png"
    assert out["index.html"] == ('|Home|<p>See <a href="essays/deep/one.html">the essay</a> and '
                                 '<a href="essays/index.html">Essays</a>.</p>\n')
    one = out["essays/deep/one.html"]
    assert one.startswith("../../|Essay $1|")
    assert '<a href="../../index.html">Home</a>' in one
    assert '<a class="missing" aria-disabled="true" title="not published">Private stuff</a>' in one
    assert ">Gone *x* $y$</a>" in one
    assert '<img src="../../images/a.png" alt="A">' in one
    assert '<video src="../../images/v.mp4" controls></video>' in one
    assert "nope" not in one
    assert out["essays/index.html"].startswith("../|Essays|")


def test_export(data_dir, tmp_path, monkeypatch):
    site.ensure()
    note("a.txt", "A\npublish a\nText")
    out = tmp_path / "site"
    out.mkdir()
    monkeypatch.setattr(exports, "EXPORTS", {})
    monkeypatch.setattr(exports, "status", {})
    exports.register(site.export_definition())
    exports.set_paths("site", [str(out)])
    exports.sync("site")
    assert exports.status["site"] == {str(out): None}
    assert sorted(p.name for p in out.iterdir()) == [exports.MANIFEST, "a.html", "index.html"]
    assert "<p>Text</p>" in (out / "a.html").read_text()
    assert '<a href="index.html">Home</a>' in (out / "a.html").read_text()


def test_endpoint(data_dir):
    from dsl_crud.application import app
    client = app.test_client()
    first = client.post("/api/site").get_json()
    assert client.post("/api/site").get_json() == first
    assert client.get("/api/settings").get_json()["exports"]["site"] == []


def built(data_dir, ident, spec="Built spec"):
    d = data_dir / "files/thea" / ident
    d.mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html>\n<html>\n<head>\n<script data-thea-bridge></script>\n</head></html>")
    (d / "thea.json").write_text(json.dumps({"spec": spec}))


def test_viz_is_an_iframe_of_its_copied_page(data_dir):
    built(data_dir, "calm-river-2", spec="Rain $x$ [[a]] <b>\n\nhover *it*")
    note("deep.txt", "Deep\npublish essays/deep\nBefore\n```thea calm-river-2\nedited since\n```\nAfter")
    out = pages()
    page = out["essays/deep.html"]
    assert ('<figure class="viz"><iframe src="../files/thea/calm-river-2/index.html" sandbox="allow-scripts" '
            'title="Rain &#36;x&#36; &#91;&#91;a&#93;&#93; &lt;b&gt;" style="height: 160px"></iframe>') in page
    assert ("<details><summary>spec</summary><pre>Rain &#36;x&#36; &#91;&#91;a&#93;&#93; &lt;b&gt;&#10;&#10;hover &#42;it&#42;</pre>"
            "</details>") in page
    assert "edited since" not in page and "<code>" not in page
    assert "<p>Before</p>" in page and "<p>After</p>" in page
    assert page.count(site.RESIZE) == 1
    assert site.RESIZE not in out["index.html"]
    viz = out["files/thea/calm-river-2/index.html"]
    assert viz.startswith('<!doctype html>\n<html>\n<head>\n<meta http-equiv="Content-Security-Policy" '
                          'content="default-src &#x27;none&#x27;;')
    assert viz.index("Content-Security-Policy") < viz.index("data-thea-bridge")


def test_viz_without_meta(data_dir):
    built(data_dir, "calm-river-1")
    (data_dir / "files/thea/calm-river-1/thea.json").unlink()
    note("a.txt", "A\npublish a\n```thea calm-river-1\nNote spec\n```")
    page = pages()["a.html"]
    assert "<pre>Note spec</pre>" in page


def test_unbuilt_and_unpublished_vizzes_are_left_out(data_dir):
    built(data_dir, "calm-river-1")
    note("a.txt", "A\n```thea calm-river-1\nbody\n```\nextra\n```thea calm-river-1\nextra\n```\n"
         "publish a\n```thea\nnew\n```\n```thea calm-river\nnamed\n```\n```thea calm-river-5\ngone\n```\nText")
    out = pages()
    assert out["a.html"] == "|A|<p>Text</p>\n"
    assert not any(k.startswith("files/thea") for k in out)
