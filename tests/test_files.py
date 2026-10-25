import pytest

from dsl_crud.application import create_app
from dsl_crud.infrastructure import config, items as store, media as files


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def test_path(data_dir):
    (data_dir / "img").mkdir()
    (data_dir / "img" / "a.png").write_bytes(b"x")
    (data_dir / "img" / "a.txt").write_bytes(b"x")
    assert files.path("img/a.png") == data_dir / "img" / "a.png"
    assert files.path("img/a.txt") == data_dir / "img" / "a.txt"
    for bad in ["../x.png", "/etc/x.png", "a.txt"]:
        with pytest.raises(store.ValidationError):
            files.path(bad)
    with pytest.raises(store.NotFound):
        files.path("img/b.png")


def test_item_lists_its_files(data_dir):
    note("a", "A\nmedia files/t.j2\nmedia images/x.png\nmedia images/y.png")
    item = store.get("a.txt")
    assert (item["media"], item["files"]) == ("images/x.png", ["files/t.j2", "images/x.png", "images/y.png"])


def test_attach_appends_and_remove_drops_one(data_dir):
    note("a", "A\nmedia files/t.j2\nextra\nx")
    first = files.attach("a.txt", b"one", "image/png")["files"][-1]
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2\nmedia {first}\nextra\nx\n"
    item = files.attach("a.txt", b"two", "image/png")
    second = item["files"][-1]
    assert (item["media"], item["files"]) == (first, ["files/t.j2", first, second])
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2\nmedia {first}\nmedia {second}\nextra\nx\n"
    assert files.remove("a.txt", first)["media"] == second
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2\nmedia {second}\nextra\nx\n"
    assert not (data_dir / first).exists() and (data_dir / second).exists()


def test_remove_drops_the_right_clause_on_a_shared_line(data_dir):
    note("a", "A\nmedia files/t.j2 media images/old.png appointment 26-01-01")
    files.remove("a.txt", "images/old.png")
    assert (data_dir / "a.txt").read_text() == "A\nmedia files/t.j2 appointment 26-01-01\n"


def test_media_api_adds_and_removes_by_path(data_dir):
    client = create_app().test_client()
    note("a", "A")
    for data in (b"one", b"two"):
        res = client.post("/api/items/a.txt/media", data=data, content_type="image/png")
        assert res.status_code == 200
    first, second = res.get_json()["files"]
    res = client.delete(f"/api/items/a.txt/media?p={first}")
    assert (res.get_json()["media"], res.get_json()["files"]) == (second, [second])
    assert not (data_dir / first).exists()


def test_remove_releases_a_file_no_longer_named(data_dir):
    note("a", "A")
    rel = files.attach("a.txt", b"x", "image/png")["files"][-1]
    store.update("a.txt", {"text": "A"})
    assert files.remove("a.txt", rel)["text"] == "A\n"
    assert not (data_dir / rel).exists()


def test_add_names_a_file_once(data_dir):
    note("a", "A\nappointment 26-01-01")
    files.add("a.txt", "files/t.j2")
    files.add("a.txt", "files/t.j2")
    assert (data_dir / "a.txt").read_text() == "A\nmedia files/t.j2\nappointment 26-01-01\n"
    files.add("a.txt", "files/my cv.pdf")
    assert (data_dir / "a.txt").read_text() == 'A\nmedia files/t.j2\nmedia "files/my cv.pdf"\nappointment 26-01-01\n'


def test_release_keeps_a_file_another_note_mentions(data_dir):
    note("a", "A")
    rel = files.attach("a.txt", b"x", "image/png")["files"][-1]
    note("b", f"B, see ![]({rel})")
    files.remove("a.txt", rel)
    assert (data_dir / rel).exists()


def test_text_files(data_dir):
    files.write_text("files/t.j2", "{{ x }}")
    assert files.read_text("files/t.j2") == "{{ x }}"
    with pytest.raises(store.ValidationError):
        files.write_text("files/x.png", "nope")


def test_orphaned(data_dir):
    for rel in ["images/orphan.png", "images/used.jpg", "images/named.mp4", "images/.x.tmp",
                "files/old.j2", "files/site/used.css", "outside.png"]:
        (data_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        (data_dir / rel).write_bytes(b"x")
    note("a", "A\nmedia images/used.jpg\nmedia files/site/used.css")
    note("b", "B, see images/named.mp4")

    assert files.orphaned() == ["files/old.j2", "images/orphan.png"]
    assert files.delete_orphaned() == 2
    assert files.orphaned() == []
    assert (data_dir / "outside.png").exists() and (data_dir / "images/.x.tmp").exists()


def test_orphaned_without_folders():
    assert files.orphaned() == []
