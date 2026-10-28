"""Headless Chromium through Playwright, for pages rendered to images (the
portfolio's cards, viz thumbnails and checks). Needs the `cards` dependency
group and `uv run playwright install chromium`; `available` says whether this
install has them (not on Termux)."""

import functools

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
