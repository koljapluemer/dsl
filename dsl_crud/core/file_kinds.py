"""What the app does with a file depending on its kind, decided by its extension. See docs/files.md."""

import re
from dataclasses import dataclass
from pathlib import PurePosixPath


class UploadError(ValueError):
    pass


@dataclass(frozen=True)
class Kind:
    name: str
    extensions: frozenset[str] = frozenset()
    # shown as the item's attachment (image or video) rather than listed
    shown: bool = False
    # editable as text in the app
    text: bool = False
    # kept by the app for itself: not listed with the item's files
    hidden: bool = False
    # what a new file of this kind starts as
    default: str = ""


IMAGE = Kind("image", frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}), shown=True)
VIDEO = Kind("video", frozenset({".mp4", ".webm", ".mov"}), shown=True)
JINJA = Kind("jinja", frozenset({".j2", ".jinja", ".jinja2"}), text=True, default="""\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; font: 1.05rem/1.6 system-ui, sans-serif; }
  img { max-width: 100%; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.75rem; margin-top: 2rem; }
  .cards img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
{{ body }}
{% if cards %}<section class="cards">{% for c in cards %}<a href="{{ c.image }}" target="_blank" rel="noopener"><img src="{{ c.thumb }}" alt="{{ c.title }}" loading="lazy"></a>{% endfor %}</section>{% endif %}
</body>
</html>
""")
# compiled to a PDF beside it (pdf_of) when written, see docs/files.md
TYPST = Kind("typst", frozenset({".typ"}), text=True, default="""\
#set page(paper: "a4")
#set text(lang: "en")

// paths are from the data folder: #image("/images/<file>")

= Title
""")
# a flashcard's review state, in FLASHCARDS_DIR (see docs/flashcards.md)
FLASHCARD = Kind("flashcard", frozenset({".json"}), hidden=True)
FLASHCARDS_DIR = "files/flashcards"
OTHER = Kind("other")

KINDS = (IMAGE, VIDEO, JINJA, TYPST)

MAX_VIDEO_BYTES = 250 * 1024 * 1024
# MIME subtypes whose usual extension differs from the subtype
_EXTENSIONS = {("image", "jpeg"): "jpg", ("video", "quicktime"): "mov"}


def kind(path: str) -> Kind:
    suffix = PurePosixPath(path).suffix.lower()
    if path.startswith(FLASHCARDS_DIR + "/") and suffix in FLASHCARD.extensions:
        return FLASHCARD
    return next((k for k in KINDS if suffix in k.extensions), OTHER)


def pdf_of(rel: str) -> str:
    """The PDF a Typst file is compiled to: beside it, the same name."""
    return str(PurePosixPath(rel).with_suffix(".pdf"))


def typst_source(rel: str) -> str | None:
    """The Typst file a PDF is compiled from, if it's one's (by name; whether it exists isn't checked)."""
    p = PurePosixPath(rel)
    return str(p.with_suffix(".typ")) if p.suffix.lower() == ".pdf" else None


def upload_extension(content_type: str | None, size: int) -> str:
    """The extension for an uploaded image or video, after checking it's one the app shows."""
    match = re.fullmatch(r"(image|video)/(\w+)", (content_type or "").split(";")[0].strip().lower())
    if not match:
        raise UploadError("Unsupported media data.")
    name, subtype = match.groups()
    ext = _EXTENSIONS.get((name, subtype), subtype)
    k = IMAGE if name == "image" else VIDEO
    if f".{ext}" not in k.extensions:
        raise UploadError(f"Unsupported {name} type: {ext}.")
    if k is VIDEO and size > MAX_VIDEO_BYTES:
        raise UploadError(f"Video is too large; keep clips under {MAX_VIDEO_BYTES // (1024 * 1024)}MB.")
    return ext
