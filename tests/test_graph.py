import pytest

import attachments
import graph
import store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    monkeypatch.setattr(graph, "_undo", None)
    store.set_path(str(tmp_path / "data"))
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
                           "direction": "outgoing", "depth": 1}]
    b = next(n for n in g["nodes"] if n["filename"] == "b.txt")
    assert (b["depth"], b["degree"], b["hiddenNeighbors"]) == (1, 2, 1)
    assert names(graph.build([{"filename": "c.txt", "depth": 2}])) == ["c.txt", "b.txt", "a.txt"]


def test_unlabeled_relation_is_related():
    note("a", "A\n-> @b")
    note("b", "B")
    assert graph.build([{"filename": "a.txt", "depth": 1}])["edges"][0]["label"] == "related"


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


def test_section_lines_and_data_on_nodes():
    note("a", "A\nproject\nmedia images/x.png\ntags t\nzap something\n(done)\ndata\nk: v\nextra\nmore")
    n = graph.build([{"filename": "a.txt", "depth": 0}])["nodes"][0]
    assert n["sectionLines"] == ["project", "zap something"]
    assert (n["dataText"], n["extraContent"], n["image"]) == ("k: v", "more", "images/x.png")


# --- search ---


def test_query_parser():
    q = graph.parse_query('foo "a b" OR -/x+/i body:(bar baz) key:val')
    assert isinstance(q, graph.Op) and q.type == "or"
    assert q.children[0] == graph.Op("and", [graph.Term("foo", "fuzzy"), graph.Term("a b", "exact")])
    right = q.children[1].children
    assert right[0] == graph.Not(graph.Term("x+", "regex", "i"))
    assert right[1] == graph.Scope("body", graph.Op("and", [graph.Term("bar", "fuzzy"), graph.Term("baz", "fuzzy")]))
    assert right[2] == graph.Term("key:val", "fuzzy")
    for incomplete in ['"open', "/open", "(a", "a OR"]:
        with pytest.raises(graph.IncompleteQuery):
            graph.parse_query(incomplete)
    with pytest.raises(store.ValidationError):
        graph.parse_query("/x/g")


def hits(q: str, **kw) -> list[str]:
    return [r["filename"] for r in graph.search(q, **kw)["results"]]


def test_fuzzy_prefix_and_fields():
    note("a", "Apples and pears")
    note("b", "Bananas\nextra\nalso apples")
    note("c", "Cherries")
    assert hits("app") == ["a.txt", "b.txt"]  # an extra-only match comes last
    assert hits("body:app") == ["a.txt"]
    assert hits("extra:apples") == ["b.txt"]
    assert hits("app -bananas") == ["a.txt"]
    assert hits("cherries OR pears") == ["a.txt", "c.txt"] or hits("cherries OR pears") == ["c.txt", "a.txt"]
    assert hits("file:cherr") == [] and hits("file:c.txt") == ["c.txt"]


def test_exact_regex_and_orphans():
    note("a", "The quick fox\n-> r @b")
    note("b", "Slow fox")
    assert hits('"QUICK FOX"') == ["a.txt"]
    assert hits("/sl.w/i") == ["b.txt"]
    assert hits("fox", orphan="connected") == ["a.txt", "b.txt"] or hits("fox", orphan="connected") == ["b.txt", "a.txt"]
    note("c", "Lonely fox")
    assert hits("fox", orphan="orphan") == ["c.txt"]
    with pytest.raises(store.ValidationError):
        graph.search("/(/")
    assert graph.search_filenames("fox", cap=1)["total"] == 3


def test_match_display_uses_utf16_offsets():
    note("a", "😀 x needle")
    r = graph.search('"needle"')["results"][0]
    assert r["preview"] == "😀 x needle"
    assert r["previewMatch"] == {"start": 5, "length": 6}
    note("b", "Body\nextra\n" + "w " * 40 + "deep needle")
    r = next(x for x in graph.search('"deep"')["results"])
    assert r["previewMatch"] is None and r["excerpt"]["text"].startswith("…")
    ex = r["excerpt"]
    assert ex["text"][ex["match"]["start"] : ex["match"]["start"] + ex["match"]["length"]] == "deep"


def test_recent_and_random():
    for k in "abc":
        note(k, k)
    assert graph.recent()["total"] == 3
    assert graph.random_note(["a.txt", "b.txt"]) == "c.txt"
    assert graph.random_note(["a.txt", "b.txt", "c.txt"]) is None


# --- edits ---


def test_create_related_and_reverse(data_dir):
    note("a", "A\nappointment 26-01-01")
    made = graph.create({"body": "New one", "related": "a.txt", "label": " "})
    assert made["label"] == "related"
    assert (data_dir / "a.txt").read_text() == f"A\nappointment 26-01-01\n-> related @{made['filename'][:-4]}\n"
    back = graph.create({"body": "Other", "related": "a.txt", "label": "for", "reverse": True})
    assert (data_dir / back["filename"]).read_text() == "Other\n-> for @a\n"
    with pytest.raises(store.NotFound):
        graph.create({"body": "x", "related": "missing.txt"})


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
    first = attachments.attach("a.txt", b"one", "image/jpeg")["media"]
    assert first.startswith("images/a-") and first.endswith(".jpg")
    assert (data_dir / "a.txt").read_text() == f"A\nmedia {first}\nappointment 26-01-01\nextra\nx\n"
    note("b", f"B\nmedia {first}")
    second = attachments.attach("a.txt", b"two", "video/quicktime")["media"]
    assert second.endswith(".mov") and (data_dir / first).exists()  # still b's
    attachments.clear("a.txt")
    assert (data_dir / "a.txt").read_text() == "A\nappointment 26-01-01\nextra\nx\n"
    assert not (data_dir / second).exists()
    with pytest.raises(store.ValidationError):
        attachments.attach("a.txt", b"x", "application/pdf")


def test_media_video_size_limit(monkeypatch):
    note("a", "A")
    monkeypatch.setattr(attachments, "MAX_VIDEO_BYTES", 2)
    with pytest.raises(store.ValidationError, match="Video is too large"):
        attachments.attach("a.txt", b"123", "video/mp4")


def test_media_on_a_shared_line(data_dir):
    note("a", "A\nmedia images/old.png appointment 26-01-01")
    attachments.attach("a.txt", b"x", "image/png")
    text = (data_dir / "a.txt").read_text()
    assert text.startswith("A\nmedia images/a-") and text.endswith(".png appointment 26-01-01\n")
    attachments.clear("a.txt")
    assert (data_dir / "a.txt").read_text() == "A\nappointment 26-01-01\n"


def test_delete_and_undo_with_media(data_dir):
    note("a", "A")
    rel = attachments.attach("a.txt", b"bytes", "image/png")["media"]
    text = (data_dir / "a.txt").read_text()
    graph.delete("a.txt")
    assert not (data_dir / "a.txt").exists() and not (data_dir / rel).exists()
    graph.undo()
    assert (data_dir / "a.txt").read_text() == text and (data_dir / rel).read_bytes() == b"bytes"


def test_hidden_notes_leave_the_graph_and_hide_undoes(data_dir):
    note("a", "A\n-> knows @b\n-> at @c")
    note("b", "B")
    note("c", "C\nappointment 26-08-29")
    pins = [{"filename": "a.txt", "depth": 1}]
    assert names(graph.build(pins)) == ["a.txt", "b.txt"]
    text = (data_dir / "b.txt").read_text()
    graph.hide("b.txt")
    assert names(graph.build(pins)) == ["a.txt"]
    assert graph.search("B")["results"] == []
    graph.undo()
    assert (data_dir / "b.txt").read_text() == text
    assert names(graph.build(pins)) == ["a.txt", "b.txt"]
