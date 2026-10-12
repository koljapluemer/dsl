import os
import re

import pytest

import store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def test_create_names_file_slug_hex(data_dir):
    a = store.create({"text": "HCI lecture 4pm\nrecurring mo"})
    b = store.create({"text": "HCI lecture 4pm\nrecurring mo"})
    assert re.fullmatch(r"hci-lecture-4pm-[0-9a-f]{6}\.txt", a["file"])
    assert a["file"] != b["file"]
    assert (data_dir / a["file"]).read_text() == "HCI lecture 4pm\nrecurring mo\n"
    assert not a["errors"]


def test_name_stays_when_text_changes(data_dir):
    a = store.create({"text": "a\nrecurring mo"})
    assert store.update(a["file"], {"text": "b\nrecurring tu"})["file"] == a["file"]
    assert [p.name for p in data_dir.iterdir()] == [a["file"]]


def test_invalid_text_is_kept(data_dir):
    item = store.create({"text": "x\nappointment 26-02-30"})
    assert [e["code"] for e in item["errors"]] == ["invalid_value"]
    assert (data_dir / item["file"]).read_text() == "x\nappointment 26-02-30\n"


def test_restore_and_delete(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    with pytest.raises(store.Conflict):
        store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    store.delete("a.txt")
    with pytest.raises(store.NotFound):
        store.delete("a.txt")
    with pytest.raises(store.NotFound):
        store.update("a.txt", {"text": "a"})


def test_lists_only_txt_directly_inside(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    (data_dir / "notes.md").write_text("x")
    (data_dir / "sub").mkdir()
    (data_dir / "sub" / "b.txt").write_text("b\nrecurring mo")
    assert [i["file"] for i in store.list_page()["items"]] == ["a.txt"]


def test_pages_filters_and_flags(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 2)
    for k in "abcde":
        store.create({"file": f"{k}.txt", "text": f"note {k}\n" + ("appointment 26-02-30" if k == "d" else "")})
    pages = [store.list_page(page=p) for p in range(3)]
    assert [len(p["items"]) for p in pages] == [2, 2, 1]
    assert sorted(i["file"] for p in pages for i in p["items"]) == ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]
    assert (pages[0]["total"], pages[0]["flagged"]) == (5, 1)
    assert [i["file"] for i in store.list_page("NOTE C")["items"]] == ["c.txt"]
    assert [i["file"] for i in store.list_page(attention=True)["items"]] == ["d.txt"]
    store.update("d.txt", {"text": "note d\nappointment 26-02-28"})
    assert store.list_page(attention=True)["total"] == 0
    store.delete("e.txt")
    assert store.list_page()["total"] == 4


def test_order_is_shuffled_by_seed(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 100)
    for k in range(20):
        store.create({"file": f"{k:02}.txt", "text": f"note {k}"})
    order = lambda seed: [i["file"] for i in store.list_page(seed=seed)["items"]]
    assert order(1) == order(1)
    assert order(1) != order(2)
    assert order(1) != sorted(order(1))


def test_focus_returns_its_page(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 2)
    for k in "abcde":
        store.create({"file": f"{k}.txt", "text": f"note {k}"})
    for k in "abcde":
        res = store.list_page(seed=7, focus=f"{k}.txt")
        assert res["focused"]
        assert f"{k}.txt" in [i["file"] for i in res["items"]]
        assert res["page"] == next(p for p in range(3) if res["items"] == store.list_page(seed=7, page=p)["items"])
    assert not store.list_page("note a", focus="b.txt")["focused"]
    assert not store.list_page(focus="x.txt")["focused"]


def test_refs_carry_target_headings(data_dir):
    store.create({"file": "a.txt", "text": "Alpha\n-> see @b\n-> gone @x"})
    store.create({"file": "b.txt", "text": "Beta heading\nbody"})
    item = next(i for i in store.list_page()["items"] if i["file"] == "a.txt")
    assert item["refs"] == {"b": "Beta heading", "x": None}


def test_get(data_dir):
    store.create({"file": "a.txt", "text": "a"})
    assert store.get("a.txt")["text"] == "a\n"
    with pytest.raises(store.NotFound):
        store.get("b.txt")


def test_unchanged_write_keeps_mtime(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    os.utime(data_dir / "a.txt", ns=(0, 0))
    store.update("a.txt", {"text": "a\nrecurring mo"})
    assert (data_dir / "a.txt").stat().st_mtime_ns == 0
    store.update("a.txt", {"text": "a\nrecurring tu"})
    assert (data_dir / "a.txt").stat().st_mtime_ns != 0


@pytest.mark.parametrize("body", [
    {"file": "../x.txt", "text": "x"}, {"file": ".h.txt", "text": "x"}, {"file": "a/b.txt", "text": "x"},
    {"text": "  \n"}, {},
])
def test_invalid(body):
    with pytest.raises(store.ValidationError):
        store.create(body)
