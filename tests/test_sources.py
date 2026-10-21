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
    assert [s["file"] for s in sources.listing()] == [a["file"]]


def test_resolve_renames_taken_keys_and_keeps_existing(data_dir):
    x = sources.create({"key": "x"})
    resolved = sources.resolve([{"source": {"key": "x", "entrytype": "misc"}}, {"file": x["file"]}, {"source": {"key": "x"}}])
    assert [s["key"] for s in resolved] == ["x-2", "x", "x-3"]
    assert resolved[1] == x
    with pytest.raises(store.NotFound):
        sources.resolve([{"source": {"key": "y"}}, {"file": "nope.txt"}])
    assert len(sources.list_sources()) == 3  # nothing created when an entry fails
    with pytest.raises(ValidationError):
        sources.resolve("x")


def test_match(data_dir):
    s = sources.create({"key": "geb", "title": "Gödel, Escher, Bach: An Eternal Golden Braid", "author": ["Hofstadter, Douglas"]})
    [m] = sources.match([{"key": "h79", "title": "Godel, Escher, Bach", "author": ["Hofstadter, D."]}])
    assert m["source"]["key"] == "h79"
    assert [(c["file"], c["level"]) for c in m["candidates"]] == [(s["file"], "likely")]


def test_link(data_dir):
    text = sources.link("N\n-> source @a\n", ["a.txt", "b.txt", "b.txt"], "source")
    assert text == "N\n-> source @a\n-> source @b\n"
    assert sources.link("N", ["a.txt"], "") == "N\n-> @a\n"


def test_endpoints(data_dir):
    import app
    client = app.app.test_client()
    bib = "@book{h, title={Gödel, Escher, Bach}, author={Hofstadter, Douglas}, year=1979, isbn={0-465-02656-7}}"
    [m] = client.post("/api/sources/match", json={"text": bib}).get_json()
    assert m["candidates"] == []
    r = client.post("/api/sources/resolve", json={"entries": [{"source": m["source"]}], "text": "N\n", "label": "source"})
    assert r.status_code == 201
    [created] = r.get_json()["sources"]
    assert r.get_json()["text"] == f"N\n-> source @{created['file'][:-4]}\n"
    [m] = client.post("/api/sources/match", json={"text": bib.replace("{h,", "{other,")}).get_json()
    assert [(c["file"], c["level"]) for c in m["candidates"]] == [(created["file"], "same")]
    assert client.post("/api/sources/match", json={"text": "nothing"}).status_code == 400


def test_key_conflicts(data_dir):
    sources.create({"key": "b"})
    with pytest.raises(store.Conflict):
        sources.create({"key": "b"})


def test_listing_items_with_fields_last_edited_first(data_dir):
    files = []
    for i, k in enumerate("abc"):
        files.append(sources.create({"key": k})["file"])
        os.utime(data_dir / files[-1], ns=(i * 10**9, i * 10**9))
    store.create({"text": "a note"})
    listed = sources.listing()
    assert [s["file"] for s in listed] == files[::-1]
    assert (listed[0]["fields"]["key"], listed[0]["sourceKey"], listed[0]["text"]) == ("c", "c", "c\n\nsource\ndata\nkey: c\nentrytype: misc\n")


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
