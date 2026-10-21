"""Inline note references in Markdown body and ``extra`` text.

The syntax is ``[[target]]`` or ``[[target|display text]]``. References inside
backtick code spans or fenced code blocks are ignored. This is deliberately a
small Markdown extension rather than a second Markdown parser.
"""

from dataclasses import dataclass
import re


_TARGET = re.compile(r"^[^\s|\[\]/\\]+$")
_FENCE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")


@dataclass(frozen=True)
class InlineReference:
    target: str
    label: str | None = None


def references(text: str) -> list[InlineReference]:
    """References in ``text``, excluding Markdown code spans and fences."""
    out: list[InlineReference] = []
    fence: tuple[str, int] | None = None
    for line in text.splitlines():
        marker = _FENCE.match(line)
        if fence:
            if marker and marker.group(1)[0] == fence[0] and len(marker.group(1)) >= fence[1]:
                fence = None
            continue
        if marker:
            fence = (marker.group(1)[0], len(marker.group(1)))
            continue
        out.extend(_line_references(line))
    return out


def _line_references(line: str) -> list[InlineReference]:
    out: list[InlineReference] = []
    i = 0
    code_ticks = 0
    while i < len(line):
        if line[i] == "`":
            end = i
            while end < len(line) and line[end] == "`":
                end += 1
            run = end - i
            if not code_ticks:
                code_ticks = run
            elif run == code_ticks:
                code_ticks = 0
            i = end
            continue
        if not code_ticks and line.startswith("[[", i) and not _escaped(line, i):
            end = line.find("]]", i + 2)
            if end >= 0:
                raw = line[i + 2:end]
                target, separator, label = raw.partition("|")
                if _TARGET.fullmatch(target) and (not separator or bool(label)):
                    out.append(InlineReference(target, label if separator else None))
                    i = end + 2
                    continue
        i += 1
    return out


def _escaped(text: str, at: int) -> bool:
    slashes = 0
    at -= 1
    while at >= 0 and text[at] == "\\":
        slashes += 1
        at -= 1
    return slashes % 2 == 1
