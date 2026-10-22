import datetime

import pytest

import files
import maintenance
import store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def test_past_appointments_are_deleted_with_their_media(data_dir):
    this_month = datetime.date.today().strftime("%y-%m")
    note("past", "Past\nappointment 20-01-01")
    note("shared", "Shared\nappointment 20-02-01")
    note("future", "Future\nappointment 99-12-31")
    note("month", f"Month\nappointment {this_month}")
    note("weekly", "Weekly\nrecurring mo until 20-01-01")
    note("broken", "Broken\nappointment 20-02-30")
    own = files.attach("past.txt", b"a", "image/png")["media"]
    shared = files.attach("shared.txt", b"b", "image/png")["media"]
    note("other", f"Other\nmedia {shared}")

    assert [i["file"] for i in maintenance.past_appointments()] == ["past.txt", "shared.txt"]
    assert maintenance.delete_past_appointments() == 2
    assert sorted(p.name for p in data_dir.glob("*.txt")) == [
        "broken.txt", "future.txt", "month.txt", "other.txt", "weekly.txt"]
    assert not (data_dir / own).exists() and (data_dir / shared).exists()
    assert maintenance.past_appointments() == []
