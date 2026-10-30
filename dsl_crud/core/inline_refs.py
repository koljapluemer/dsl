"""Inline note references in Markdown body and ``extra`` text.

The syntax is ``[[target]]`` or ``[[target|display text]]``; ``![[path]]`` or
``![[path|alt]]`` embeds an attached file instead (``embed``). References inside
backtick code spans, fenced code blocks or math (``inline_math``) are ignored;
whichever opens first holds what follows, so a ``[[`` in math is TeX and a
reference's label is never math. This is deliberately a small Markdown
extension rather than a second Markdown parser. Mirrors
frontend/src/dumb/inlineReference.ts.
"""

from dataclasses import dataclass
import re
from typing import Callable

from dsl_crud.core.inline_math import math_at


_TARGET = re.compile(r"^[^\s|\[\]/\\]+$")
_EMBED_TARGET = re.compile(r"^[^|\[\]]+$")
_FENCE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")


@dataclass(frozen=True)
class InlineReference:
    target: str
    label: str | None = None
    # `![[…]]`: the target is a file path, never a relationship
    embed: bool = False


def references(text: str) -> list[InlineReference]:
    """References in ``text``, excluding Markdown code spans, fences and math."""
    return [ref for _, _, ref in spans(text) if not ref.embed]


def embeds(text: str) -> list[InlineReference]:
    """Embeds in ``text``, by the same rules as references."""
    return [ref for _, _, ref in spans(text) if ref.embed]


def substitute(text: str, replace: Callable[[InlineReference], str], embeds: bool = False) -> str:
    """``text`` with each reference (and embed, with ``embeds``) replaced by ``replace``'s text for it."""
    for start, end, ref in reversed(spans(text)):
        if ref.embed and not embeds:
            continue
        text = text[:start] + replace(ref) + text[end:]
    return text


def spans(text: str) -> list[tuple[int, int, InlineReference]]:
    """References and embeds in ``text`` with their start and end offsets."""
    out: list[tuple[int, int, InlineReference]] = []
    fence: tuple[str, int] | None = None
    offset = 0
    # where display math that ran past its line ends
    resume = 0
    for line in text.split("\n"):
        end = offset + len(line)
        marker = _FENCE.match(line)
        if resume > offset:
            if resume <= end:
                resume = _scan_line(text, resume, end, out)
        elif fence:
            if marker and marker.group(1)[0] == fence[0] and len(marker.group(1)) >= fence[1]:
                fence = None
        elif marker:
            fence = (marker.group(1)[0], len(marker.group(1)))
        else:
            resume = _scan_line(text, offset, end, out)
        offset = end + 1
    return out


def _scan_line(text: str, i: int, end: int, out: list[tuple[int, int, InlineReference]]) -> int:
    """Scans ``text`` from ``i`` to the line's ``end``; where it stopped, past ``end`` when math runs on."""
    code_ticks = 0
    while i < end:
        if text[i] == "`":
            stop = i
            while stop < len(text) and text[stop] == "`":
                stop += 1
            run = stop - i
            if not code_ticks:
                code_ticks = run
            elif run == code_ticks:
                code_ticks = 0
            i = stop
            continue
        if not code_ticks and text[i] == "\\":
            i += 2
            continue
        if not code_ticks and text[i] == "$" and (math := math_at(text, i)):
            i = math.end
            continue
        embed = text.startswith("![[", i)
        if not code_ticks and (embed or text.startswith("[[", i)):
            open_ = i + 3 if embed else i + 2
            close = text.find("]]", open_)
            if 0 <= close and close + 2 <= end:
                target, separator, label = text[open_:close].partition("|")
                pattern = _EMBED_TARGET if embed else _TARGET
                if pattern.fullmatch(target) and (not separator or bool(label)):
                    out.append((i, close + 2, InlineReference(target, label if separator else None, embed)))
                    i = close + 2
                    continue
        i += 1
    return i
