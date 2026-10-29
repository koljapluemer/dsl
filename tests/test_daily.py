import pytest

from dsl_crud.features.daily import service as daily
from dsl_crud.features.graph import service as graph
from dsl_crud.infrastructure import config, items as store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def test_ensure_is_idempotent_per_date(data_dir):
    first = daily.ensure("26-10-28")
    assert daily.ensure("26-10-28") == first
    assert first["text"] == "Daily 26-10-28\n\ndaily 26-10-28\n"
    other = daily.ensure("26-10-29")
    assert other["file"] != first["file"]
    assert len(list(data_dir.glob("*.txt"))) == 2


def test_ensure_finds_an_existing_note(data_dir):
    store.create({"file": "mine.txt", "text": "Tuesday\nrain\n\ndaily 26-10-28"})
    assert daily.ensure("26-10-28")["file"] == "mine.txt"


@pytest.mark.parametrize("date", ["26-02-30", "2026-10-28", "today"])
def test_invalid_date(date):
    with pytest.raises(store.ValidationError, match="invalid date"):
        daily.ensure(date)


def test_several_notes_for_a_date_are_an_error():
    store.create({"file": "a.txt", "text": "A\ndaily 26-10-28"})
    store.create({"file": "b.txt", "text": "B\ndaily 26-10-28"})
    with pytest.raises(store.ValidationError, match="a.txt, b.txt"):
        daily.ensure("26-10-28")


def test_hidden_from_queue_float_and_graph():
    name = daily.ensure("26-10-28")["file"]
    store.create({"file": "plain.txt", "text": "plain"})
    assert [i["file"] for i in store.queue_draw()["items"]] == ["plain.txt"]
    assert [i["file"] for i in store.float_draw()["items"]] == ["plain.txt"]
    assert graph.random_note([]) == "plain.txt"
    assert graph.build([{"filename": name, "depth": 1}])["nodes"] == []
    assert [n["filename"] for n in graph.build([{"filename": "plain.txt", "depth": 1}])["nodes"]] == ["plain.txt"]
