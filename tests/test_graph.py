import pytest

from dsl_crud.core import file_kinds
from dsl_crud.features.graph import service as graph
from dsl_crud.infrastructure import config, items as store, media as files


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    monkeypatch.setattr(graph, "_undo", None)
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def names(g: dict) -> list[str]:
    return [n["filename"] for n in g["nodes"]]


# --- graph ---


def test_pin_brings_in_neighbors_to_its_depth():
    note("a", "A\n-> knows @b")
    note("b", "B\n-> knows @c")
    note("c", "C")
    assert names(graph.build([{"filename": "a.txt", "depth": 0}])) == ["a.txt"]
    g = graph.build([{"filename": "a.txt", "depth": 1}])
    assert names(g) == ["a.txt", "b.txt"]
    assert g["edges"] == [{"id": "a.txt__b.txt__knows", "source": "a.txt", "target": "b.txt", "label": "knows",
                           "inline": False, "direction": "outgoing", "depth": 1}]
    b = next(n for n in g["nodes"] if n["filename"] == "b.txt")
    assert (b["depth"], b["degree"], b["hiddenNeighbors"]) == (1, 2, 1)
    assert names(graph.build([{"filename": "c.txt", "depth": 2}])) == ["c.txt", "b.txt", "a.txt"]


def test_unlabeled_relation_is_related():
    note("a", "A\n-> @b")
    note("b", "B")
    assert graph.build([{"filename": "a.txt", "depth": 1}])["edges"][0]["label"] == "related"


def test_inline_relationships_are_flagged_deduplicated_and_explicit_wins():
    note("a", "A [[b]] and again [[b|B]]\nextra\nalso [[c]]")
    note("b", "B")
    note("c", "C")
    g = graph.build([{"filename": "a.txt", "depth": 1}])
    assert [(e["target"], e["label"], e["inline"]) for e in g["edges"]] == [
        ("b.txt", "", True), ("c.txt", "", True)]
    store.update("a.txt", {"text": "A [[b]]\n-> explains @b"})
    edge = graph.build([{"filename": "a.txt", "depth": 1}])["edges"][0]
    assert (edge["label"], edge["inline"]) == ("explains", False)


def test_invalid_and_missing_notes_are_left_out_until_fixed(data_dir):
    note("a", "A\n-> x @b\n-> y @gone")
    note("b", "B\ntags Bad")
    g = graph.build([{"filename": "a.txt", "depth": 1}, {"filename": "b.txt", "depth": 1}])
    assert names(g) == ["a.txt"] and g["edges"] == [] and g["nodes"][0]["degree"] == 0
    store.update("b.txt", {"text": "B\ntags bad"})
    assert names(graph.build([{"filename": "a.txt", "depth": 1}])) == ["a.txt", "b.txt"]


def test_size_cap_and_relation_cap(monkeypatch):
    monkeypatch.setattr(graph, "MAX_GRAPH_NODES", 3)
    note("hub", "Hub\n" + "\n".join(f"-> r @n{i}" for i in range(30)))
    for i in range(30):
        note(f"n{i}", f"N{i}")
    g = graph.build([{"filename": "hub.txt", "depth": 1}])
    assert len(g["nodes"]) == 3 and g["truncated"]
    assert g["warnings"] == ["Truncated 2 relationships to keep the graph responsive.",
                             "Skipped 26 additional notes after hitting the graph size cap."]
    assert all(e["target"] in names(g) for e in g["edges"])


def test_pins_are_kept():
    note("a", "A")
    graph.open_graph([{"filename": "a.txt", "depth": 2}, {"filename": "", "depth": 1}, {"filename": "b", "depth": -1}])
    assert graph.pins() == [{"filename": "a.txt", "depth": 2}]


def test_nodes_carry_the_item():
    note("a", "A\nmedia images/x.png\n-> @b\n-> @gone")
    note("b", "B line\nmore")
    n = graph.build([{"filename": "a.txt", "depth": 0}])["nodes"][0]
    item = n["item"]
    assert (item["file"], item["media"], item["refs"]) == ("a.txt", "images/x.png", {"b": "B line", "gone": None})
    assert item["text"].startswith("A\nmedia")


def test_random():
    for k in "abc":
        note(k, k)
    assert graph.random_note(["a.txt", "b.txt"]) == "c.txt"
    assert graph.random_note(["a.txt", "b.txt", "c.txt"]) is None


# --- edits ---


def test_relabel_and_delete_keep_other_lines(data_dir):
    note("a", "A\n(done)\n-> x @b\nunknown thing\n-> y @b\nextra\nmore")
    note("b", "B")
    graph.relabel({"source": "a.txt", "target": "b.txt", "label": "y", "nextLabel": "z"})
    assert (data_dir / "a.txt").read_text() == "A\n(done)\n-> x @b\nunknown thing\n-> z @b\nextra\nmore\n"
    graph.delete_relation({"source": "a.txt", "target": "b.txt", "label": "x"})
    assert (data_dir / "a.txt").read_text() == "A\n(done)\nunknown thing\n-> z @b\nextra\nmore\n"
    assert graph.undo() == {"restored": True}
    assert (data_dir / "a.txt").read_text() == "A\n(done)\nunknown thing\n-> z @b\nextra\nmore\n-> x @b\n"
    assert graph.undo() == {"restored": False}
    with pytest.raises(store.NotFound):
        graph.relabel({"source": "a.txt", "target": "b.txt", "label": "nope", "nextLabel": "q"})


def test_connect_requires_both_notes(data_dir):
    note("a", "A")
    note("b", "B")
    assert graph.connect({"source": "a.txt", "target": "b.txt", "label": "sees"}) == {"label": "sees"}
    assert (data_dir / "a.txt").read_text() == "A\n-> sees @b\n"
    with pytest.raises(store.NotFound):
        graph.connect({"source": "a.txt", "target": "c.txt", "label": ""})


def test_strict_update(data_dir):
    note("a", "A")
    with pytest.raises(store.ValidationError, match="invalid_value"):
        graph.update("a.txt", {"text": "A\nappointment 26-02-30"})
    graph.update("a.txt", {"text": "A2"})
    assert (data_dir / "a.txt").read_text() == "A2\n"


def test_media_attach_replace_clear(data_dir):
    note("a", "A\nappointment 26-01-01\nextra\nx")
    first = files.attach("a.txt", b"one", "image/jpeg")["media"]
    assert first.startswith("images/a-") and first.endswith(".jpg")
    assert (data_dir / "a.txt").read_text() == f"A\nmedia {first}\nappointment 26-01-01\nextra\nx\n"
    note("b", f"B\nmedia {first}")
    second = files.attach("a.txt", b"two", "video/quicktime")["media"]
    assert second.endswith(".mov") and (data_dir / first).exists()  # still b's
    files.clear("a.txt")
    assert (data_dir / "a.txt").read_text() == "A\nappointment 26-01-01\nextra\nx\n"
    assert not (data_dir / second).exists()
    with pytest.raises(store.ValidationError):
        files.attach("a.txt", b"x", "application/pdf")


def test_media_video_size_limit(monkeypatch):
    note("a", "A")
    monkeypatch.setattr(file_kinds, "MAX_VIDEO_BYTES", 2)
    with pytest.raises(store.ValidationError, match="Video is too large"):
        files.attach("a.txt", b"123", "video/mp4")


def test_media_on_a_shared_line(data_dir):
    note("a", "A\nmedia images/old.png appointment 26-01-01")
    files.attach("a.txt", b"x", "image/png")
    text = (data_dir / "a.txt").read_text()
    assert text.startswith("A\nmedia images/a-") and text.endswith(".png appointment 26-01-01\n")
    files.clear("a.txt")
    assert (data_dir / "a.txt").read_text() == "A\nappointment 26-01-01\n"


def test_delete_and_undo_with_media(data_dir):
    note("a", "A")
    rel = files.attach("a.txt", b"bytes", "image/png")["media"]
    text = (data_dir / "a.txt").read_text()
    graph.delete("a.txt")
    assert not (data_dir / "a.txt").exists() and not (data_dir / rel).exists()
    graph.undo()
    assert (data_dir / "a.txt").read_text() == text and (data_dir / rel).read_bytes() == b"bytes"


def test_delete_and_undo_with_several_files(data_dir):
    note("a", "A\nmedia files/a.j2")
    files.write_text("files/a.j2", "{{ body }}")
    rel = files.attach("a.txt", b"bytes", "image/png")["media"]
    graph.delete("a.txt")
    assert not (data_dir / rel).exists() and not (data_dir / "files/a.j2").exists()
    graph.undo()
    assert (data_dir / rel).read_bytes() == b"bytes" and files.read_text("files/a.j2") == "{{ body }}"


def test_hidden_notes_leave_the_graph_and_hide_undoes(data_dir):
    note("a", "A\n-> knows @b\n-> at @c")
    note("b", "B")
    note("c", "C\nappointment 26-08-29")
    pins = [{"filename": "a.txt", "depth": 1}]
    assert names(graph.build(pins)) == ["a.txt", "b.txt"]
    text = (data_dir / "b.txt").read_text()
    graph.hide("b.txt")
    assert names(graph.build(pins)) == ["a.txt"]
    graph.undo()
    assert (data_dir / "b.txt").read_text() == text
    assert names(graph.build(pins)) == ["a.txt", "b.txt"]


def test_explorations_leave_the_graph():
    note("a", "A\n-> knows @b")
    note("b", "B\ntags exploration")
    assert names(graph.build([{"filename": "a.txt", "depth": 1}])) == ["a.txt"]
