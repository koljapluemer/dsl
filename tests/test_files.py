import pytest

import files
import store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
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


def test_attach_and_clear_touch_only_the_shown_file(data_dir):
    note("a", "A\nmedia files/t.j2\nextra\nx")
    first = files.attach("a.txt", b"one", "image/png")["media"]
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2\nmedia {first}\nextra\nx\n"
    second = files.attach("a.txt", b"two", "image/png")["media"]
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2\nmedia {second}\nextra\nx\n"
    assert not (data_dir / first).exists()
    files.clear("a.txt")
    assert (data_dir / "a.txt").read_text() == "A\nmedia files/t.j2\nextra\nx\n"


def test_attach_replaces_the_right_clause_on_a_shared_line(data_dir):
    note("a", "A\nmedia files/t.j2 media images/old.png appointment 26-01-01")
    rel = files.attach("a.txt", b"x", "image/png")["media"]
    assert (data_dir / "a.txt").read_text() == f"A\nmedia files/t.j2 media {rel} appointment 26-01-01\n"


def test_add_names_a_file_once(data_dir):
    note("a", "A\nappointment 26-01-01")
    files.add("a.txt", "files/t.j2")
    files.add("a.txt", "files/t.j2")
    assert (data_dir / "a.txt").read_text() == "A\nmedia files/t.j2\nappointment 26-01-01\n"
    files.add("a.txt", "files/my cv.pdf")
    assert (data_dir / "a.txt").read_text() == 'A\nmedia files/t.j2\nmedia "files/my cv.pdf"\nappointment 26-01-01\n'


def test_release_keeps_a_file_another_note_mentions(data_dir):
    note("a", "A")
    rel = files.attach("a.txt", b"x", "image/png")["media"]
    note("b", f"B, see ![]({rel})")
    files.clear("a.txt")
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
