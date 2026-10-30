"""Markdown as HTML on the server (PDF export, portfolio, published site), like the frontend's
marked with `breaks: true`, with the same TeX math (`core/inline_math`) as
MathML. The math font is the file the frontend serves (frontend/public/fonts);
pages printed without a server embed it with `math_font_css`."""

import html
from pathlib import Path

from latex2mathml.converter import convert
from markdown_it import MarkdownIt
from markdown_it.rules_inline import StateInline

from dsl_crud.core.inline_math import math_at
from dsl_crud.infrastructure import chromium

_FONT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "fonts" / "latinmodern-math.woff2"


def _math(state: StateInline, silent: bool) -> bool:
    span = math_at(state.src, state.pos)
    if span is None:
        return False
    if not silent:
        token = state.push("math", "math", 0)
        token.content = span.tex
        token.meta = {"display": span.display}
    state.pos = span.end
    return True


def _render_math(self, tokens, idx, options, env) -> str:
    token = tokens[idx]
    try:
        return convert(token.content, display="block" if token.meta["display"] else "inline")
    except Exception:  # latex2mathml raises many kinds; the TeX is shown instead
        return f"<code>{html.escape(token.content)}</code>"


_md = MarkdownIt("commonmark", {"breaks": True}).enable(["table", "strikethrough"])
_md.inline.ruler.before("escape", "math", _math)
_md.add_render_rule("math", _render_math)


def render(text: str) -> str:
    return _md.render(text)


def math_font_css() -> str:
    """CSS giving MathML the app's math font, embedded; empty without the file."""
    uri = chromium.data_uri(_FONT)
    if uri is None:
        return ""
    return (f"@font-face {{ font-family: 'Latin Modern Math'; src: url({uri}) format('woff2'); }}\n"
            "math { font-family: 'Latin Modern Math', math; }\n"
            "math[display='block'] { margin: .5em 0; }\n")
