"""Run spec/examples against dsl.py (see the spec's Conformance section)."""

import json
from pathlib import Path

import pytest

from dsl_crud.core import dsl

SCHEMA = dsl.load_schema()
EXAMPLES = Path(__file__).parent.parent / "spec" / "examples"
CASES = sorted(EXAMPLES.glob("*.txt"))


def _clause(c: dsl.Clause) -> dict:
    return {"keyword": c.keyword, "line": c.line, "args": c.args, "options": c.options}


def _diagnostics(ds: list[dsl.Diagnostic]) -> list[dict]:
    return sorted(({"code": d.code, "line": d.line} for d in ds), key=lambda d: (d["line"] or 0, d["code"]))


def _result(doc: dsl.Document) -> dict:
    return {
        "body": "\n".join(doc.body) if doc.body else None,
        "clauses": [_clause(c) for c in doc.clauses],
        "relations": [{"label": r.label, "target": r.target, "line": r.line} for r in doc.relations],
        "state": [_clause(c) for c in doc.state],
        "unknown": doc.unknown,
        "extra": None if doc.extra is None else "\n".join(doc.extra),
        "data": doc.data,
        "errors": _diagnostics(doc.errors),
        "warnings": _diagnostics(doc.warnings),
    }


@pytest.mark.parametrize("case", CASES, ids=lambda p: p.stem)
def test_example(case: Path):
    expected = json.loads(case.with_suffix(".json").read_text(encoding="utf-8"))
    actual = _result(dsl.parse(SCHEMA, case.read_text(encoding="utf-8")))
    assert {k: actual[k] for k in expected} == expected
