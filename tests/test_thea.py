import json
import sys
import textwrap

import pytest

from dsl_crud.application import create_app
from dsl_crud.core import dsl, thea
from dsl_crud.features.thea import service
from dsl_crud.infrastructure import config, items as store, media as files

SCHEMA = dsl.load_schema()


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    monkeypatch.setattr(service, "CACHE_DIR", tmp_path / "cache")
    service._jobs.clear()
    service._failures.clear()
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def version_dir(data_dir, ident: str, spec: str = "s"):
    d = data_dir / thea.DIR / ident
    (d / "src").mkdir(parents=True)
    (d / "src" / "main.ts").write_text("// v\n")
    (d / service.BUILT).write_text("<html data-thea-bridge></html>")
    (d / service.THUMB).write_bytes(b"webp")
    (d / service.META).write_text(json.dumps({"spec": spec}))
    return d


def test_blocks_in_body_and_text_blocks():
    text = "Head\n```thea brave-otter-2\nspec\ntags x\n```\n```js\nx\n```\nextra\n~~~thea\nmore\n~~~\n```thea open"
    blocks = thea.blocks(SCHEMA, text)
    assert [(b.section, b.index, b.name, b.version, b.spec, b.id) for b in blocks] == [
        ("body", 0, "brave-otter", 2, "spec\ntags x", "brave-otter-2"),
        ("extra", 1, None, None, "more", None),
    ]
    assert dsl.parse(SCHEMA, text).warnings[0].code == "unclosed_fence"


def test_with_header_rewrites_only_the_fence_line():
    text = "Head\n  ```thea\nspec\n  ```\nafter"
    block = thea.blocks(SCHEMA, text)[0]
    assert thea.with_header(text, block, "calm-fox", None) == "Head\n  ```thea calm-fox\nspec\n  ```\nafter"
    assert thea.with_header(text, block, "calm-fox", 3) == "Head\n  ```thea calm-fox-3\nspec\n  ```\nafter"


def test_kept_versions_are_current_and_previous():
    assert thea.kept(["a-b-3", "c-d-1", "junk"]) == {"a-b-3", "a-b-2", "c-d-1"}
    assert thea.dir_id("files/thea/a-b-2/src/main.ts") == "a-b-2"
    assert thea.dir_id("files/other/a-b-2/x") is None


def test_version_folders_are_referenced_by_the_block_keeping_them(data_dir):
    for v in (1, 2, 3):
        version_dir(data_dir, f"brave-otter-{v}")
    note("n", "Head\n```thea brave-otter-3\nspec\n```\n")
    assert files.orphaned() == [f"files/thea/brave-otter-1/{f}" for f in ("index.html", "src/main.ts", "thea.json", "thumb.webp")]
    files.delete_orphaned()
    assert sorted(p.name for p in (data_dir / thea.DIR).iterdir()) == ["brave-otter-2", "brave-otter-3"]


def test_cover_falls_back_to_the_first_viz_thumbnail(data_dir):
    version_dir(data_dir, "brave-otter-1")
    file = note("n", "Head\n```thea brave-otter-1\nspec\n```\n")
    assert store.get(file)["media"] == "files/thea/brave-otter-1/thumb.webp"


def test_start_names_the_block_and_queues_it(data_dir, monkeypatch):
    monkeypatch.setattr(service, "_ensure_worker", lambda: None)
    monkeypatch.setattr(service, "status", lambda: {"reason": None})
    file = note("n", "Head\n```thea\nspec\n```\n")
    job = service.start(file, 0)
    block = thea.blocks(SCHEMA, store.get(file)["text"])[0]
    assert block.name == job["name"] and block.version is None
    with pytest.raises(store.Conflict):
        service.start(file, 0)
    with pytest.raises(store.NotFound):
        service.start(file, 5)


def test_new_names_avoid_names_in_use(data_dir, monkeypatch):
    monkeypatch.setattr(service.words, "ADJECTIVES", ["brave", "calm"])
    monkeypatch.setattr(service.words, "NOUNS", ["otter"])
    version_dir(data_dir, "brave-otter-1")
    assert service._new_name() == "calm-otter"


def test_view_is_sandboxed(data_dir):
    version_dir(data_dir, "brave-otter-1")
    client = create_app().test_client()
    r = client.get("/api/thea/brave-otter-1/view")
    assert r.status_code == 200 and "sandbox allow-scripts" in r.headers["Content-Security-Policy"]
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]
    assert client.get("/api/thea/..%2Fx/view").status_code in (400, 404)
    assert client.get("/api/thea/brave-otter-9/view").status_code == 404


FAKE_CLAUDE = textwrap.dedent("""\
    import json, pathlib, sys
    log = pathlib.Path(sys.argv[1])
    log.write_text(log.read_text() + json.dumps(sys.argv[2:]) + "\\n" if log.exists() else json.dumps(sys.argv[2:]) + "\\n")
    prompt = sys.stdin.read()
    pathlib.Path("src/main.ts").write_text("// " + pathlib.Path("SPEC.md").read_text())
    pathlib.Path("dist").mkdir(exist_ok=True)
    pathlib.Path("dist/index.html").write_text("<html data-thea-bridge>built</html>")
    print(json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "npm run check"}}]}}))
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 3, "total_cost_usd": 0.5, "result": "ok"}))
""")


@pytest.fixture
def fake(tmp_path, monkeypatch):
    script = tmp_path / "fake_claude.py"
    script.write_text(FAKE_CLAUDE)
    log = tmp_path / "calls.log"
    config.set_thea({"cli": f"{sys.executable} {script} {log}"})
    monkeypatch.setattr(service, "TEMPLATE", _template(tmp_path))
    monkeypatch.setattr(service, "_thumbnail", lambda html: b"thumb")
    checks = {"fail": 0}

    def command(args, cwd, env, deadline):
        if args[-1] == "check" and checks["fail"]:
            checks["fail"] -= 1
            return False, "FAIL uncaught: boom"
        return True, ""

    monkeypatch.setattr(service, "_command", command)
    return log, checks


def _template(tmp_path):
    t = tmp_path / "template"
    (t / "src").mkdir(parents=True)
    (t / "src" / "main.ts").write_text("// template\n")
    (t / "package.json").write_text("{}")
    return t


def test_run_generates_the_next_version(data_dir, fake):
    log, _ = fake
    file = note("n", "Head\n```thea brave-otter\nA chart\n```\n")
    job = service.Job("brave-otter", file)
    service._run(job, ["TypeError: x"])
    assert job.id == "brave-otter-1" and job.cost_usd == 0.5
    d = data_dir / thea.DIR / "brave-otter-1"
    assert (d / "src" / "main.ts").read_text() == "// A chart\n"
    assert (d / "index.html").read_text().endswith("built</html>")
    assert (d / "thumb.webp").read_bytes() == b"thumb"
    assert json.loads((d / "thea.json").read_text())["spec"] == "A chart"
    assert not (d / "SPEC.md").exists() and not (d / "dist").exists()
    assert "```thea brave-otter-1" in store.get(file)["text"]
    args = json.loads(log.read_text().splitlines()[0])
    assert "--restricted" in args and "--session-id" in args
    assert "TypeError: x" in (service.CACHE_DIR / "brave-otter" / "PREVIOUS_ERRORS.md").read_text()


def test_run_drops_versions_before_the_previous(data_dir, fake):
    for v in (1, 2):
        version_dir(data_dir, f"brave-otter-{v}")
    file = note("n", "Head\n```thea brave-otter-2\nA chart\n```\n")
    service._run(service.Job("brave-otter", file), [])
    assert sorted(p.name for p in (data_dir / thea.DIR).iterdir()) == ["brave-otter-2", "brave-otter-3"]
    # seeded from the previous version
    assert (service.CACHE_DIR / "brave-otter" / "src" / "main.ts").read_text() == "// A chart\n"


def test_failed_gate_resumes_the_session_once(data_dir, fake):
    log, checks = fake
    file = note("n", "Head\n```thea brave-otter\nA chart\n```\n")
    checks["fail"] = 1
    service._run(service.Job("brave-otter", file), [])
    calls = [json.loads(l) for l in log.read_text().splitlines()]
    assert len(calls) == 2 and "--resume" in calls[1]

    checks["fail"] = 2
    with pytest.raises(service.Failed, match="still fails"):
        service._run(service.Job("brave-otter", file), [])
    assert "```thea brave-otter-1" in store.get(file)["text"]


def test_run_fails_when_the_block_is_gone(data_dir, fake):
    file = note("n", "Head\nno viz\n")
    with pytest.raises(service.Failed, match="no longer has"):
        service._run(service.Job("brave-otter", file), [])


def test_thea_settings_are_validated(data_dir):
    config.set_thea({"model": "opus", "budget_usd": 2, "timeout_min": 10})
    assert config.get_thea() == {"cli": "claude", "model": "opus", "budget_usd": 2, "timeout_min": 10}
    for bad in ({"timeout_min": 0}, {"budget_usd": -1}, {"cli": 3}):
        with pytest.raises(store.ValidationError):
            config.set_thea(bad)


@pytest.mark.skipif(not service.shutil.which("npm") or service.chromium.missing() is not None, reason="needs npm and Chromium")
def test_template_builds_lints_and_checks(tmp_path):
    import os
    import shutil
    import subprocess
    ws = tmp_path / "ws"
    shutil.copytree(service.TEMPLATE, ws)
    env = os.environ | {"DSL_PYTHON": sys.executable, "DSL_CHECK": str(service.check.__file__)}
    for args in (["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], ["npm", "run", "lint"], ["npm", "run", "check"]):
        r = subprocess.run(args, cwd=ws, env=env, capture_output=True, text=True, timeout=300)
        assert r.returncode == 0, r.stdout + r.stderr
    assert "data-thea-bridge" in (ws / "dist" / "index.html").read_text()
