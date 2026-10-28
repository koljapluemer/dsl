"""Renders a built viz in headless Chromium with every request blocked: what
the viz's `npm run check` runs (as `python check.py dist/index.html`), and the
app's gate and thumbnail. Imports nothing from the app, so the workspace can
run it as a script."""

import json
import sys
from pathlib import Path

# (width, theme) the check renders at
VIEWS = ((360, "light"), (1000, "light"), (1000, "dark"))
SETTLE_MS = 800
MIN_HEIGHT = 8


def _render(browser, html: str, width: int, theme: str, shot: Path | None) -> dict:
    page = browser.new_page(viewport={"width": width, "height": 600}, color_scheme=theme)
    problems: list[str] = []
    page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: problems.append(f"uncaught: {e}"))

    def block(route):
        problems.append(f"blocked request (the viz must work offline): {route.request.url}")
        route.abort()

    page.route("**/*", block)
    try:
        page.set_content(html, wait_until="load")
        page.evaluate("(mode) => window.postMessage({ type: 'theme', mode }, '*')", theme)
        page.wait_for_timeout(SETTLE_MS)
        height = page.evaluate("() => Math.ceil(document.documentElement.getBoundingClientRect().height)")
        width_used = page.evaluate("() => document.documentElement.scrollWidth")
        if height < MIN_HEIGHT:
            problems.append(f"the page is {height}px high: nothing visible was rendered")
        if width_used > width + 1:
            problems.append(f"horizontal overflow at {width}px wide: content is {width_used}px wide")
        png = page.screenshot(type="png", full_page=True)
        if shot:
            shot.write_bytes(png)
        return {"width": width, "theme": theme, "height": height, "problems": problems, "png": png}
    finally:
        page.close()


def check(html: str, shots: Path | None = None) -> list[dict]:
    """Each of VIEWS rendered: its height and problems; with `shots`, a
    screenshot of each is written there as check-<width>-<theme>.png."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            return [_render(browser, html, w, t, shots / f"check-{w}-{t}.png" if shots else None) for w, t in VIEWS]
        finally:
            browser.close()


def screenshot(html: str, width: int) -> bytes:
    """The whole page `width` wide, in the light theme, as PNG."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            return _render(browser, html, width, "light", None)["png"]
        finally:
            browser.close()


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: check.py dist/index.html", file=sys.stderr)
        return 2
    html = Path(argv[1]).read_text(encoding="utf-8")
    if "data-thea-bridge" not in html:
        print("FAIL: the bridge script is missing; build with build.mjs unchanged")
        return 1
    results = check(html, Path.cwd())
    failed = False
    for r in results:
        print(f"{r['width']}px {r['theme']}: {r['height']}px high, screenshot check-{r['width']}-{r['theme']}.png")
        for problem in r["problems"]:
            failed = True
            print(f"  FAIL {problem}")
    print(json.dumps({"ok": not failed}))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
