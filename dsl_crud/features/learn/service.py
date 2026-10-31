"""Flashcards (core/flashcards) reviewed in the Learn view, scheduled by FSRS
(py-fsrs): a random due card, else a random one never reviewed. A card's
state is a JSON file in FLASHCARDS_DIR, named in a `media` clause of its note
from its first review on. See docs/flashcards.md."""

import json
import random
import re
import threading
from datetime import datetime, timezone

from fsrs import Card, Rating, Scheduler

from dsl_crud.core import file_kinds, flashcards
from dsl_crud.infrastructure import items, media

SCHEDULER = Scheduler()
RATINGS = {"again": Rating.Again, "hard": Rating.Hard, "good": Rating.Good, "easy": Rating.Easy}
_ID = re.compile(r"^[0-9a-f]{12}$")

# state file -> (its mtime_ns, its card's due time, its card's FSRS state), so a pick reads only changed files
_due_cache: dict[str, tuple[int, datetime, str]] = {}
_lock = threading.Lock()


def state_file(name: str, card_id: str) -> str:
    """Where the card's state is kept: `<FLASHCARDS_DIR>/<note>-<id>.json`."""
    return f"{file_kinds.FLASHCARDS_DIR}/{name.removesuffix('.txt')}-{card_id}.json"


def _load(rel: str) -> tuple[Card, list[dict]] | None:
    """The card in its state file and the logs of its reviews; None when there's no (readable) file."""
    try:
        data = json.loads(media.read(rel))
        return Card.from_dict(data["card"]), list(data.get("reviews") or [])
    except (items.NotFound, OSError, ValueError, KeyError, TypeError):
        return None


def _due(rel: str) -> tuple[datetime, str] | None:
    """When the card is due and its FSRS state's name; None for a card never reviewed."""
    try:
        mtime = media.path(rel).stat().st_mtime_ns
    except (items.NotFound, OSError):
        return None
    if (cached := _due_cache.get(rel)) and cached[0] == mtime:
        return cached[1], cached[2]
    if (loaded := _load(rel)) is None:
        return None
    card = loaded[0]
    _due_cache[rel] = (mtime, card.due, card.state.name.lower())
    return card.due, card.state.name.lower()


def next_card(now: datetime | None = None) -> dict:
    """A random due card, else a random new one, with its note;
    `card` and `item` are None when there's neither, `next_due` the earliest a card is due."""
    now = now or datetime.now(timezone.utc)
    entries = items._INDEX.refresh()
    due, new, later = [], [], []
    for name, entry in entries.items():
        for card_id in entry.flashcards:
            state = _due(state_file(name, card_id))
            if state is None:
                new.append((name, card_id))
            elif state[0] <= now:
                due.append((name, card_id))
            else:
                later.append(state[0])
    counts = {"due": len(due), "new": len(new), "total": len(due) + len(new) + len(later)}
    out = {"card": None, "item": None, "counts": counts,
           "next_due": min(later).isoformat() if later else None}
    if not (pool := due or new):
        return out
    name, card_id = random.choice(pool)
    item = items._note(name, entries)
    card = next(c for c in flashcards.cards(items.SCHEMA, item["text"]) if c.id == card_id)
    loaded = _load(state_file(name, card_id))
    return out | {
        "card": {"file": name, "id": card_id, "front": card.front, "back": card.back,
                 "state": loaded[0].state.name.lower() if loaded else "new"},
        "item": item,
    }


def review(name: str, card_id: str, rating: str, now: datetime | None = None) -> dict:
    """Rates the card, writes its state (naming the file in the note the first
    time), drops the note's state files of cards it no longer has, and returns
    the next card (see next_card)."""
    if rating not in RATINGS:
        raise items.ValidationError(f"unknown rating '{rating}'")
    now = now or datetime.now(timezone.utc)
    with _lock:
        item = items.get(name)
        fronts = {c.id: c.front for c in reversed(flashcards.cards(items.SCHEMA, item["text"]))}
        if card_id not in fronts:
            raise items.NotFound(f"{name}: no card {card_id}")
        rel = state_file(name, card_id)
        card, reviews = _load(rel) or (Card(due=now), [])
        card, log = SCHEDULER.review_card(card, RATINGS[rating], now)
        data = {"front": fronts[card_id], "card": card.to_dict(), "reviews": [*reviews, log.to_dict()]}
        media.write(rel, (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
        prefix = state_file(name, "").removesuffix(".json")
        for stale in [f for f in item["files"] if f.startswith(prefix) and f.endswith(".json")
                      and _ID.match(f[len(prefix):-5]) and f[len(prefix):-5] not in fronts]:
            media.remove(name, stale)
        if rel not in item["files"]:
            media.add(name, rel)
    return next_card(now)
