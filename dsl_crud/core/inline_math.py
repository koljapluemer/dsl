"""TeX math in Markdown, as Pandoc's ``tex_math_dollars``: ``$…$`` inline, on
one line, its content neither starting nor ending with whitespace and the
closing ``$`` not followed by a digit (so ``$20 and $30`` stays text);
``$$…$$`` display, across lines but not across a blank one. A backslash
escapes the next character, in math too. Mirrors frontend/src/dumb/math.ts.
"""

from dataclasses import dataclass
import re

_BLANK_LINE = re.compile(r"\n[ \t]*(\n|$)")


@dataclass(frozen=True)
class MathSpan:
    start: int
    end: int
    tex: str
    display: bool


def math_at(src: str, i: int) -> MathSpan | None:
    """The math opening with the ``$`` at ``i``, or None; whether that ``$`` is escaped is the caller's business."""
    if not src.startswith("$", i):
        return None
    if src.startswith("$$", i):
        j = i + 2
        while j < len(src):
            if src[j] == "\\":
                j += 1
            elif src[j] == "\n" and _BLANK_LINE.match(src, j):
                return None
            elif src.startswith("$$", j):
                tex = src[i + 2:j]
                return MathSpan(i, j + 2, tex, True) if tex.strip() else None
            j += 1
        return None
    if i + 1 >= len(src) or src[i + 1].isspace():
        return None
    j = i + 1
    while j < len(src):
        if src[j] == "\\":
            j += 1
        elif src[j] == "\n":
            return None
        elif src[j] == "$":
            if src[j - 1].isspace() or (j + 1 < len(src) and src[j + 1].isdigit()):
                return None
            return MathSpan(i, j + 1, src[i + 1:j], False)
        j += 1
    return None
