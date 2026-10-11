from pathlib import Path

import pytest

import dsl

SCHEMA = dsl.load_schema()
UPSTREAM = Path(__file__).parent.parent.parent / "dsl" / "spec" / "keywords.yaml"


def errors(text: str) -> list[str]:
    doc = dsl.parse(SCHEMA, text)
    assert not doc.valid, text
    return [f"{d.code}@{d.line}" for d in doc.errors]


def valid(text: str) -> dsl.Document:
    doc = dsl.parse(SCHEMA, text)
    assert doc.valid, doc.errors
    return doc


def test_title_is_never_parsed_for_keywords():
    assert valid("appointment w/ dentist\nappointment 26-10-12").title == "appointment w/ dentist"


def test_only_a_primary_at_column_0_starts_the_keyword_section():
    doc = valid("x\niterable is not a primary\n  recurring, indented\nrecurring mo")
    assert doc.description == ["iterable is not a primary", "  recurring, indented"]
    assert doc.clauses[0].keyword == "recurring"


def test_description_keeps_inner_blank_lines_and_trailing_spaces():
    assert valid("\n\nx\n\na \n\nb\n\nappointment 26-10-12\n").description == ["a ", "", "b"]


def test_several_clauses_on_one_line():
    doc = dsl.parse(SCHEMA, "x\nappointment 26-10-12 recurring mo")
    assert [c.keyword for c in doc.clauses] == ["appointment", "recurring"]


def test_unknown_keyword_keeps_rest_of_line():
    doc = valid('x\nrecurring mo until 27-03\nprio 7 "some text"\n(next "call")')
    assert doc.clauses[0].options == {"until": "27-03"}
    assert doc.unknown == ['prio 7 "some text"', '(next "call")']
    assert [d.code for d in doc.warnings] == ["unknown_keyword"] * 2


@pytest.mark.parametrize("text, expected", [
    (" \n\n", ["empty@None"]),
    ("x\nprio 3", ["no_primary@None"]),
    ("x\nappointment", ["missing_arg@2"]),
    ("x\nappointment recurring mo", ["missing_arg@2"]),
    ("x\nrecurring mo until", ["missing_arg@2"]),
    ("x\nappointment 26-02-30", ["invalid_value@2"]),
    ("x\nrecurring xx", ["invalid_value@2"]),
    ("x\nrecurring mo until 27-13", ["invalid_value@2"]),
    ("x\nappointment 26-10-12 5pm", ["unexpected_token@2"]),
    ("x\nrecurring mo\nrecurring tu", ["duplicate_keyword@3"]),
    ("x\nrecurring mo until 27-03 until 27-04", ["duplicate_keyword@2"]),
    ("x\nappointment 26-10-12\nrecurring mo", ["conflicting_keywords@3"]),
])
def test_errors(text, expected):
    assert errors(text) == expected


@pytest.mark.skipif(not UPSTREAM.exists(), reason="no ../dsl")
def test_vendored_schema_matches_dsl_repo():
    assert dsl.SPEC_PATH.read_text() == UPSTREAM.read_text(), "run `just sync-spec`"
