"""Searching the notes with a small query language (see SearchHelpModal in the
frontend). Every list of notes to pick from - the notes' sidebar, the graph's,
a relationship's target - is one of these searches, over the notes of a scope."""

import math
import re
import time
import unicodedata
from dataclasses import dataclass

import regex

from dsl_crud.core import documents
from dsl_crud.features.search import semantic
from dsl_crud.infrastructure import items as store, ollama as llm

PAGE_SIZE = 40
PIN_ALL_CAP = 100
# Search runs per keystroke: a folder scan per query would lag on a big folder.
SEARCH_MAX_AGE = 2.0


# --- scopes ---------------------------------------------------------------------


class _Pool:
    """The notes searched (`notes`), and how many relationships each has
    within its scope - also with notes the search leaves out."""

    def __init__(self, notes: dict):
        self.notes = notes
        self._scope = notes
        self._incoming: dict[str, list[tuple[str, str, bool]]] = {}
        for source, entry in notes.items():
            for label, target, inline in store.effective_graph_rels(entry):
                self._incoming.setdefault(target, []).append((source, label, inline))

    def degree(self, name: str) -> int:
        return (sum(t in self._scope for _, t, _ in store.effective_graph_rels(self._scope[name]))
                + sum(s in self._scope for s, _, _ in self._incoming.get(name, ())))


# `graph` is the graph's notes (see graph._View)
SCOPES = {
    "all": lambda ix: ix.entries,
    "attention": lambda ix: {n: e for n, e in ix.entries.items() if e.flagged},
    "tasks": lambda ix: {n: e for n, e in ix.entries.items() if e.has_tasks},
    "graph": lambda ix: {name: entry for name, entry in ix.entries.items()
                         if entry.valid and not documents.GRAPH_HIDING.hides(entry.primary, entry.tags)},
}


def _pool(ix, scope: str) -> _Pool:
    if scope not in SCOPES:
        raise store.ValidationError(f"invalid search scope '{scope}'")
    return _Pool(dict(SCOPES[scope](ix)))


# --- query language -------------------------------------------------------------

FIELDS = ("content", "body", "extra", "file")


class IncompleteQuery(Exception):
    """A valid query prefix that only needs more input."""


@dataclass
class Term:
    value: str
    match: str  # fuzzy | exact | regex
    flags: str = ""


@dataclass
class Op:
    type: str  # and | or
    children: list


@dataclass
class Not:
    child: object


@dataclass
class Scope:
    field: str
    child: object


def _tokenize_query(source: str, regex_terms: bool) -> list[tuple]:
    """(type, value, flags)s; without `regex_terms` a slash is part of a word."""
    tokens, i = [], 0
    while i < len(source):
        c = source[i]
        if c.isspace():
            i += 1
        elif c in "()-:":
            tokens.append(({"(": "open", ")": "close", "-": "minus", ":": "colon"}[c], None, None))
            i += 1
        elif c == '"':
            value, i = _read_delimited(source, i + 1, '"')
            tokens.append(("phrase", re.sub(r'\\(["\\])', r"\1", value), None))
        elif c == "/" and regex_terms:
            value, i = _read_delimited(source, i + 1, "/")
            start = i
            while i < len(source) and source[i].isascii() and source[i].isalpha():
                i += 1
            flags = source[start:i]
            if not re.fullmatch(r"[ims]*", flags):
                raise store.ValidationError("Regex flags may only contain i, m, or s.")
            tokens.append(("regex", value, flags))
        else:
            start = i
            while i < len(source) and not (source[i].isspace() or source[i] in "():"):
                i += 1
            value = source[start:i]
            tokens.append(("or" if value == "OR" else "word", value, None))
    return tokens


def _read_delimited(source: str, start: int, delimiter: str) -> tuple[str, int]:
    value, escaped = [], False
    for i in range(start, len(source)):
        c = source[i]
        if not escaped and c == delimiter:
            return "".join(value), i + 1
        escaped = not escaped and c == "\\"
        value.append(c)
    raise IncompleteQuery("Unclosed quoted phrase." if delimiter == '"' else "Unclosed regular expression.")


class _Parser:
    """Adjacent expressions are an implicit AND; OR binds looser."""

    def __init__(self, tokens: list[tuple]):
        self.tokens, self.i = tokens, 0

    def peek(self, offset: int = 0):
        j = self.i + offset
        return self.tokens[j] if j < len(self.tokens) else None

    def parse(self):
        query = self.parse_or()
        if self.peek():
            raise store.ValidationError("Unexpected token in search query.")
        return query

    def parse_or(self):
        children = [self.parse_and()]
        while (t := self.peek()) and t[0] == "or":
            self.i += 1
            children.append(self.parse_and())
        return children[0] if len(children) == 1 else Op("or", children)

    def parse_and(self):
        children = []
        while (t := self.peek()) and t[0] in ("word", "phrase", "regex", "minus", "open"):
            children.append(self.parse_unary())
        if not children:
            raise IncompleteQuery("Expected a search term.")
        return children[0] if len(children) == 1 else Op("and", children)

    def parse_unary(self):
        t = self.peek()
        if t and t[0] == "minus":
            self.i += 1
            return Not(self.parse_unary())
        nxt = self.peek(1)
        if t and t[0] == "word" and nxt and nxt[0] == "colon":
            if t[1].lower() in FIELDS:
                self.i += 2
                return Scope(t[1].lower(), self.parse_unary())
            value = self.peek(2)
            if value and value[0] == "word":
                self.i += 3
                return Term(f"{t[1]}:{value[1]}", "fuzzy")
        return self.parse_primary()

    def parse_primary(self):
        t = self.peek()
        if not t:
            raise IncompleteQuery("Expected a search term.")
        self.i += 1
        if t[0] == "open":
            query = self.parse_or()
            close = self.peek()
            self.i += 1
            if not close or close[0] != "close":
                raise IncompleteQuery("Unclosed parenthesis in search query.")
            return query
        if t[0] in ("word", "phrase", "regex"):
            return Term(t[1], {"word": "fuzzy", "phrase": "exact", "regex": "regex"}[t[0]], t[2] or "")
        raise store.ValidationError("Expected a search term.")


def parse_query(source: str, regex_terms: bool = True):
    return _Parser(_tokenize_query(source, regex_terms)).parse()


# --- engine ---------------------------------------------------------------------

# Re-ranked by score at the head of a result list; the tail keeps the engine's
# order. Fixed, so every page slices the same total order.
RERANKED_HEAD_SIZE = 120
# Sinks every hit only in a note's extra content below every body hit.
EXTRA_ONLY_RANK_PENALTY = 100_000
# How much of a note's first line a result shows (the client's NoteLine `chars`).
FIRST_LINE_LENGTH = 120
EXCERPT_CONTEXT = 40
EXCERPT_MAX_MATCH = 60
ELLIPSIS = "…"
# Matches a prefix of a word only, for the engine's own order.
_PREFIX_WEIGHT = 0.6
REGEX_TIMEOUT = 5.0
_COMBINING_RE = re.compile("[̀-ͯ]")
_TOKEN_RE = re.compile(r"[\w-]+")


def normalize(s: str) -> str:
    """Case and diacritics folded."""
    return _COMBINING_RE.sub("", unicodedata.normalize("NFKD", s)).lower()


@dataclass
class _Fuzzy:
    normalized: str
    tokens: list[str]


@dataclass
class _Raw:
    """Where an exact or regex term matched, in the compacted fields."""
    body: tuple[int, int] | None
    extra: tuple[int, int] | None


@dataclass
class _Hit:
    raw: _Raw | None
    fuzzy: _Fuzzy | None
    rank: int

    @property
    def displayable(self) -> bool:
        return self.raw is not None or self.fuzzy is not None


def _evaluate(pool: _Pool, ix, query, scope: str) -> dict[str, _Hit]:
    """Matches by note, in the engine's order, each with its best match to show."""
    if isinstance(query, Scope):
        return _evaluate(pool, ix, query.child, query.field)
    if isinstance(query, Term):
        return _term_hits(pool, ix, query, scope)
    if isinstance(query, Not):
        excluded = _evaluate(pool, ix, query.child, scope)
        kept = (n for n in sorted(pool.notes) if n not in excluded)
        return {n: _Hit(None, None, i) for i, n in enumerate(kept)}
    parts = [_evaluate(pool, ix, c, scope) for c in query.children]
    if query.type == "or":
        out: dict[str, _Hit] = {}
        for part in parts:
            for name, hit in part.items():
                cur = out.get(name)
                if cur is None or hit.rank < cur.rank or not cur.displayable:
                    out[name] = hit
        return out
    out = dict(parts[0])
    for part in parts[1:]:
        for name, cur in list(out.items()):
            other = part.get(name)
            if other is None:
                del out[name]
            elif not cur.displayable and other.displayable:
                out[name] = other
    return out


def _term_hits(pool: _Pool, ix, term: Term, scope: str) -> dict[str, _Hit]:
    if scope == "file":
        return _filename_hits(pool, term)
    if term.match != "fuzzy":
        return _raw_hits(pool, term, ("body", "extra") if scope == "content" else (scope,))
    fuzzy = _Fuzzy(normalize(term.value), _TOKEN_RE.findall(normalize(term.value)))
    return {n: _Hit(None, fuzzy, i) for i, n in enumerate(_fuzzy_names(pool, ix, term.value, scope))}


def _fuzzy_names(pool: _Pool, ix, value: str, scope: str) -> list[str]:
    """Notes holding every word of `value`, each also as a word's prefix, in
    the field(s) of `scope`; by idf-weighted score, exact over prefix matches."""
    tokens = list(dict.fromkeys(store.words(value)))
    if not tokens:
        return []
    in_body, in_extra = scope in ("content", "body"), scope in ("content", "extra")
    n = len(pool.notes)
    score: dict[str, float] | None = None
    for token in tokens:
        best: dict[str, float] = {}
        for w in ix.expand(token):
            names = ix.names_with(w)
            base = math.log(1 + n / len(names)) * (1.0 if w == token else _PREFIX_WEIGHT)
            for name in names:
                e = pool.notes.get(name)
                if e is not None and ((in_body and w in e.body_words) or (in_extra and w in e.extra_words)):
                    best[name] = max(best.get(name, 0.0), base)
        score = best if score is None else {k: score[k] + s for k, s in best.items() if k in score}
    return sorted(score, key=lambda k: (-score[k], k))


def _filename_hits(pool: _Pool, term: Term) -> dict[str, _Hit]:
    if term.match == "regex":
        search = _regex_search(term)
        test = lambda name: search(name) is not None
    else:
        needle = normalize(term.value)
        test = lambda name: needle in normalize(name)
    return {n: _Hit(None, None, i) for i, n in enumerate(n for n in sorted(pool.notes) if test(n))}


def _regex_search(term: Term):
    """`search(s)` for the regex term, as a (start, length) or None; all
    searches with it together are given up on after REGEX_TIMEOUT."""
    flags = regex.V0
    for f, value in (("i", regex.IGNORECASE), ("m", regex.MULTILINE), ("s", regex.DOTALL)):
        if f in term.flags:
            flags |= value
    try:
        pattern = regex.compile(term.value, flags)
    except regex.error as e:
        raise store.ValidationError(f"Invalid regular expression: {e}") from None
    deadline = time.monotonic() + REGEX_TIMEOUT

    def search(s: str):
        try:
            m = pattern.search(s, timeout=max(deadline - time.monotonic(), 0.001))
        except TimeoutError:
            raise store.ValidationError("Regex search timed out.") from None
        return (m.start(), m.end() - m.start()) if m else None
    return search


def _raw_hits(pool: _Pool, term: Term, fields: tuple[str, ...]) -> dict[str, _Hit]:
    """Notes whose compacted body or extra holds the phrase (case-insensitively)
    or matches the regex."""
    if term.match == "regex":
        find = _regex_search(term)
    else:
        needle = term.value.lower()

        def find(s: str):
            i = s.lower().find(needle)
            return (i, len(needle)) if i != -1 else None

    out = {}
    for name in sorted(pool.notes):
        e = pool.notes[name]
        body = find(e.body_compact) if "body" in fields else None
        extra = find(e.extra_compact) if "extra" in fields else None
        if body or extra:
            out[name] = _Hit(_Raw(body, extra), None, len(out))
    return out


def _extra_only(e, q: _Fuzzy) -> tuple[str, str, bool]:
    """The folded body and extra, and whether the query is only in the extra."""
    body, extra = normalize(e.body), normalize(e.extra)
    occurs = lambda hay: q.normalized in hay or any(t in hay for t in q.tokens)
    return body, extra, not occurs(body) and occurs(extra)


def _score(pool: _Pool, name: str, hit: _Hit, rank: int) -> float:
    e = pool.notes[name]
    score = 1000 - rank * 5 + min(pool.degree(name), 24)
    if hit.raw is not None:
        if hit.raw.body is not None:
            score += 140
        elif hit.raw.extra is not None:
            score -= EXTRA_ONLY_RANK_PENALTY
    elif hit.fuzzy is not None:
        q = hit.fuzzy
        body, extra, extra_only = _extra_only(e, q)
        if q.normalized in body:
            score += 140
        matching = [t for t in q.tokens if t in body or t in extra]
        score += len(matching) * 35
        if len(q.tokens) > 1 and len(matching) == len(q.tokens):
            score += 120
        if extra_only:
            score -= EXTRA_ONLY_RANK_PENALTY
    return score


def _ordered(pool: _Pool, ix, query) -> list[tuple[str, _Hit]]:
    hits = list(_evaluate(pool, ix, query, "content").items())
    head = sorted(((n, h, _score(pool, n, h, i)) for i, (n, h) in enumerate(hits[:RERANKED_HEAD_SIZE])),
                  key=lambda x: (-x[2], x[0]))
    return [(n, h) for n, h, _ in head] + hits[RERANKED_HEAD_SIZE:]


def _parsed(pool: _Pool, ix, q: str, regex_terms: bool) -> list[tuple[str, _Hit]]:
    try:
        query = parse_query(q, regex_terms)
    except IncompleteQuery:
        return []
    return _ordered(pool, ix, query)


def _newest(pool: _Pool) -> list[tuple[str, _Hit]]:
    names = sorted(pool.notes, key=lambda n: (-pool.notes[n].mtime_ns, n))
    return [(n, _Hit(None, None, i)) for i, n in enumerate(names)]


def _orphan(value: str):
    if value not in ("any", "orphan", "connected"):
        raise store.ValidationError(f"invalid orphan filter '{value}'")
    return lambda pool, n: value == "any" or (pool.degree(n) == 0) == (value == "orphan")


def _matches(q: str, scope: str, orphan: str, regex_terms: bool, semantic_search: bool,
             exclude) -> tuple[_Pool, list[tuple[str, _Hit]], dict | None]:
    """The scope's notes matching `q`, in order, and the semantic ranking's
    status when it was asked for."""
    q = q.strip()
    keep = _orphan(orphan)
    excluded = set(exclude)
    with store.index(SEARCH_MAX_AGE) as ix:
        pool = _pool(ix, scope)
        pool.notes = {n: e for n, e in pool.notes.items() if n not in excluded and keep(pool, n)}
        if not q:
            return pool, _newest(pool), None
        if not semantic_search:
            return pool, _parsed(pool, ix, q, regex_terms), None
    # embedding the query is slow: not while holding the index
    try:
        ranked = semantic.rank(q, {n: e.body for n, e in pool.notes.items()})
        return pool, [(n, _Hit(None, None, i)) for i, n in enumerate(ranked)], semantic.status()
    except llm.Unavailable as e:
        status = semantic.status() | {"error": str(e), "missing_model": semantic.MODEL if isinstance(e, llm.ModelMissing) else None}
    with store.index(SEARCH_MAX_AGE) as ix:
        return pool, _parsed(pool, ix, q, regex_terms), status


def search(q: str = "", scope: str = "all", orphan: str = "any", page: int = 0, regex_terms: bool = True,
           semantic_search: bool = False, exclude=(), limit: int = PAGE_SIZE) -> dict:
    """One page of `limit` notes of `scope` matching `q`, each with where it
    matched; without a query, the newest first. With `semantic_search`, ranked
    by similarity to `q` instead (see semantic), and `semantic` holds the
    embedding's status; when the query can't be embedded, the query language
    applies and `semantic.error` says why. `total` counts all matches."""
    pool, hits, status = _matches(q, scope, orphan, regex_terms, semantic_search, exclude)
    limit, page = max(limit, 1), max(page, 0)
    start = page * limit
    entries = store._INDEX.refresh(SEARCH_MAX_AGE)
    return {"results": [_result(pool, entries, n, h) for n, h in hits[start : start + limit]], "total": len(hits),
            "page": page, "pageSize": limit, "semantic": status}


def filenames(q: str, scope: str = "all", orphan: str = "any", cap: int = PIN_ALL_CAP,
              semantic_search: bool = False) -> dict:
    """The first `cap` matches, in `search`'s order, and how many there are."""
    _, hits, _ = _matches(q, scope, orphan, True, semantic_search, ())
    return {"filenames": [n for n, _ in hits[: max(cap, 0)]], "total": len(hits)}


# --- match display ------------------------------------------------------------


def _u16(text: str, start: int, length: int) -> dict:
    """A range of `text` in UTF-16 units, as the client's strings count."""
    astral = lambda s: sum(ord(c) > 0xFFFF for c in s)
    return {"start": start + astral(text[:start]), "length": length + astral(text[start : start + length])}


def _result(pool: _Pool, entries: dict, name: str, hit: _Hit) -> dict:
    """The note (see store.payload) with where the query matched: `match`, the
    matched text, when it shows in the first line; else `excerpt`, the text around it."""
    e = pool.notes[name]
    out = store._note(name, entries) | {"match": None, "excerpt": None}
    located = _locate(e, hit)
    if located is None:
        return out
    field, (start, length) = located
    first_line = min(len(store._SPACE_RE.sub(" ", e.heading)), FIRST_LINE_LENGTH)
    if field == "body" and start + length <= first_line:
        out["match"] = e.body_compact[start : start + length]
        return out
    source = e.body_compact if field == "body" else e.extra_compact
    length = min(length, EXCERPT_MAX_MATCH)
    lo, hi = max(0, start - EXCERPT_CONTEXT), min(len(source), start + length + EXCERPT_CONTEXT)
    text = (ELLIPSIS if lo > 0 else "") + source[lo:hi] + (ELLIPSIS if hi < len(source) else "")
    out["excerpt"] = {"text": text, "match": _u16(text, (1 if lo > 0 else 0) + start - lo, length)}
    return out


def _locate(e, hit: _Hit) -> tuple[str, tuple[int, int]] | None:
    if hit.raw is not None:
        if hit.raw.body is not None:
            return "body", hit.raw.body
        return ("extra", hit.raw.extra) if hit.raw.extra is not None else None
    if hit.fuzzy is None:
        return None
    _, _, extra_only = _extra_only(e, hit.fuzzy)
    field = "extra" if extra_only else "body"
    found = _locate_fuzzy(e.extra_compact if extra_only else e.body_compact, hit.fuzzy)
    return (field, found) if found else None


def _locate_fuzzy(compact: str, q: _Fuzzy) -> tuple[int, int] | None:
    """The whole phrase if it occurs, else the earliest token; found on folded
    text but returned in `compact`'s own positions."""
    spans: list[tuple[int, int]] = []
    folded = []
    for i, c in enumerate(compact):
        f = normalize(c)
        spans.extend([(i, i + 1)] * len(f))
        folded.append(f)
    hay = "".join(folded)

    def earliest(needles):
        found = [(hay.find(n), len(n)) for n in needles if n and n in hay]
        return min(found) if found else None

    hit = earliest([q.normalized]) or earliest(q.tokens)
    if hit is None:
        return None
    start, end = spans[hit[0]][0], spans[hit[0] + hit[1] - 1][1]
    return start, end - start


