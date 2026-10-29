"""Headless Chromium through Playwright, for pages rendered to images (the
portfolio's cards, viz thumbnails and checks) and to PDFs (note export). Needs
the `cards` dependency group and `uv run playwright install chromium`;
`available` says whether this install has them (not on Termux)."""

import base64
import functools
import mimetypes
from pathlib import Path

INSTALL_HINT = "uv run playwright install chromium"


class Unavailable(RuntimeError):
    pass


@functools.cache
def missing() -> str | None:
    """Why Chromium can't be used here, None if it can. Checked once per process."""
    try:
        import PIL  # noqa: F401
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return f"{e.name} isn't installed (the `cards` dependency group)"
    try:
        with sync_playwright() as p:
            p.chromium.launch().close()
    except Exception as e:  # noqa: BLE001 - any failure to start means unavailable
        return f"Chromium doesn't start ({str(e).strip().splitlines()[0]}); run `{INSTALL_HINT}`"
    return None


def data_uri(path: Path) -> str | None:
    """The file as a `data:` URI, to put in a page without a server; None if it can't be read."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def available() -> dict:
    reason = missing()
    return {"available": reason is None, "reason": reason}


class Browser:
    """Chromium, started on the first page asked for; use as a context manager,
    in one thread. `what` names what's unavailable without it."""

    def __init__(self, what: str):
        self._what = what

    def __enter__(self):
        self._playwright = self._browser = None
        return self

    def __exit__(self, *exc):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    def page(self, **options):
        """A new page; `options` as Playwright's `new_page`."""
        if self._browser is None:
            reason = missing()
            if reason:
                raise Unavailable(f"{self._what} unavailable: {reason}")
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch()
        return self._browser.new_page(**options)
