"""What the queue, float, zero, suggest, calendar and projects views read from an item."""

import calendar as _calendar
from dataclasses import dataclass
from pathlib import PurePosixPath

import dsl

APPOINTMENT_KEYWORD = "appointment"
RECURRING_KEYWORD = "recurring"
TAGS_KEYWORD = "tags"
MEDIA_KEYWORD = "media"
PROJECT_KEYWORD = "project"
ISSUE_KEYWORD = "issue"
# an issue belongs to the projects its relationships with this label point to
PROJECT_RELATION = "project"
ZERO_TAG = "zero"
# the tags suggest offers
SUGGEST_PREFIX = "suggest-"


@dataclass(frozen=True)
class Hiding:
    """Which notes a view leaves out: those whose type is one of `types`, or
    tagged `tag` (what the view's hide button adds), one of `tags` or one
    starting with one of `tag_prefixes`. See docs/hiding.md."""
    tag: str
    types: frozenset[str] = frozenset()
    tags: frozenset[str] = frozenset()
    tag_prefixes: tuple[str, ...] = ()

    def hides(self, primary: str | None, tags: frozenset[str]) -> bool:
        return (primary in self.types or self.tag in tags or bool(tags & self.tags)
                or any(t.startswith(self.tag_prefixes) for t in tags))


# What each view hides - edit here. Suggest's notes are left out of all three.
QUEUE_HIDING = Hiding("no-q", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD, "source"}),
                      tag_prefixes=(SUGGEST_PREFIX,))
FLOAT_HIDING = Hiding("no-float", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD, "source"}),
                      tag_prefixes=(SUGGEST_PREFIX,))
GRAPH_HIDING = Hiding("no-graph", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD}),
                      tag_prefixes=(SUGGEST_PREFIX,))

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

def _clause(doc: dsl.Document, keyword: str) -> dsl.Clause | None:
    return next((c for c in doc.clauses if c.keyword == keyword), None)


def primary(schema: dict, doc: dsl.Document) -> str | None:
    """The item's type: its first primary keyword, or None for a plain note."""
    return next((c.keyword for c in doc.clauses if schema["keywords"][c.keyword]["role"] == "primary"), None)


def tags(doc: dsl.Document) -> list[str]:
    c = _clause(doc, TAGS_KEYWORD)
    return list(c.args) if c else []


def media(doc: dsl.Document) -> str | None:
    """The attachment's path in the data folder, when it's an image or video."""
    c = _clause(doc, MEDIA_KEYWORD)
    if not c or not c.args or PurePosixPath(c.args[0]).suffix.lower() not in MEDIA_EXTENSIONS:
        return None
    return c.args[0]


def _iso_date(value: str) -> str:
    """`yy-mm-dd` as `YYYY-MM-DD`; a month `yy-mm` as its last day."""
    parts = [int(p) for p in value.split("-")]
    if len(parts) == 2:
        parts.append(_calendar.monthrange(2000 + parts[0], parts[1])[1])
    return f"{2000 + parts[0]:04d}-{parts[1]:02d}-{parts[2]:02d}"


def when(doc: dsl.Document) -> dict | None:
    """When a valid item falls in the calendar: `{appointment: date}`, or
    `{recurring: weekday (1 = Mon .. 7 = Sun), until: date | None}`; None
    for an invalid item or one without either keyword."""
    if not doc.valid:
        return None
    if (c := _clause(doc, APPOINTMENT_KEYWORD)) and c.args:
        return {"appointment": _iso_date(c.args[0])}
    if (c := _clause(doc, RECURRING_KEYWORD)) and c.args and c.args[0] in dsl.WEEKDAYS:
        until = c.options.get("until")
        return {"recurring": dsl.WEEKDAYS.index(c.args[0]) + 1, "until": _iso_date(until) if until else None}
    return None


def view(item: dict, doc: dsl.Document) -> dict:
    """The item with what the views show of it: heading, body, extra and media."""
    return item | {
        "heading": doc.heading,
        "body": "\n".join(doc.body),
        "extra": "\n".join(doc.extra) if doc.extra else None,
        "media": media(doc),
    }
