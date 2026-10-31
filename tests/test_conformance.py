"""Run spec/examples against dsl.py and flashcards.py (see the spec's Conformance section)."""

import json
from pathlib import Path

import pytest

from dsl_crud.core import dsl, flashcards

SCHEMA = dsl.load_schema()
EXAMPLES = Path(__file__).parent.parent / "spec" / "examples"
CASES = sorted(EXAMPLES.glob("*.txt"))


def _clause(c: dsl.Clause) -> dict:
    return {"keyword": c.keyword, "line": c.line, "args": c.args, "options": c.options}


def _diagnostics(ds: list[dsl.Diagnostic]) -> list[dict]:
    return sorted(({"code": d.code, "line": d.line} for d in ds), key=lambda d: (d["line"] or 0, d["code"]))


def _publish(doc: dsl.Document) -> dict | None:
    if "publish" not in doc.blocks:
        return None
    route = next((c.args[0] for c in doc.clauses if c.keyword == "publish"), None)
    return {"route": route, "text": "\n".join(doc.blocks["publish"])}


def _result(doc: dsl.Document, text: str) -> dict:
    return {
        "body": "\n".join(doc.body) if doc.body else None,
        "clauses": [_clause(c) for c in doc.clauses],
        "relations": [{"label": r.label, "target": r.target, "line": r.line} for r in doc.relations],
        "state": [_clause(c) for c in doc.state],
        "unknown": doc.unknown,
        "extra": None if doc.extra is None else "\n".join(doc.extra),
        "publish": _publish(doc),
        "data": doc.data,
        "errors": _diagnostics(doc.errors),
        "warnings": _diagnostics(doc.warnings),
        "flashcards": [{"front": c.front, "back": c.back, "line": c.line + 1} for c in flashcards.cards(SCHEMA, text)],
    }


@pytest.mark.parametrize("case", CASES, ids=lambda p: p.stem)
def test_example(case: Path):
    expected = json.loads(case.with_suffix(".json").read_text(encoding="utf-8"))
    text = case.read_text(encoding="utf-8")
    actual = _result(dsl.parse(SCHEMA, text), text)
    assert {k: actual[k] for k in expected} == expected
