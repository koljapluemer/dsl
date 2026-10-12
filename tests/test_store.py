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
    first = store.list_page()
    assert [i["file"] for i in first["items"]] == ["a.txt", "b.txt"]
    assert (first["total"], first["flagged"]) == (5, 1)
    assert [i["file"] for i in store.list_page(page=2)["items"]] == ["e.txt"]
    assert [i["file"] for i in store.list_page("NOTE C")["items"]] == ["c.txt"]
    assert [i["file"] for i in store.list_page(attention=True)["items"]] == ["d.txt"]
    store.update("d.txt", {"text": "note d\nappointment 26-02-28"})
    assert store.list_page(attention=True)["total"] == 0
    store.delete("e.txt")
    assert store.list_page()["total"] == 4


def test_get(data_dir):
    store.create({"file": "a.txt", "text": "a"})
    assert store.get("a.txt")["text"] == "a\n"
    with pytest.raises(store.NotFound):
        store.get("b.txt")


def test_recent_ignores_unchanged_writes(data_dir):
    for i, k in enumerate("abcd"):
        store.create({"file": f"{k}.txt", "text": f"{k}\nrecurring mo"})
        os.utime(data_dir / f"{k}.txt", ns=(i * 10**9, i * 10**9))
    assert store.list_page()["recent"] == ["d.txt", "c.txt", "b.txt"]
    store.update("a.txt", {"text": "a\nrecurring mo"})
    assert store.list_page()["recent"] == ["d.txt", "c.txt", "b.txt"]
    store.update("a.txt", {"text": "a\nrecurring tu"})
    assert store.list_page()["recent"][0] == "a.txt"


@pytest.mark.parametrize("body", [
    {"file": "../x.txt", "text": "x"}, {"file": ".h.txt", "text": "x"}, {"file": "a/b.txt", "text": "x"},
    {"text": "  \n"}, {},
])
def test_invalid(body):
    with pytest.raises(store.ValidationError):
        store.create(body)
