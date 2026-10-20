"""`source` items: bibliographic sources, their fields in the `data` block (see fields.py).

A source is read from and written to its file's `data` and `extra` blocks and
first line; lines this module doesn't own (relationships, other keywords,
unknown `data` keys) are kept as they are when it's saved.
"""

import re
from dataclasses import dataclass, field

import yaml

import dsl
import questions
import source_match
import store
from fields import ENTRY_TYPES, FIELDS, ValidationError, join_name, normalise

SOURCE_KEYWORD = "source"
RECENT = 3


class _CoreDumper(yaml.SafeDumper):
    """Writes `2017-06-12` unquoted: it stays a string in the core schema (see dsl.load_yaml)."""


_CoreDumper.yaml_implicit_resolvers = {
    ch: [(tag, rx) for tag, rx in rs if tag != "tag:yaml.org,2002:timestamp"]
    for ch, rs in yaml.SafeDumper.yaml_implicit_resolvers.items()
}


class _Flow(dict):
    pass


class _FlowList(list):
    pass


_CoreDumper.add_representer(_Flow, lambda d, v: d.represent_mapping("tag:yaml.org,2002:map", v, flow_style=True))
_CoreDumper.add_representer(_FlowList, lambda d, v: d.represent_sequence("tag:yaml.org,2002:seq", v, flow_style=True))

# names hold commas, which a flow list would have to quote
_BLOCK_LISTS = {n for n, s in FIELDS.items() if s["type"] == "name"}


def _flowed(value, block: bool = False):
    """Nested mappings and lists of scalars on one line, the rest in block style."""
    if isinstance(value, dict):
        return _Flow(value)
    if isinstance(value, list) and not block and not any(isinstance(v, (dict, list)) for v in value):
        return _FlowList(value)
    if isinstance(value, list):
        return [_flowed(v) for v in value]
    return value


def _dump_data(data: dict) -> list[str]:
    text = yaml.dump(
        {k: _flowed(v, k in _BLOCK_LISTS) for k, v in data.items()},
        Dumper=_CoreDumper,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
        width=10**6,
    )
    return text.rstrip("\n").split("\n")


@dataclass
class _Block:
    keyword: str
    lines: list[str]


@dataclass
class _Layout:
    """A file as its body lines plus the keyword section, in order, as plain
    lines and blocks: just enough to rewrite some of it and keep the rest."""

    body: list[str] = field(default_factory=list)
    section: list[str | _Block] = field(default_factory=list)

    def has_keyword(self, keyword: str) -> bool:
        return any(isinstance(e, str) and e.split()[:1] == [keyword] for e in self.section)

    def block(self, keyword: str) -> _Block | None:
        return next((e for e in self.section if isinstance(e, _Block) and e.keyword == keyword), None)

    def set_block(self, keyword: str, lines: list[str]) -> None:
        """Replaces the block's content (or removes the block when `lines` is empty);
        a new block goes before `extra`, or last."""
        block = self.block(keyword)
        if block is not None:
            if lines:
                block.lines = lines
            else:
                self.section.remove(block)
        elif lines:
            extra = self.block("extra")
            at = self.section.index(extra) if extra is not None and keyword != "extra" else len(self.section)
            self.section.insert(at, _Block(keyword, lines))


def _trim(lines: list[str]) -> list[str]:
    start, end = 0, len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def _layout(text: str) -> _Layout:
    schema = store.SCHEMA
    lines = text.replace("\r", "").split("\n")
    first = next((i for i, l in enumerate(lines) if l.strip()), None)
    if first is None:
        return _Layout()
    boundary = next((i for i in range(first + 1, len(lines)) if dsl.is_section_opener(schema, lines[i])), len(lines))
    out = _Layout(body=_trim(lines[first:boundary]))
    i = boundary
    while i < len(lines):
        keyword = dsl.block_keyword(schema, lines[i])
        if keyword is None:
            if lines[i].strip():
                out.section.append(lines[i].strip())
            i += 1
            continue
        end = next((j for j in range(i + 1, len(lines)) if dsl.ends_block(schema, lines[j])), len(lines))
        out.section.append(_Block(keyword, _trim(lines[i + 1 : end])))
        i = end
    return out


def _render(layout: _Layout) -> str:
    out = list(layout.body)
    if layout.section:
        out.append("")
    for entry in layout.section:
        if isinstance(entry, str):
            out.append(entry)
            continue
        out.append(entry.keyword)
        # a line that would end the block is indented to stay in it
        out.extend(f" {l}" if dsl.ends_block(store.SCHEMA, l) else l for l in entry.lines)
    return "\n".join(out) + "\n"


def _load_data(text: str | None) -> dict:
    """The `data` block's mapping; empty when there's none or it's invalid."""
    try:
        data = dsl.load_yaml(text) if text else None
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def _coerce(name: str, value):
    """A YAML value as the model's type for the field."""
    t = FIELDS[name]["type"]
    if t == "integer":
        return value if isinstance(value, int) and not isinstance(value, bool) else str(value)
    if t == "name":
        # `{family, given, …}` mappings are the names' earlier form
        names = value if isinstance(value, list) else [value]
        return [join_name(n) if isinstance(n, dict) else str(n) for n in names]
    if t == "list":
        return [str(v) for v in value] if isinstance(value, list) else [str(value)]
    return str(value)


def _source(name: str, e) -> dict:
    data = _load_data(e.data_text)
    entrytype = data.get("entrytype")
    key = data.get("key")
    key = str(key) if key not in (None, "") else name.removesuffix(".txt")
    source = {
        "file": name,
        "key": key,
        "entrytype": entrytype if entrytype in ENTRY_TYPES else "misc",
        "title": e.heading,
    }
    source.update({n: _coerce(n, data[n]) for n in FIELDS if data.get(n) not in (None, "", [])})
    if e.extra:
        source["extra"] = e.extra
    return source


def _sources() -> dict[str, dict]:
    """Every source by file name, sorted by key."""
    entries = store._INDEX.refresh()
    found = [_source(n, e) for n, e in entries.items() if e.primary == SOURCE_KEYWORD]
    return {s["file"]: s for s in sorted(found, key=lambda s: (s["key"].lower(), s["file"]))}


def list_sources() -> list[dict]:
    return list(_sources().values())


def listing() -> dict:
    """Every source, with `backlinks`, the number of relationships pointing to
    it, and the files of the RECENT most recently modified, newest first."""
    listed = list_sources()
    with store._INDEX.locked() as ix:
        names = [n for n, e in ix.entries.items() if e.primary == SOURCE_KEYWORD]
        recent = sorted(names, key=lambda n: ix.entries[n].mtime_ns, reverse=True)[:RECENT]
        counts = {s["file"]: len(ix.incoming.get(s["file"], ())) for s in listed}
    return {"sources": [{**s, "backlinks": counts[s["file"]]} for s in listed], "recent": recent}


def _text(source: dict, base: str | None) -> str:
    """The file text for `source`, keeping what `base` (the file's current text) holds beyond it."""
    layout = _layout(base) if base else _Layout()
    layout.body = [source.get("title") or source["key"], *layout.body[1:]]
    if not layout.has_keyword(SOURCE_KEYWORD):
        layout.section.insert(0, SOURCE_KEYWORD)
    data = {"key": source["key"], "entrytype": source["entrytype"]}
    data.update({n: source[n] for n in FIELDS if n in source})
    # keys the app doesn't know stay as they are
    old = _load_data("\n".join(b.lines)) if (b := layout.block("data")) else {}
    data.update({k: v for k, v in old.items() if k not in data and k not in FIELDS})
    layout.set_block("data", _dump_data(data))
    layout.set_block("extra", source["extra"].split("\n") if source.get("extra") else [])
    return _render(layout)


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _normalise(body) -> dict:
    """The source in a request: `file` is the item's, a blank key the title's slug."""
    if not isinstance(body, dict):
        raise ValidationError("expected object")
    body = {k: v for k, v in body.items() if k != "file"}
    if not str(body.get("key") or "").strip() and isinstance(body.get("title"), str):
        body["key"] = _slug(body["title"])
    return normalise(body)


def _check_key(key: str, file: str | None) -> None:
    if any(s["key"] == key and s["file"] != file for s in _sources().values()):
        raise store.Conflict(f"key '{key}' exists")


def create(body) -> dict:
    source = _normalise(body)
    _check_key(source["key"], None)
    item = store.create({"text": _text(source, None)})
    return _sources()[item["file"]]


def update(file: str, body) -> dict:
    """Rewrites the source in `file`; the file keeps its name when the key changes."""
    source = _normalise(body)
    base = store.get(file)["text"]
    _check_key(source["key"], file)
    store.update(file, {"text": _text(source, base)})
    return _sources()[file]


def unique_key(key: str, taken: set[str]) -> str:
    """`key`, or `key-2`, `key-3`, … when that's taken."""
    out, n = key, 2
    while out in taken:
        out = f"{key}-{n}"
        n += 1
    return out


def match(entries: list[dict]) -> list[dict]:
    """Each source in `entries` as `{source, candidates}`: the existing sources it may be."""
    existing = list_sources()
    return [{"source": e, "candidates": source_match.match(e, existing)} for e in entries]


def resolve(entries) -> list[dict]:
    """Each entry's source, in order: `{file}` an existing one, `{source}` a new
    one, created with its key renamed when that's taken."""
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        raise ValidationError("entries: expected list of objects")
    known = _sources()
    for e in entries:
        if e.get("file") and e["file"] not in known:
            raise store.NotFound(e["file"])
    taken = {s["key"] for s in known.values()}
    out = []
    for e in entries:
        if e.get("file"):
            out.append(known[e["file"]])
            continue
        source = _normalise(e.get("source"))
        source["key"] = unique_key(source["key"], taken)
        taken.add(source["key"])
        out.append(create(source))
    return out


def link(text: str, files: list[str], label: str) -> str:
    """`text` with a relationship `label` to each of `files` it doesn't have yet."""
    for f in files:
        target = f.removesuffix(".txt")
        if not any((r.label or "") == label and r.target == target for r in dsl.parse(store.SCHEMA, text).relations):
            text = questions.add_relation(text, label, target)
    return text
