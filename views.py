"""What the queue, float, tags, suggest, explorations, calendar and projects views read from an item."""

import calendar as _calendar
from dataclasses import dataclass
from pathlib import PurePosixPath

import yaml

import dsl

APPOINTMENT_KEYWORD = "appointment"
RECURRING_KEYWORD = "recurring"
TAGS_KEYWORD = "tags"
MEDIA_KEYWORD = "media"
PROJECT_KEYWORD = "project"
ISSUE_KEYWORD = "issue"
SOURCE_KEYWORD = "source"
# an issue belongs to the projects its relationships with this label point to
PROJECT_RELATION = "project"
# an issue to think about (and sketch) rather than build; projects lists these first
THINK_TAG = "suggest-think-and-sketch"
# the tags suggest offers
SUGGEST_PREFIX = "suggest-"
# a note worked on in the explorations tab, left out of the queue and the graph
EXPLORATION_TAG = "exploration"


@dataclass(frozen=True)
class Hiding:
    """Which notes a view leaves out: those whose type is one of `types`, or
    tagged `tag` (what the view's hide button adds) or one of `tags`. See
    docs/hiding.md."""
    tag: str
    types: frozenset[str] = frozenset()
    tags: frozenset[str] = frozenset()

    def hides(self, primary: str | None, tags: frozenset[str]) -> bool:
        return primary in self.types or self.tag in tags or bool(tags & self.tags)


# What each view hides - edit here.
QUEUE_HIDING = Hiding("no-q", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD, SOURCE_KEYWORD}), frozenset({EXPLORATION_TAG}))
FLOAT_HIDING = Hiding("no-float", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD, SOURCE_KEYWORD}))
GRAPH_HIDING = Hiding("no-graph", frozenset({APPOINTMENT_KEYWORD, RECURRING_KEYWORD}), frozenset({EXPLORATION_TAG}))

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


def source_key(schema: dict, doc: dsl.Document, file: str) -> str | None:
    """A `source` item's BibTeX key: its `data` block's `key`, else the file
    name without .txt (see sources.py); None for any other item."""
    if primary(schema, doc) != SOURCE_KEYWORD:
        return None
    try:
        data = dsl.load_yaml("\n".join(doc.blocks["data"])) if "data" in doc.blocks else None
    except yaml.YAMLError:
        data = None
    key = data.get("key") if isinstance(data, dict) else None
    return str(key) if key not in (None, "") else file.removesuffix(".txt")
