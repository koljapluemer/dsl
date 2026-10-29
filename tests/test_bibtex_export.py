import pytest

from dsl_crud.features.sources import bibtex_export, bibtex_import
from dsl_crud.features.sources import service as sources
from dsl_crud.infrastructure import config, exports, items as store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


SOURCE = {
    "key": "doe2020", "entrytype": "article", "title": "R&D at 50% — Müller",
    "author": [
        "Doe, Jr., Jane",
        "van Beethoven, Ludwig",
        "World Health Organization",
    ],
    "journaltitle": "Nature", "volume": 3, "date": "2020-05",
    "location": ["Berlin", "Rock and Roll"], "url": "https://x.org/a_b",
    "extra": "entrytype: weird\ncustom: v",
}


def test_render_roundtrip():
    text = bibtex_export.render([SOURCE])
    assert text.startswith(bibtex_export.HEADER)
    assert "url = {https://x.org/a_b}" in text
    assert "author = {Doe, Jr., Jane and van Beethoven, Ludwig and {World Health Organization}}" in text
    assert "location = {Berlin and {Rock and Roll}}" in text
    assert "custom" not in text and "weird" not in text
    [back] = bibtex_import.parse(text)
    expected = {k: v for k, v in SOURCE.items() if k not in ("extra", "location")}
    assert {k: v for k, v in back.items() if k not in ("extra", "location")} == expected
    assert "extra" not in back


def test_sync(tmp_path):
    created = sources.create(SOURCE)
    out = tmp_path / "out"
    out.mkdir()
    foreign = tmp_path / "mine.bib"
    foreign.write_text("@misc{a}\n")
    paths = exports.set_paths("bibtex", [str(out), "", str(foreign), "rel.bib", str(tmp_path / "x.txt"), str(out)])
    assert paths == [str(out / "sources.bib"), str(foreign), "rel.bib", str(tmp_path / "x.txt")]

    exports.sync("bibtex")
    assert exports.status["bibtex"][paths[0]] is None
    assert "not generated" in exports.status["bibtex"][paths[1]]
    assert "absolute" in exports.status["bibtex"][paths[2]]
    assert ".bib" in exports.status["bibtex"][paths[3]]
    assert foreign.read_text() == "@misc{a}\n"

    target = out / "sources.bib"
    mtime = target.stat().st_mtime_ns
    exports.sync("bibtex")
    assert target.stat().st_mtime_ns == mtime  # unchanged: not rewritten
    store.delete(created["file"])
    exports.sync("bibtex")
    assert "doe2020" not in target.read_text()


def test_render_for_typst_keeps_unicode():
    text = bibtex_export.render([SOURCE], latex=False)
    assert "Müller" in text and "—" in text
    assert "Müller" not in bibtex_export.render([SOURCE])
    assert "author = {Doe, Jr., Jane and van Beethoven, Ludwig and {World Health Organization}}" in text
