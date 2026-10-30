import pytest

from dsl_crud.infrastructure import config, exports
from dsl_crud.infrastructure.errors import ValidationError


@pytest.fixture(autouse=True)
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    monkeypatch.setattr(exports, "EXPORTS", {})
    monkeypatch.setattr(exports, "status", {})


def test_runner(tmp_path):
    content = {"text": "#mine\nv1\n"}
    exports.register(exports.Export("demo", ".txt", "out.txt", "#mine", lambda: content["text"]))
    foreign = tmp_path / "theirs.txt"
    foreign.write_text("hands off\n")
    paths = exports.set_paths("demo", [str(tmp_path), str(foreign), str(tmp_path / "x.md"), "rel.txt"])
    assert paths[0] == str(tmp_path / "out.txt")

    exports.sync()
    assert [e["error"] for e in exports.paths("demo")][0] is None
    errors = exports.status["demo"]
    assert "not generated" in errors[paths[1]] and ".txt" in errors[paths[2]] and "absolute" in errors[paths[3]]
    assert foreign.read_text() == "hands off\n"

    out = tmp_path / "out.txt"
    mtime = out.stat().st_mtime_ns
    exports.sync("demo")
    assert out.stat().st_mtime_ns == mtime
    content["text"] = "#mine\nv2\n"
    exports.sync("demo")
    assert out.read_text() == "#mine\nv2\n"


def test_render_error_is_reported(tmp_path):
    def broken():
        raise ValidationError("no note")
    exports.register(exports.Export("demo", ".txt", "out.txt", "#", broken))
    [path] = exports.set_paths("demo", [str(tmp_path)])
    exports.sync()
    assert exports.status["demo"] == {path: "no note"}


def test_unknown_export():
    with pytest.raises(ValidationError):
        exports.set_paths("nope", [])


def test_folder_export(tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "CNAME").write_text("example.org\n")
    content = {"files": {"index.html": b"home", "a/b.html": b"b", "a/c/d.html": b"d"}}
    exports.register(exports.Export("demo", "", None, "#mine", lambda: content["files"], folder=True))
    assert exports.set_paths("demo", [str(site)]) == [str(site)]

    exports.sync()
    assert exports.status["demo"] == {str(site): None}
    assert (site / "a" / "c" / "d.html").read_bytes() == b"d"
    assert (site / exports.MANIFEST).read_text() == "#mine\na/b.html\na/c/d.html\nindex.html\n"

    mtime = (site / "index.html").stat().st_mtime_ns
    content["files"] = {"index.html": b"home", "a/b.html": b"b2"}
    exports.sync()
    assert (site / "index.html").stat().st_mtime_ns == mtime
    assert (site / "a" / "b.html").read_bytes() == b"b2"
    assert not (site / "a" / "c").exists()
    assert (site / "CNAME").read_text() == "example.org\n"

    # a file it didn't write is never overwritten
    content["files"] = {"index.html": b"home", "CNAME": b"x"}
    exports.sync()
    assert "not generated" in exports.status["demo"][str(site)]
    assert (site / "CNAME").read_text() == "example.org\n"
    assert (site / "a" / "b.html").exists()


def test_folder_export_needs_a_folder(tmp_path):
    exports.register(exports.Export("demo", "", None, "#mine", lambda: {"x.html": b""}, folder=True))
    [path] = exports.set_paths("demo", [str(tmp_path / "missing")])
    exports.sync()
    assert "not a folder" in exports.status["demo"][path]
