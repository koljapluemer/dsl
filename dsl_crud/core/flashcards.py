"""Flashcards in a note's body and `extra` block (see docs/flashcards.md):
`::front::back` on one line, or a block of lines

    ::
    front
    ---
    back
    ::

Lines in a closed fence are never part of the syntax. Mirrors
frontend/src/entities/item/dsl/flashcards.ts."""

import hashlib
import re
from dataclasses import dataclass

from dsl_crud.core import dsl

# the Markdown parts cards are found in: the body (None) and these text blocks
SECTIONS = (None, "extra")
_DELIMITER = re.compile(r"^::[ \t]*$")
_SEPARATOR = re.compile(r"^---[ \t]*$")


@dataclass(frozen=True)
class Card:
    # "body" or the text block's keyword
    section: str
    # the 0-based line it starts on, and its last line
    line: int
    end: int
    front: str
    back: str

    @property
    def id(self) -> str:
        return card_id(self.front)


def card_id(front: str) -> str:
    """What identifies a card in its note: its front, trailing whitespace and blank ends aside."""
    normalized = "\n".join(l.rstrip() for l in front.split("\n")).strip()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def _text(lines: list[str]) -> str | None:
    """The lines without blank ends, joined; None when all are blank."""
    kept = [l.rstrip() for l in lines]
    while kept and not kept[0].strip():
        kept.pop(0)
    while kept and not kept[-1].strip():
        kept.pop()
    return "\n".join(kept) if kept else None


def card_at(lines: list[str], i: int, stop: int) -> tuple[str, str, int] | None:
    """`(front, back, last line)` of the card starting at lines[i], within lines[:stop]; None when none does."""
    line = lines[i]
    if _DELIMITER.match(line):
        separator, j = None, i + 1
        while j < stop:
            end = dsl.fence_end(lines, j)
            if end is not None and end < stop:
                j = end + 1
                continue
            if separator is None and _SEPARATOR.match(lines[j]):
                separator = j
            elif _DELIMITER.match(lines[j]):
                if separator is None:
                    return None
                front, back = _text(lines[i + 1 : separator]), _text(lines[separator + 1 : j])
                return (front, back, j) if front and back else None
            j += 1
        return None
    if line.startswith("::") and (k := line.find("::", 2)) >= 0:
        front, back = line[2:k].strip(), line[k + 2 :].strip()
        return (front, back, i) if front and back else None
    return None


def cards_in(lines: list[str], start: int, stop: int, section: str = "body") -> list[Card]:
    """The cards in lines[start:stop], outside closed fences, in order."""
    out, i = [], start
    while i < stop:
        end = dsl.fence_end(lines, i)
        if end is not None and end < stop:
            i = end + 1
            continue
        if found := card_at(lines, i, stop):
            front, back, last = found
            out.append(Card(section, i, last, front, back))
            i = last + 1
            continue
        i += 1
    return out


def cards(schema: dict, text: str) -> list[Card]:
    """Every card in the item's body and `extra` block, in order; cards with the same front included."""
    if "::" not in text:
        return []
    lines = [l.replace("\r", "") for l in text.split("\n")]
    return [card for keyword, start, stop in dsl.text_spans(schema, text) if keyword in SECTIONS
            for card in cards_in(lines, start, stop, keyword or "body")]
