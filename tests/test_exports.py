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
