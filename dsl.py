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

VALUE_TYPES = ("date", "month", "weekday")
WEEKDAYS = ("mo", "tu", "we", "th", "fr", "sa", "su")

_KEYWORD_TOKEN = re.compile(r"^[a-z]+$")
_BOUNDARY = re.compile(r"^([a-z]+)(?=\s|$)")
_DATE = re.compile(r"^(\d{2})-(\d{2})-(\d{2})$")
_MONTH = re.compile(r"^(\d{2})-(\d{2})$")


def load_schema(path: Path = SPEC_PATH) -> dict:
    """keywords.yaml, with every keyword's `args`, `options` and `excludes`
    filled in and each type normalised to a list."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    keywords = {}
    for name, spec in raw["keywords"].items():
        if spec.get("role") not in ("primary", "modifier"):
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


def value_type(token: str, types: list[str]) -> str | None:
    """Which of `types` the token is, or None when it's none of them."""
    for t in types:
        if t == "weekday" and token in WEEKDAYS:
            return t
        if t == "month" and (m := _MONTH.match(token)) and 1 <= int(m[2]) <= 12:
            return t
        if t == "date" and (m := _DATE.match(token)):
            y, mo, d = 2000 + int(m[1]), int(m[2]), int(m[3])
            if 1 <= mo <= 12 and 1 <= d <= calendar.monthrange(y, mo)[1]:
                return t
    return None


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
class Document:
    title: str = ""
    description: list[str] = field(default_factory=list)
    clauses: list[Clause] = field(default_factory=list)
    unknown: list[str] = field(default_factory=list)
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


def parse(schema: dict, text: str) -> Document:
    """Never raises: problems become diagnostics."""
    kws = schema["keywords"]
    lines = [l.replace("\r", "") for l in text.split("\n")]

    title_at = next((i for i, l in enumerate(lines) if l.strip()), None)
    if title_at is None:
        return Document(diagnostics=[Diagnostic("empty")])
    title = lines[title_at].strip()

    boundary = None
    for i in range(title_at + 1, len(lines)):
        m = _BOUNDARY.match(lines[i])
        if m and kws.get(m[1], {}).get("role") == "primary":
            boundary = i
            break

    description = _trim_blank_ends(lines[title_at + 1 : len(lines) if boundary is None else boundary])
    if boundary is None:
        return Document(title, description, diagnostics=[Diagnostic("no_primary")])

    p = _KeywordParser(kws)
    for i in range(boundary, len(lines)):
        p.line(lines[i], i + 1)
    p.check_excludes()
    return Document(title, description, p.clauses, p.unknown, p.diagnostics)


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


class _KeywordParser:
    def __init__(self, kws: dict):
        self.kws = kws
        self.clauses: list[Clause] = []
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
        if line.startswith("("):  # reserved for written-back state
            self._unknown(line, no, "(")
            return
        toks = _tokenize(line)
        i = 0
        while i < len(toks):
            text, start, quoted = toks[i]
            if quoted or not _KEYWORD_TOKEN.match(text):
                return self._error("unexpected_token", no, text)
            spec = self.kws.get(text)
            if spec is None:
                return self._unknown(line[start:], no, text)
            i += 1
            if text in self._seen:
                return self._error("duplicate_keyword", no, text)
            self._seen.add(text)

            args = []
            for arg in spec["args"]:
                if i >= len(toks) or self._is_keyword(toks[i]):
                    return self._error("missing_arg", no, text)
                if toks[i][2] or not value_type(toks[i][0], arg["type"]):
                    return self._error("invalid_value", no, toks[i][0])
                args.append(toks[i][0])
                i += 1

            options: dict[str, str] = {}
            while i < len(toks) and not toks[i][2] and toks[i][0] in spec["options"]:
                name = toks[i][0]
                i += 1
                if name in options:
                    return self._error("duplicate_keyword", no, name)
                if i >= len(toks) or self._is_keyword(toks[i]):
                    return self._error("missing_arg", no, name)
                if toks[i][2] or not value_type(toks[i][0], spec["options"][name]["type"]):
                    return self._error("invalid_value", no, toks[i][0])
                options[name] = toks[i][0]
                i += 1

            self.clauses.append(Clause(text, no, args, options))

    def check_excludes(self) -> None:
        for a in range(len(self.clauses)):
            for b in range(a + 1, len(self.clauses)):
                first, second = self.clauses[a].keyword, self.clauses[b].keyword
                if second in self.kws[first]["excludes"] or first in self.kws[second]["excludes"]:
                    self._error("conflicting_keywords", self.clauses[b].line, f"{first}, {second}")


def diagnostics(doc: Document) -> dict:
    return {"errors": [d.__dict__ for d in doc.errors], "warnings": [d.__dict__ for d in doc.warnings]}
