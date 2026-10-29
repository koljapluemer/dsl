"""The daily page: one note per date, `daily <date>`. Which date is today (the
local date, a day starting at 04:00) is the frontend's call."""

import threading

from dsl_crud.core import documents as views
from dsl_crud.core import dsl
from dsl_crud.infrastructure import items as store

# a page's requests may overlap; only one of them creates the note
_lock = threading.Lock()


def _notes(date: str) -> list[str]:
    return sorted(n for n, e in store._INDEX.refresh().items() if e.primary == views.DAILY_KEYWORD and e.daily == date)


def ensure(date: str) -> dict:
    """The daily note for `date` (`yy-mm-dd`), created when missing; calling it again changes nothing."""
    if dsl.value_type(date, ["date"]) != "date":
        raise store.ValidationError(f"invalid date '{date}'")
    with _lock:
        names = _notes(date)
        if len(names) > 1:
            raise store.ValidationError(f"several daily notes for {date}: {', '.join(names)}")
        name = names[0] if names else store.create({"text": f"Daily {date}\n\n{views.DAILY_KEYWORD} {date}\n"})["file"]
        return store.get_payload(name)
