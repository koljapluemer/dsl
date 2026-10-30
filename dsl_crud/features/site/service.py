"""The published site: every note with a valid `publish` route as a page, its
`publish` block rendered as Markdown into the Jinja template of the note at
route `_index`, exported into the folder set in Settings. `[[references]]` to
published notes become relative links, any other a disabled link;
`![[embeds]]` of the note's attached images and videos are copied beside the
pages, at their path in the data folder, and so is the built page of each
`thea` block, shown in a sandboxed iframe with the spec it was built from."""

import html
import json
import posixpath
import re
import threading

import jinja2
from markupsafe import Markup

from dsl_crud.core import file_kinds, inline_refs, thea
from dsl_crud.infrastructure import exports, items as store, markdown, media as files

ROOT = "_index"
MARKER = "dsl-crud site export"

TEMPLATE = """\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1rem; font: 1.05rem/1.6 system-ui, sans-serif; }
  img, video { max-width: 100%; }
  math { font-family: math; }
  .missing { color: #ba0000; cursor: not-allowed; text-decoration: none; }
  pre { overflow-x: auto; font-size: .85em; }
  code { font-size: .9em; }
  pre code { font-size: inherit; }
  .viz { margin: 1em 0; }
  .viz iframe { display: block; width: 100%; border: 0; }
  .viz summary { cursor: pointer; font-size: .85em; opacity: .6; }
  .viz details pre { white-space: pre-wrap; }
</style>
</head>
<body>
{% if route != "_index" %}<nav><a href="{{ root }}index.html">Home</a></nav>{% endif %}
<main>
{{ content }}
</main>
</body>
</html>
"""

# sizes each viz's iframe to the height its page reports (the bridge in features/thea/template/build.mjs)
RESIZE = ("<script>addEventListener('message', (e) => { const d = e.data;"
          " if (!d || d.source !== 'thea' || d.type !== 'resize' || typeof d.height !== 'number') return;"
          " for (const f of document.querySelectorAll('.viz iframe'))"
          " if (f.contentWindow === e.source) f.style.height = Math.max(d.height, 40) + 'px'; });</script>\n")
# as in the app (TheaBlock.tsx)
DEFAULT_HEIGHT = 160

_env = jinja2.Environment(autoescape=True)
# a page's requests may overlap; only one of them creates the note
_lock = threading.Lock()


def path(route: str) -> str:
    """The page's file in the site: `a/_index` is `a/index.html`, `a/b` is `a/b.html`."""
    head, _, last = route.rpartition("/")
    name = "index.html" if last == ROOT else f"{last}.html"
    return f"{head}/{name}" if head else name


def _routes(entries: dict) -> dict[str, str]:
    """Each published note by its route; several notes at one route are an error."""
    by_route: dict[str, list[str]] = {}
    for name, entry in entries.items():
        if entry.route:
            by_route.setdefault(entry.route, []).append(name)
    clashes = [f"{r} ({', '.join(sorted(ns))})" for r, ns in sorted(by_route.items()) if len(ns) > 1]
    if clashes:
        raise store.ValidationError(f"several notes at one route: {'; '.join(clashes)}")
    return {r: ns[0] for r, ns in by_route.items()}


def _template(item: dict) -> str | None:
    return next((f for f in item["files"] if file_kinds.kind(f) is file_kinds.JINJA), None)


def ensure() -> dict:
    """The note at route `_index` and its template, created when missing; calling it again changes nothing."""
    with _lock:
        name = _routes(store._INDEX.refresh()).get(ROOT) or store.create({"text": f"Home\n\npublish {ROOT}\n# Home\n"})["file"]
        template = _template(store.get(name))
        if template is None:
            template = f"{files.FILES_DIR}/{name.removesuffix('.txt')}.html.j2"
            if not files.exists(template):
                files.write_text(template, TEMPLATE)
            files.add(name, template)
        return {"note": store.get_payload(name), "template": template}


def embedded(attached: list[str], target: str) -> str | None:
    """The attached image or video an embed names: by its path, or by its file
    name when only one has it. Mirrors the frontend's `embedded` (files.ts)."""
    shown = [f for f in attached if file_kinds.kind(f).shown]
    if target in shown:
        return target
    named = [f for f in shown if posixpath.basename(f) == target]
    return named[0] if len(named) == 1 else None


def _text(s: str) -> str:
    """`s` as HTML text that Markdown leaves alone and is never math."""
    return re.sub(r"[$*_`\\\[\]~]", lambda m: f"&#{ord(m.group())};", html.escape(s))


def _viz(block: thea.Block, here: str) -> str:
    """The block's built page in an iframe, with the spec it was built from
    folded under it, as one HTML block; empty when it isn't built."""
    folder = f"{thea.DIR}/{block.id}"
    if not block.id or not files.exists(f"{folder}/{thea.BUILT}"):
        return ""
    try:
        spec = str(json.loads(files.read(f"{folder}/{thea.META}"))["spec"])
    except (store.NotFound, ValueError, KeyError, TypeError):
        spec = block.spec
    src = html.escape(posixpath.relpath(f"{folder}/{thea.BUILT}", here or "."))
    title = _text(spec.split("\n")[0])
    # on one line, so a blank line in the spec doesn't end the HTML block
    pre = _text(spec).replace("\n", "&#10;")
    return (f'<figure class="viz"><iframe src="{src}" sandbox="allow-scripts" title="{title}" style="height: {DEFAULT_HEIGHT}px"></iframe>'
            f'<figcaption><details><summary>spec</summary><pre>{pre}</pre></details></figcaption></figure>')


def _built(ident: str) -> bytes:
    """The version's built page, with a CSP that keeps it offline on any host."""
    page = files.read(f"{thea.DIR}/{ident}/{thea.BUILT}").decode()
    meta = f'<meta http-equiv="Content-Security-Policy" content="{html.escape(thea.CSP)}">'
    m = re.search(r"<head\b[^>]*>", page, re.I)
    return (page[:m.end()] + "\n" + meta + page[m.end():] if m else meta + "\n" + page).encode()


def _page(name: str, route: str, routes: dict[str, str], entries: dict) -> tuple[Markup, set[str], set[str]]:
    """The page's HTML, the files it embeds, and the vizzes it shows."""
    attached = list(entries[name].files)
    published = {n.removesuffix(".txt"): r for r, n in routes.items()}
    here = posixpath.dirname(path(route))
    used: set[str] = set()
    vizzes: set[str] = set()

    def viz(block: thea.Block) -> str:
        out = _viz(block, here) if block.section == "publish" else ""
        if out:
            vizzes.add(block.id)
        return out

    def replace(ref: inline_refs.InlineReference) -> str:
        if ref.embed:
            file = embedded(attached, ref.target)
            if file is None:
                return ""
            used.add(file)
            src = html.escape(posixpath.relpath(file, here or "."))
            if file_kinds.kind(file) is file_kinds.VIDEO:
                return f'<video src="{src}" controls></video>'
            return f'<img src="{src}" alt="{_text(ref.label or posixpath.basename(file))}">'
        target = entries.get(f"{ref.target}.txt")
        label = _text(ref.label or (re.sub(r"^#+\s*", "", target.heading) if target else ref.target))
        if ref.target not in published:
            return f'<a class="missing" aria-disabled="true" title="not published">{label}</a>'
        href = posixpath.relpath(path(published[ref.target]), here or ".")
        return f'<a href="{html.escape(href)}">{label}</a>'

    text = next((t for k, t in thea.replace(store.SCHEMA, store.get(name)["text"], viz) if k == "publish"), "")
    content = markdown.render(inline_refs.substitute(text.strip(), replace, embeds=True))
    return Markup(content + (RESIZE if vizzes else "")), used, vizzes


def tree() -> dict[str, bytes]:
    """Every page by its path in the site, and the files they embed."""
    entries = store._INDEX.refresh()
    routes = _routes(entries)
    root = routes.get(ROOT)
    if root is None:
        raise store.ValidationError(f"no note is published at {ROOT}")
    template_file = _template(store.get(root))
    if template_file is None:
        raise store.ValidationError(f"the note at {ROOT} names no template")
    try:
        template = _env.from_string(files.read_text(template_file))
    except jinja2.TemplateError as e:
        raise store.ValidationError(f"template: {e}") from e
    out: dict[str, bytes] = {}
    embeds: set[str] = set()
    vizzes: set[str] = set()
    for route, name in sorted(routes.items()):
        content, used, shown = _page(name, route, routes, entries)
        embeds |= used
        vizzes |= shown
        here = posixpath.dirname(path(route))
        try:
            page = template.render(title=re.sub(r"^#+\s*", "", entries[name].heading), content=content, route=route,
                                   root="../" * (here.count("/") + 1) if here else "")
        except jinja2.TemplateError as e:
            raise store.ValidationError(f"template: {e}") from e
        out[path(route)] = page.encode()
    for file in sorted(embeds):
        out[file] = files.read(file)
    for ident in sorted(vizzes):
        out[f"{thea.DIR}/{ident}/{thea.BUILT}"] = _built(ident)
    return out


def export_definition() -> exports.Export:
    return exports.Export("site", "", None, MARKER, tree, folder=True)
