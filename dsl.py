"""The item language from ../dsl: parse a file and report its diagnostics.

Syntax per spec/language.md; keywords come from spec/keywords.yaml (copied in
from ../dsl via `just sync-spec`), so nothing here names a keyword.
"""

import calendar
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

SPEC_PATH = Path(__file__).parent / "spec" / "keywords.yaml"

ROLES = ("primary", "property", "modifier", "state")
OPENING_ROLES = ("primary", "property")
VALUE_TYPES = ("date", "month", "weekday", "path", "text")
WEEKDAYS = ("mo", "tu", "we", "th", "fr", "sa", "su")
EXTRA_MARKER = "extra"

_KEYWORD_TOKEN = re.compile(r"^[a-z]+$")
_KEYWORD_OPENER = re.compile(r"^([a-z]+)(?=\s|$)")
_STATE_OPENER = re.compile(r"^\(([a-z]+)(?=[\s)]|$)")
_RELATION_OPENER = re.compile(r"^->\s")
_DATE = re.compile(r"^(\d{2})-(\d{2})-(\d{2})$")
_MONTH = re.compile(r"^(\d{2})-(\d{2})$")


def load_schema(path: Path = SPEC_PATH) -> dict:
    """keywords.yaml, with every keyword's `args`, `options` and `excludes`
    filled in and each type normalised to a list."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    keywords = {}
    for name, spec in raw["keywords"].items():
        if spec.get("role") not in ROLES:
            raise ValueError(f"keyword {name}: invalid role {spec.get('role')!r}")
        keywords[name] = {
            "role": spec["role"],
            "args": [{"name": a["name"], "type": _types(name, a["type"])} for a in spec.get("args") or []],
            "options": {
                o: {"type": _types(name, v["type"]), "meaning": v.get("meaning", "")}
                for o, v in (spec.get("options") or {}).items()
            },
            "excludes": list(spec.get("excludes") or []),
            "meaning": spec.get("meaning", ""),
        }
    return {"version": raw["version"], "keywords": keywords}


def _types(keyword: str, raw) -> list[str]:
    types = raw if isinstance(raw, list) else [raw]
    for t in types:
        if t not in VALUE_TYPES:
            raise ValueError(f"keyword {keyword}: unknown type {t!r}")
    return types


def value_type(token: str, types: list[str], quoted: bool = False) -> str | None:
    """Which of `types` the token is, or None when it's none of them. Only a
    `path` may be quoted. `text` is not decided per token: it takes the rest
    of the line (see `_SectionParser._clause`)."""
    for t in types:
        if t == "path" and _is_path(token):
            return t
        if quoted:
            continue
        if t == "weekday" and token in WEEKDAYS:
            return t
        if t == "month" and (m := _MONTH.match(token)) and 1 <= int(m[2]) <= 12:
            return t
        if t == "date" and (m := _DATE.match(token)):
            y, mo, d = 2000 + int(m[1]), int(m[2]), int(m[3])
            if 1 <= mo <= 12 and 1 <= d <= calendar.monthrange(y, mo)[1]:
                return t
    return None


def _is_path(token: str) -> bool:
    return bool(token) and not token.startswith("/") and "\\" not in token and ".." not in token.split("/")


def is_section_opener(schema: dict, line: str) -> bool:
    """Whether a body line (other than the first) would start the keyword
    section; writers indent such lines to keep them in the body."""
    kws = schema["keywords"]
    if line.rstrip() == EXTRA_MARKER:
        return True
    if _RELATION_OPENER.match(line):
        return line.split()[-1].startswith("@")
    if m := _STATE_OPENER.match(line):
        return kws.get(m[1], {}).get("role") == "state"
    if m := _KEYWORD_OPENER.match(line):
        return kws.get(m[1], {}).get("role") in OPENING_ROLES
    return False


@dataclass
class Diagnostic:
    code: str
    line: int | None = None
    detail: str | None = None

    @property
    def is_error(self) -> bool:
        return self.code != "unknown_keyword"


@dataclass
class Clause:
    keyword: str
    line: int
    args: list[str]
    options: dict[str, str]


@dataclass
class Relation:
    label: str
    target: str
    line: int


@dataclass
class Document:
    """`body` is empty only for an empty file. `extra` is None when the file
    has no extra marker."""

    body: list[str] = field(default_factory=list)
    clauses: list[Clause] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)
    state: list[Clause] = field(default_factory=list)
    unknown: list[str] = field(default_factory=list)
    extra: list[str] | None = None
    diagnostics: list[Diagnostic] = field(default_factory=list)

    @property
    def errors(self) -> list[Diagnostic]:
        return [d for d in self.diagnostics if d.is_error]

    @property
    def warnings(self) -> list[Diagnostic]:
        return [d for d in self.diagnostics if not d.is_error]

    @property
    def valid(self) -> bool:
        return not self.errors

    @property
    def heading(self) -> str:
        """The first body line, trimmed: what a list shows for the item."""
        return self.body[0].strip() if self.body else ""


def parse(schema: dict, text: str) -> Document:
    """Never raises: problems become diagnostics."""
    lines = [l.replace("\r", "") for l in text.split("\n")]

    first = next((i for i, l in enumerate(lines) if l.strip()), None)
    if first is None:
        return Document(diagnostics=[Diagnostic("empty")])

    boundary = next((i for i in range(first + 1, len(lines)) if is_section_opener(schema, lines[i])), len(lines))
    marker = next((i for i in range(boundary, len(lines)) if lines[i].rstrip() == EXTRA_MARKER), None)
    section_end = len(lines) if marker is None else marker

    p = _SectionParser(schema["keywords"])
    for i in range(boundary, section_end):
        p.line(lines[i], i + 1)
    p.check_excludes()

    extra = None
    if marker is not None:
        extra = _trim_blank_ends(lines[marker + 1 :])
        if not extra:
            p.diagnostics.append(Diagnostic("empty_extra", marker + 1, EXTRA_MARKER))

    return Document(
        body=_trim_blank_ends(lines[first:boundary]),
        clauses=p.clauses,
        relations=p.relations,
        state=p.state,
        unknown=p.unknown,
        extra=extra,
        diagnostics=p.diagnostics,
    )


def _trim_blank_ends(lines: list[str]) -> list[str]:
    start, end = 0, len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def _tokenize(line: str) -> list[tuple[str, int, bool]]:
    """(text, start offset, quoted) per token."""
    tokens, i = [], 0
    while i < len(line):
        if line[i].isspace():
            i += 1
            continue
        start = i
        if line[i] == '"':
            buf, i = [], i + 1
            while i < len(line) and line[i] != '"':
                if line[i] == "\\" and line[i + 1 : i + 2] == '"':
                    buf.append('"')
                    i += 2
                else:
                    buf.append(line[i])
                    i += 1
            i += 1
            tokens.append(("".join(buf), start, True))
        else:
            while i < len(line) and not line[i].isspace():
                i += 1
            tokens.append((line[start:i], start, False))
    return tokens


class _SectionParser:
    def __init__(self, kws: dict):
        self.kws = kws
        self.clauses: list[Clause] = []
        self.relations: list[Relation] = []
        self.state: list[Clause] = []
        self.unknown: list[str] = []
        self.diagnostics: list[Diagnostic] = []
        self._seen: set[str] = set()

    def _is_keyword(self, tok) -> bool:
        return not tok[2] and tok[0] in self.kws

    def _error(self, code: str, line: int, detail: str) -> None:
        self.diagnostics.append(Diagnostic(code, line, detail))

    def _unknown(self, raw: str, line: int, keyword: str) -> None:
        self.unknown.append(raw)
        self.diagnostics.append(Diagnostic("unknown_keyword", line, keyword))

    def line(self, raw: str, no: int) -> None:
        line = raw.strip()
        if not line:
            return
        if line == "->" or _RELATION_OPENER.match(line):
            self._relation(line, no)
        elif line.startswith("("):
            self._state(line, no)
        else:
            self._clauses(line, no)

    def _relation(self, line: str, no: int) -> None:
        rest = line[2:].strip()
        target = rest.split()[-1] if rest else ""
        if len(target) < 2 or not target.startswith("@") or "/" in target or "\\" in target:
            return self._error("invalid_relation", no, line)
        self.relations.append(Relation(rest[: -len(target)].strip(), target[1:], no))

    def _state(self, line: str, no: int) -> None:
        if not line.endswith(")"):
            return self._error("invalid_state", no, line)
        toks = _tokenize(line[1:-1])
        if not toks or toks[0][2] or not _KEYWORD_TOKEN.match(toks[0][0]):
            return self._error("invalid_state", no, line)
        keyword = toks[0][0]
        if keyword not in self.kws:
            return self._unknown(line, no, keyword)
        if self.kws[keyword]["role"] != "state":
            return self._error("invalid_state", no, line)
        clause, i = self._clause(toks, 0, no, line[1:-1])
        if clause is None:
            return
        if i < len(toks):
            return self._error("unexpected_token", no, toks[i][0])
        self.state.append(clause)

    def _clauses(self, line: str, no: int) -> None:
        toks = _tokenize(line)
        i = 0
        while i < len(toks):
            text, start, quoted = toks[i]
            if quoted or not _KEYWORD_TOKEN.match(text):
                return self._error("unexpected_token", no, text)
            if text not in self.kws:
                return self._unknown(line[start:], no, text)
            if self.kws[text]["role"] == "state":
                return self._error("unexpected_token", no, text)
            clause, i = self._clause(toks, i, no, line)
            if clause is None:
                return
            self.clauses.append(clause)

    def _clause(self, toks: list, i: int, no: int, src: str) -> tuple[Clause | None, int]:
        """The clause whose keyword is toks[i], and the index after it; None
        (with an error reported) when it's malformed. `src` is the string the
        tokens were cut from."""
        keyword = toks[i][0]
        spec = self.kws[keyword]
        i += 1
        if keyword in self._seen:
            self._error("duplicate_keyword", no, keyword)
            return None, i
        self._seen.add(keyword)

        args = []
        for arg in spec["args"]:
            if arg["type"] == ["text"]:
                if i >= len(toks):
                    self._error("missing_arg", no, keyword)
                    return None, i
                args.append(src[toks[i][1] :].strip())
                i = len(toks)
                continue
            if i >= len(toks) or self._is_keyword(toks[i]):
                self._error("missing_arg", no, keyword)
                return None, i
            if not value_type(toks[i][0], arg["type"], toks[i][2]):
                self._error("invalid_value", no, toks[i][0])
                return None, i
            args.append(toks[i][0])
            i += 1

        options: dict[str, str] = {}
        while i < len(toks) and not toks[i][2] and toks[i][0] in spec["options"]:
            name = toks[i][0]
            i += 1
            if name in options:
                self._error("duplicate_keyword", no, name)
                return None, i
            if i >= len(toks) or self._is_keyword(toks[i]):
                self._error("missing_arg", no, name)
                return None, i
            if not value_type(toks[i][0], spec["options"][name]["type"], toks[i][2]):
                self._error("invalid_value", no, toks[i][0])
                return None, i
            options[name] = toks[i][0]
            i += 1

        return Clause(keyword, no, args, options), i

    def check_excludes(self) -> None:
        for a in range(len(self.clauses)):
            for b in range(a + 1, len(self.clauses)):
                first, second = self.clauses[a].keyword, self.clauses[b].keyword
                if second in self.kws[first]["excludes"] or first in self.kws[second]["excludes"]:
                    self._error("conflicting_keywords", self.clauses[b].line, f"{first}, {second}")


def diagnostics(doc: Document) -> dict:
    return {"errors": [d.__dict__ for d in doc.errors], "warnings": [d.__dict__ for d in doc.warnings]}
