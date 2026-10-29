"""A card as one landscape A4 page, laid out as HTML in headless Chromium
(Playwright) and saved as WebP: its images first, in justified rows, then its
title and its text, each in its own box in the space left, in the largest
font size that fits (the title never broken inside a word).

Needs the `cards` dependency group and Chromium (`uv run playwright install
chromium`); `available` says whether this install has them. Renders are cached
on disk by what goes into them."""

import hashlib
import html
import io
import json
import os
from pathlib import Path

from dsl_crud.infrastructure import chromium

# bump when the page or its layout changes, so cached pages are rendered again
VERSION = 5
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "dsl-crud" / "cards"

# A4 landscape at 150 dpi; laid out at 96 dpi (CSS px) and scaled
WIDTH, HEIGHT = 1754, 1240
CSS_WIDTH, CSS_HEIGHT = 1123, 794
THUMB_WIDTH = 420

Unavailable = chromium.Unavailable
available = chromium.available


_STYLE = """
html, body { margin: 0; }
body { position: relative; width: %(w)dpx; height: %(h)dpx; overflow: hidden; background: #fff; color: #18181b;
       font-family: system-ui, "Noto Sans", "DejaVu Sans", sans-serif; }
#images, #title, #body { position: absolute; overflow: hidden; }
#images img { position: absolute; display: block; object-fit: cover; }
/* the title wraps between words only: a word too long for its box makes it smaller instead */
#title { margin: 0; font-size: 40px; line-height: 1.15; font-weight: 700; overflow-wrap: normal; word-break: normal; hyphens: manual; }
#body { line-height: 1.4; overflow-wrap: anywhere; }
#body > :first-child { margin-top: 0; }
#body > :last-child { margin-bottom: 0; }
#body h1, #body h2, #body h3, #body h4 { line-height: 1.2; margin: .8em 0 .3em; }
#body h1 { font-size: 1.5em; }
#body p, #body ul, #body ol, #body pre, #body table, #body blockquote { margin: 0 0 .6em; }
#body ul, #body ol { padding-left: 1.4em; }
#body pre { white-space: pre-wrap; }
#body code { font-family: ui-monospace, "DejaVu Sans Mono", monospace; font-size: .9em; }
#body blockquote { padding-left: .8em; border-left: 3px solid #d4d4d8; color: #52525b; }
#body table { border-collapse: collapse; }
#body th, #body td { border: 1px solid #d4d4d8; padding: .1em .4em; }
#body img { max-width: 100%%; }
#body a { color: inherit; }
""" % {"w": CSS_WIDTH, "h": CSS_HEIGHT}

# Lays the page out: the title, the images and the body text each get their own
# box. Returns the font sizes chosen, whether the text fits at them, whether
# everything is inside the page and no title word is broken, and the arrangement chosen.
_LAYOUT = """
() => {
  const PAGE = { w: %(w)d, h: %(h)d }, MARGIN = 24, GAP = 8, SPLIT = 18;
  // body text size in px: the most room for the images while it stays at least GOOD
  const MIN = 8, OK = 10, GOOD = 13, MAX = 26;
  // title size in px, and the share of its box's height it may take
  // (an unusually long word may take it down to MIN; only one too long even then is broken)
  const TITLE_GOOD = 32, TITLE_MAX = 60, TITLE_SHARE = 0.35;
  // shares of the width (left) or height (top) the images may take; small ones make room for long text
  const shares = (hi) => { const out = []; for (let s = hi; s >= 0.099; s -= 0.04) out.push(s); return out; };
  const LEFT = shares(0.7), TOP = shares(0.66);
  const box = document.getElementById('images'), title = document.getElementById('title'), body = document.getElementById('body');
  for (const img of [...box.children]) if (!img.naturalWidth) img.remove();
  const imgs = [...box.children], aspects = imgs.map((i) => i.naturalWidth / i.naturalHeight);
  const hasTitle = title.textContent.trim() !== '', hasBody = body.textContent.trim() !== '';
  const page = { x: MARGIN, y: MARGIN, w: PAGE.w - 2 * MARGIN, h: PAGE.h - 2 * MARGIN };

  // images in `k` contiguous rows, their summed aspect ratios as equal as possible
  function partition(k) {
    const n = aspects.length, pre = [0];
    for (const a of aspects) pre.push(pre[pre.length - 1] + a);
    const target = pre[n] / k, cost = new Array(n + 1).fill(0).map(() => new Array(k + 1).fill(Infinity)), cut = cost.map((r) => r.map(() => 0));
    cost[0][0] = 0;
    for (let j = 1; j <= k; j++)
      for (let i = j; i <= n; i++)
        for (let s = j - 1; s < i; s++) {
          const c = cost[s][j - 1] + (pre[i] - pre[s] - target) ** 2;
          if (c < cost[i][j]) { cost[i][j] = c; cut[i][j] = s; }
        }
    const rows = [];
    for (let i = n, j = k; j > 0; i = cut[i][j], j--) rows.unshift([...Array(i - cut[i][j]).keys()].map((x) => x + cut[i][j]));
    return rows;
  }

  // justified rows filling as much of region `r` as possible; every box stays inside it
  function pack(r) {
    let best = { boxes: [], area: 0 };
    if (!aspects.length || r.w <= 0 || r.h <= 0) return best;
    for (let k = 1; k <= aspects.length; k++) {
      const rows = partition(k);
      const heights = rows.map((g) => (r.w - GAP * (g.length - 1)) / g.reduce((s, i) => s + aspects[i], 0));
      const gaps = GAP * (rows.length - 1);
      const scale = Math.min(1, (r.h - gaps) / heights.reduce((a, b) => a + b, 0));
      const used = heights.reduce((a, b) => a + b * scale, 0) + gaps;
      const boxes = [];
      let y = r.y + (r.h - used) / 2, area = 0;
      rows.forEach((g, n) => {
        const h = heights[n] * scale;
        const rowW = g.reduce((s, i) => s + aspects[i] * h, 0) + GAP * (g.length - 1);
        let x = r.x + (r.w - rowW) / 2;
        for (const i of g) {
          const w = aspects[i] * h;
          boxes[i] = { x, y, w, h };
          area += w * h;
          x += w + GAP;
        }
        y += h + GAP;
      });
      if (area > best.area) best = { boxes, area };
    }
    return best;
  }

  // a negative size is invalid CSS, which would leave the box at its content's size, past the page
  function place(el, r) {
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: Math.max(0, r.w) + 'px', height: Math.max(0, r.h) + 'px' });
  }
  const overflows = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  // the largest size in [lo, hi] at which `el` fits region `r`, null if not even lo
  function fit(el, r, lo, hi) {
    if (r.w <= 0 || r.h <= 0) return null;
    place(el, r);
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.style.fontSize = mid + 'px';
      if (!overflows(el)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }
  // the title at the top of region `r`, in at most TITLE_SHARE of its height: its size, the
  // height it takes, and whether its longest word fits the width
  function fitTitle(r) {
    if (!hasTitle) return { size: null, h: 0, ok: true };
    const size = fit(title, { ...r, h: r.h * TITLE_SHARE }, MIN, TITLE_MAX) ?? MIN;
    title.style.fontSize = size + 'px';
    title.style.height = 'auto';
    return { size, h: Math.min(title.scrollHeight, r.h * TITLE_SHARE), ok: title.scrollWidth <= title.clientWidth + 1 };
  }
  const below = (r, h) => (h ? { ...r, y: r.y + h + SPLIT, h: Math.max(0, r.h - h - SPLIT) } : r);

  // arrangements: the title across the page above images and body, or at the top of the body's column
  const candidates = [];
  const splits = (r) => {
    const out = [];
    if (!imgs.length) return [{ images: null, body: r }];
    if (!hasBody) return [{ images: r, body: null }];
    for (const s of LEFT) { const w = (r.w - SPLIT) * s; out.push({ images: { ...r, w }, body: { ...r, x: r.x + w + SPLIT, w: r.w - w - SPLIT }, side: 'left' }); }
    for (const s of TOP) { const h = (r.h - SPLIT) * s; out.push({ images: { ...r, h }, body: { ...r, y: r.y + h + SPLIT, h: r.h - h - SPLIT }, side: 'top' }); }
    return out;
  };
  {
    const t = fitTitle(page);
    for (const c of splits(below(page, t.h))) candidates.push({ ...c, t, title: hasTitle ? { ...page, h: t.h } : null, arrangement: 'band' });
  }
  if (hasTitle && imgs.length && hasBody) {
    for (const c of splits(page).filter((c) => c.side === 'left')) {
      const t = fitTitle(c.body);
      candidates.push({ images: c.images, t, title: { ...c.body, h: t.h }, body: below(c.body, t.h), side: c.side, arrangement: 'column' });
    }
  }
  for (const c of candidates) {
    c.titleSize = c.t.size;
    c.titleOk = c.t.ok;
    c.size = c.body ? fit(body, c.body, MIN, MAX) : MAX;
    c.area = c.images ? pack(c.images).area : 0;
  }
  const by = (key) => (a, b) => (key(b) > key(a) ? b : a);
  const valid = candidates.filter((c) => c.titleOk);
  const pool = valid.length ? valid : candidates;
  // the most room for the images in the first tier with any candidate: body and title readable,
  // body readable, body at OK, body fitting at all; else (it fits nowhere) the largest body box
  const tiers = [
    (c) => c.size >= GOOD && (c.titleSize ?? TITLE_MAX) >= TITLE_GOOD,
    (c) => c.size >= GOOD,
    (c) => c.size >= OK,
    (c) => c.size,
  ];
  const tier = tiers.map((t) => pool.filter(t)).find((cs) => cs.length);
  const choice = tier ? tier.reduce(by((c) => c.area + (c.titleSize ?? 0) * 1e-3))
    : pool.reduce(by((c) => c.body.w * c.body.h));

  for (const [el, r] of [[box, choice.images], [title, choice.title], [body, choice.body]]) {
    el.style.display = r ? '' : 'none';
    if (r) place(el, r);
  }
  if (choice.images) {
    const { boxes } = pack({ ...choice.images, x: 0, y: 0 });
    imgs.forEach((img, i) => place(img, boxes[i]));
  }
  let titleSize = null, size = null;
  if (choice.title) {
    titleSize = choice.t.size;
    title.style.fontSize = titleSize + 'px';
    if (!choice.t.ok) title.style.overflowWrap = 'anywhere';
    place(title, choice.title);
  }
  if (choice.body) { size = fit(body, choice.body, MIN, MAX); if (size === null) body.style.fontSize = MIN + 'px'; }

  // every image inside its region and the page, the title and body boxes inside the page
  const within = (r, o) => r.left >= o.left - 0.5 && r.top >= o.top - 0.5 && r.right <= o.right + 0.5 && r.bottom <= o.bottom + 0.5;
  const pageRect = { left: 0, top: 0, right: PAGE.w, bottom: PAGE.h }, boxRect = box.getBoundingClientRect();
  const shown = [choice.images && box, choice.title && title, choice.body && body].filter(Boolean);
  const inside = imgs.every((i) => within(i.getBoundingClientRect(), boxRect)) && shown.every((el) => within(el.getBoundingClientRect(), pageRect));
  // no title word wraps onto a second line or past the box
  let titleWhole = title.scrollWidth <= title.clientWidth + 1 || !choice.title;
  for (const node of title.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    for (const m of node.data.matchAll(/\\S+/g)) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      if (range.getClientRects().length > 1) titleWhole = false;
    }
  }
  return {
    size, titleSize, titleWhole, images: imgs.length, inside,
    fits: (!choice.body || size !== null) && (!choice.title || !overflows(title)),
    layout: !choice.images ? 'text' : !choice.title && !choice.body ? 'images' : `${choice.arrangement}-${choice.side ?? 'images'}`,
  };
}
""" % {"w": CSS_WIDTH, "h": CSS_HEIGHT}


def page_html(title: str, body_html: str, images: list[Path]) -> str:
    """The page before layout: `title` as the heading (plain text, lines kept), then `body_html`."""
    imgs = "".join(f'<img src="{uri}">' for uri in (chromium.data_uri(p) for p in images) if uri)
    heading = "<br>".join(html.escape(line) for line in title.strip().splitlines())
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{_STYLE}</style></head>'
            f'<body><div id="images">{imgs}</div><h1 id="title">{heading}</h1><div id="body">{body_html}</div></body></html>')


class Session:
    """Renders cards, starting Chromium on the first one not in the cache; use as a context manager."""

    def __enter__(self):
        self._browser = chromium.Browser("card collages").__enter__()
        return self

    def __exit__(self, *exc):
        self._browser.__exit__(*exc)

    def _page(self):
        return self._browser.page(viewport={"width": CSS_WIDTH, "height": CSS_HEIGHT},
                                  device_scale_factor=WIDTH / CSS_WIDTH)

    def layout(self, title: str, body_html: str, images: list[Path]) -> tuple[bytes, dict]:
        """The page as PNG, and what the layout chose (`size`, `fits`)."""
        page = self._page()
        try:
            page.set_content(page_html(title, body_html, images), wait_until="load")
            result = page.evaluate(_LAYOUT)
            return page.screenshot(type="png"), result
        finally:
            page.close()

    def render(self, title: str, body_html: str, images: list[Path]) -> tuple[bytes, bytes]:
        """The page and its thumbnail as WebP, rendered only when its text, an image or the layout changed."""
        key = hashlib.sha256(json.dumps([VERSION, title, body_html, [_stamp(p) for p in images]]).encode()).hexdigest()
        page_path, thumb_path = CACHE_DIR / f"{key}.webp", CACHE_DIR / f"{key}-thumb.webp"
        if page_path.is_file() and thumb_path.is_file():
            return page_path.read_bytes(), thumb_path.read_bytes()
        png, _ = self.layout(title, body_html, images)
        page, thumb = _webps(png)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        for path, data in ((page_path, page), (thumb_path, thumb)):
            tmp = path.with_name(f".{path.name}.tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
        return page, thumb


def _stamp(p: Path) -> list:
    try:
        s = p.stat()
        return [str(p), s.st_mtime_ns, s.st_size]
    except OSError:
        return [str(p), None]


def _webps(png: bytes) -> tuple[bytes, bytes]:
    from PIL import Image

    def webp(im, quality):
        out = io.BytesIO()
        im.save(out, "WEBP", quality=quality, method=4)
        return out.getvalue()

    with Image.open(io.BytesIO(png)) as im:
        im = im.convert("RGB")
        if im.size != (WIDTH, HEIGHT):
            im = im.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        thumb = im.resize((THUMB_WIDTH, round(THUMB_WIDTH * HEIGHT / WIDTH)), Image.Resampling.LANCZOS)
        return webp(im, 90), webp(thumb, 82)
