"""Cleanups offered in Settings: past appointments and media no item names."""

import datetime

import attachments
import store
import views


def _past(entries: dict) -> list[str]:
    today = datetime.date.today().isoformat()
    return [name for name, e in entries.items()
            if e.when and "appointment" in e.when and e.when["appointment"] < today]


def past_appointments() -> list[dict]:
    """`{file, heading, date}` of every valid appointment before today, by date."""
    entries = store._INDEX.refresh()
    out = [{"file": n, "heading": entries[n].heading, "date": entries[n].when["appointment"]} for n in _past(entries)]
    return sorted(out, key=lambda r: (r["date"], r["file"]))


def delete_past_appointments() -> int:
    """Deletes them, with their attachments unless another item names those."""
    entries = store._INDEX.refresh()
    names = _past(entries)
    for name in names:
        store.delete(name)
        if entries[name].media:
            attachments.release(name, entries[name].media)
    return len(names)


def orphaned_media() -> list[str]:
    """Media files in the app's `images/` folder that no item names, in its
    `media` clause or anywhere else in its text."""
    d = store._dir() / attachments.IMAGES_DIR
    if not d.is_dir():
        return []
    entries = store._INDEX.refresh()
    used = {e.media for e in entries.values() if e.media}
    out = []
    for path in d.iterdir():
        if not path.is_file() or path.suffix.lower() not in views.MEDIA_EXTENSIONS:
            continue
        rel = f"{attachments.IMAGES_DIR}/{path.name}"
        if rel not in used and not any(rel.lower() in e.lower for e in entries.values()):
            out.append(rel)
    return sorted(out)


def delete_orphaned_media() -> int:
    rels = orphaned_media()
    for rel in rels:
        (store._dir() / rel).unlink(missing_ok=True)
    return len(rels)
