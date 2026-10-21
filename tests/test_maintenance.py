import datetime

import pytest

import attachments
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
    own = attachments.attach("past.txt", b"a", "image/png")["media"]
    shared = attachments.attach("shared.txt", b"b", "image/png")["media"]
    note("other", f"Other\nmedia {shared}")

    assert [i["file"] for i in maintenance.past_appointments()] == ["past.txt", "shared.txt"]
    assert maintenance.delete_past_appointments() == 2
    assert sorted(p.name for p in data_dir.glob("*.txt")) == [
        "broken.txt", "future.txt", "month.txt", "other.txt", "weekly.txt"]
    assert not (data_dir / own).exists() and (data_dir / shared).exists()
    assert maintenance.past_appointments() == []


def test_orphaned_media(data_dir):
    images = data_dir / "images"
    images.mkdir()
    for f in ["orphan.png", "used.jpg", "named.mp4", "notes.txt"]:
        (images / f).write_bytes(b"x")
    (data_dir / "outside.png").write_bytes(b"x")
    note("a", "A\nmedia images/used.jpg")
    note("b", "B, see images/named.mp4")

    assert maintenance.orphaned_media() == ["images/orphan.png"]
    assert maintenance.delete_orphaned_media() == 1
    assert sorted(p.name for p in images.iterdir()) == ["named.mp4", "notes.txt", "used.jpg"]
    assert (data_dir / "outside.png").exists()
    assert maintenance.orphaned_media() == []


def test_orphaned_media_without_images_folder():
    assert maintenance.orphaned_media() == []
