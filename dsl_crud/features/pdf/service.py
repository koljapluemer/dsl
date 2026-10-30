"""A note as a PDF: its body, its `extra` or both as Markdown, its images above
them, printed by headless Chromium (Playwright). Needs what the portfolio's
cards need (`chromium.available`), so not on Termux."""

import html
import re

from dsl_crud.core import documents as views
from dsl_crud.core import dsl, file_kinds, inline_refs, thea
from dsl_crud.infrastructure import chromium, items as store, markdown

CONTENTS = ("both", "body", "extra")
PAPERS = ("A4", "Letter")

_STYLE = """
@page { margin: 18mm 16mm; }
html { font-size: 11pt; }
body { margin: 0; color: #18181b; line-height: 1.45; overflow-wrap: anywhere;
       font-family: system-ui, "Noto Sans", "DejaVu Sans", sans-serif; }
h1, h2, h3, h4 { line-height: 1.2; margin: 1.1em 0 .4em; break-after: avoid; }
h1 { font-size: 1.7em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; }
body > :first-child, section > :first-child { margin-top: 0; }
p, ul, ol, pre, table, blockquote { margin: 0 0 .7em; }
ul, ol { padding-left: 1.4em; }
pre { white-space: pre-wrap; background: #f4f4f5; padding: .5em .7em; border-radius: 4px; }
code { font-family: ui-monospace, "DejaVu Sans Mono", monospace; font-size: .9em; }
blockquote { padding-left: .8em; border-left: 3px solid #d4d4d8; color: #52525b; }
table { border-collapse: collapse; }
th, td { border: 1px solid #d4d4d8; padding: .15em .45em; }
img { max-width: 100%; }
img, table, pre, figure { break-inside: avoid; }
a { color: inherit; }
hr { border: 0; border-top: 1px solid #d4d4d8; margin: 1.4em 0; }
.images { display: flex; flex-wrap: wrap; gap: 4mm; margin-bottom: 6mm; }
.images img { max-height: 90mm; object-fit: contain; }
.viz { margin: 0 0 .7em; }
"""


def status() -> dict:
    return chromium.available()


def _sections(text: str, refs: dict[str, str | None], content: str) -> list[str]:
    """The Markdown of the body and/or `extra`, references as their text and viz
    blocks as their built thumbnail (left out until built)."""
    wanted = {"body": [None], "extra": ["extra"], "both": [None, "extra"]}[content]

    def thumb(block: thea.Block) -> str:
        if (None if block.section == "body" else block.section) not in wanted:
            return ""
        uri = block.id and chromium.data_uri(store._dir() / thea.DIR / block.id / thea.THUMB)
        return f'<figure class="viz"><img src="{uri}"></figure>' if uri else ""

    out = []
    for keyword, section in thea.replace(store.SCHEMA, text, thumb):
        section = section.strip()
        if keyword in wanted and section:
            # a reference as its text, never math
            out.append(inline_refs.substitute(section, lambda r: (r.label or refs.get(r.target) or r.target).replace("$", "\\$")))
    return out


def page_html(name: str, content: str = "both", images: bool = True) -> str:
    """The note `name` as the HTML page printed."""
    if content not in CONTENTS:
        raise store.ValidationError(f"content must be one of {', '.join(CONTENTS)}")
    item = store.get_payload(name)
    doc = dsl.parse(store.SCHEMA, item["text"])
    sections = _sections(item["text"], item["refs"], content)
    if not sections:
        raise store.ValidationError("the note has no extra" if content == "extra" else "nothing to export")
    imgs = ""
    if images:
        uris = [chromium.data_uri(store._dir() / f) for f in views.files(doc) if file_kinds.kind(f) is file_kinds.IMAGE]
        imgs = "".join(f'<img src="{u}">' for u in uris if u)
    body = (f'<div class="images">{imgs}</div>' if imgs else "") + "<hr>".join(f"<section>{markdown.render(s)}</section>" for s in sections)
    return (f'<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(re.sub(r"^#+\s*", "", doc.heading))}</title>'
            f"<style>{_STYLE}{markdown.math_font_css()}</style></head><body>{body}</body></html>")


def render(name: str, content: str = "both", images: bool = True, paper: str = "A4") -> bytes:
    """The note `name` as a PDF; chromium.Unavailable without Chromium."""
    if paper not in PAPERS:
        raise store.ValidationError(f"paper must be one of {', '.join(PAPERS)}")
    page_source = page_html(name, content, images)
    with chromium.Browser("PDF export") as browser:
        page = browser.page()
        page.set_content(page_source, wait_until="load")
        return page.pdf(format=paper, print_background=True, prefer_css_page_size=True)
