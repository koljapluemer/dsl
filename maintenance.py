"""Cleanups offered in Settings: past appointments here, files no item names in files.py."""

import datetime

import files
import store


def _past(entries: dict) -> list[str]:
    today = datetime.date.today().isoformat()
    return [name for name, e in entries.items()
            if e.when and "appointment" in e.when and e.when["appointment"] < today]


def past_appointments() -> list[dict]:
    """Every valid appointment before today (see store.payload), by date."""
    entries = store._INDEX.refresh()
    names = sorted(_past(entries), key=lambda n: (entries[n].when["appointment"], n))
    return [store._note(n, entries) for n in names]


def delete_past_appointments() -> int:
    """Deletes them, with their files unless another item names those."""
    entries = store._INDEX.refresh()
    names = _past(entries)
    for name in names:
        store.delete(name)
        for rel in entries[name].files:
            files.release(rel)
    return len(names)
