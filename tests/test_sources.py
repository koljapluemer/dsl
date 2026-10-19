import os

import pytest

import sources
import store
from fields import ValidationError, join_name, split_name


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def test_roundtrip_and_stripping(data_dir):
    created = sources.create({
        "key": "a", "title": "T", "volume": "3", "date": "2017-06-12", "number": "7",
        "author": ["Doe, J", " van  Beethoven, Ludwig ", "", "World Health Organization"],
        "location": ["Berlin", ""],
        "extra": "  free: text\nmedia x.png\n",
    })
    assert (data_dir / created["file"]).read_text() == (
        "T\n\nsource\n"
        "data\n"
        "key: a\n"
        "entrytype: misc\n"
        "author:\n- Doe, J\n- van Beethoven, Ludwig\n- World Health Organization\n"
        "date: 2017-06-12\n"
        "number: '7'\n"
        "volume: 3\n"
        "location: [Berlin]\n"
        "extra\n"
        "free: text\n"
        " media x.png\n"
    )
    [src] = sources.list_sources()
    assert src == created == {
        "file": created["file"], "key": "a", "entrytype": "misc", "title": "T",
        "author": ["Doe, J", "van Beethoven, Ludwig", "World Health Organization"], "date": "2017-06-12",
        "number": "7", "volume": 3, "location": ["Berlin"], "extra": "free: text\n media x.png",
    }


def test_title_falls_back_to_key_and_key_to_title(data_dir):
    assert sources.create({"key": "a"})["title"] == "a"
    assert sources.create({"key": "", "title": "Attention Is All You Need"})["key"] == "attention-is-all-you-need"


def test_rewrite_keeps_foreign_lines(data_dir):
    (data_dir / "a.txt").write_text(
        "Old\nsecond body line\n\nsource\n-> see @other-123456\ntasks fix\n"
        "data\nentrytype: book\nwhatever: 1\nextra\nnotes\n"
    )
    sources.update("a.txt", {"key": "a", "entrytype": "book", "title": "New", "extra": "notes"})
    assert (data_dir / "a.txt").read_text() == (
        "New\nsecond body line\n\nsource\n-> see @other-123456\ntasks fix\n"
        "data\nkey: a\nentrytype: book\nwhatever: 1\nextra\nnotes\n"
    )


def test_tags_line_after_data_survives_a_save(data_dir):
    (data_dir / "a.txt").write_text("Old\nsource\ndata\nentrytype: book\ntags read-later 2026\n")
    assert sources.list_sources()[0]["entrytype"] == "book"
    sources.update("a.txt", {"key": "a", "entrytype": "book", "title": "New"})
    assert (data_dir / "a.txt").read_text() == "New\n\nsource\ndata\nkey: a\nentrytype: book\ntags read-later 2026\n"


def test_key_defaults_to_file_stem(data_dir):
    (data_dir / "vaswani2017.txt").write_text("T\nsource\ndata\nentrytype: article\n")
    assert sources.list_sources()[0]["key"] == "vaswani2017"


def test_old_name_mappings_are_read_as_strings(data_dir):
    (data_dir / "a.txt").write_text(
        "T\nsource\ndata\nentrytype: misc\nauthor:\n- {family: Doe, given: Jane, suffix: Jr.}\n"
        "- {family: Beethoven, given: Ludwig, prefix: van}\n- {family: WHO}\n"
    )
    assert sources.list_sources()[0]["author"] == ["Doe, Jr., Jane", "van Beethoven, Ludwig", "WHO"]


def test_notes_are_not_sources(data_dir):
    (data_dir / "n.txt").write_text("Just a note\nrecurring mo\n")
    a = sources.create({"key": "a"})
    assert [s["key"] for s in sources.list_sources()] == ["a"]
    assert sources.listing()["recent"] == [a["file"]]


def test_key_change_keeps_file_and_conflicts(data_dir):
    a = sources.create({"key": "a"})
    sources.create({"key": "b"})
    with pytest.raises(store.Conflict):
        sources.create({"key": "b"})
    with pytest.raises(store.Conflict):
        sources.update(a["file"], {"key": "b"})
    assert sources.update(a["file"], {"key": "c"})["file"] == a["file"]
    assert sorted(s["key"] for s in sources.list_sources()) == ["b", "c"]
    with pytest.raises(store.NotFound):
        sources.update("nope.txt", {"key": "d"})


def test_import_renames_taken_keys(data_dir):
    sources.create({"key": "x"})
    created = sources.import_bibtex([{"key": "x", "entrytype": "misc"}, {"key": "x", "entrytype": "misc"}])
    assert [s["key"] for s in created] == ["x-2", "x-3"]


def test_backlink_counts(data_dir):
    a = sources.create({"key": "a"})["file"]
    b = sources.create({"key": "b"})["file"]
    store.create({"text": f"N\n-> cites @{a[:-4]}\n-> @{a[:-4]}\n"})
    counts = {s["file"]: s["backlinks"] for s in sources.listing()["sources"]}
    assert counts == {a: 2, b: 0}


def test_recent(data_dir):
    files = []
    for i, k in enumerate("abcd"):
        files.append(sources.create({"key": k})["file"])
        os.utime(data_dir / files[-1], ns=(i * 10**9, i * 10**9))
    a, b, c, d = files
    assert sources.listing()["recent"] == [d, c, b]
    sources.update(a, {"key": "a"})  # unchanged content: no rewrite
    assert sources.listing()["recent"] == [d, c, b]
    sources.update(a, {"key": "a", "title": "T"})
    assert sources.listing()["recent"] == [a, d, c]


@pytest.mark.parametrize("name, parts", [
    ("Doe, Jane", {"family": "Doe", "given": "Jane"}),
    ("van der Berg, Jan", {"prefix": "van der", "family": "Berg", "given": "Jan"}),
    ("Doe, Jr., Jane", {"family": "Doe", "suffix": "Jr.", "given": "Jane"}),
    ("de, Jane", {"family": "de", "given": "Jane"}),
    ("World Health Organization", {"literal": "World Health Organization"}),
])
def test_names(name, parts):
    assert split_name(name) == parts
    if "literal" not in parts:
        assert join_name(parts) == name


@pytest.mark.parametrize("bad", [
    {"key": "a b"}, {"key": "a", "entrytype": "nope"},
    {"key": "a", "volume": "x"}, {"key": "a", "date": "yesterday"},
    {"key": "a", "bogus": "1"}, {"key": "a", "extra": 1},
    {"key": "a", "author": ["Doe,"]}, {"key": "a", "author": ["a, b, c, d"]}, {"key": "a", "author": [{"family": "x"}]},
])
def test_invalid(bad):
    with pytest.raises(ValidationError):
        sources.create(bad)
