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


def test_first_line_is_never_parsed_for_keywords():
    doc = valid("appointment w/ dentist\nappointment 26-10-12")
    assert doc.body == ["appointment w/ dentist"]
    assert doc.heading == "appointment w/ dentist"


def test_a_body_alone_is_a_valid_note():
    assert valid("just a thought\nprio 3").body == ["just a thought", "prio 3"]


def test_only_openers_at_column_0_start_the_keyword_section():
    doc = valid("x\niterable is not an opener\n  recurring, indented\nrecurring mo")
    assert doc.body == ["x", "iterable is not an opener", "  recurring, indented"]
    assert doc.clauses[0].keyword == "recurring"


def test_body_keeps_inner_blank_lines_and_trailing_spaces():
    assert valid("\n\nx\n\na \n\nb\n\nappointment 26-10-12\n").body == ["x", "", "a ", "", "b"]


def test_several_clauses_on_one_line():
    doc = dsl.parse(SCHEMA, "x\nappointment 26-10-12 recurring mo")
    assert [c.keyword for c in doc.clauses] == ["appointment", "recurring"]


def test_unknown_keyword_keeps_rest_of_line():
    doc = valid('x\nrecurring mo until 27-03\nprio 7 "some text"\n(next "call")')
    assert doc.clauses[0].options == {"until": "27-03"}
    assert doc.unknown == ['prio 7 "some text"', '(next "call")']
    assert [d.code for d in doc.warnings] == ["unknown_keyword"] * 2


@pytest.mark.parametrize("line, opens", [
    ("recurring mo", True),
    ("media x.png", True),
    ("extra", True),
    ("extra ", True),
    ("extras", False),
    ("extra credit", False),
    ("data", True),
    ("source", True),
    ("-> label @target-123456", True),
    ("-> do this next", False),
    ("->@x", False),
    ("(see email)", False),
    ("iterable d 4", False),
    (" recurring mo", False),
])
def test_is_section_opener(line, opens):
    assert dsl.is_section_opener(SCHEMA, line) is opens


@pytest.mark.parametrize("text, expected", [
    (" \n\n", ["empty@None"]),
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
    ("x\nmedia /a.png", ["invalid_value@2"]),
    ("x\nmedia a.png\n-> no target", ["invalid_relation@3"]),
    ("x\nmedia a.png\n(media b.png)", ["invalid_state@3"]),
    ("x\nextra\n", ["empty_extra@2"]),
    ("x\ndata\n\nmedia a.png", ["empty_data@2"]),
    ("x\ndata\na: [1", ["invalid_yaml@2"]),
    ("x\ndata\n- a", ["invalid_yaml@2"]),
    ("x\ndata\na: 1\ndata\na: 2", ["duplicate_keyword@4"]),
    ("x\nmedia a.png extra", ["unexpected_token@2"]),
])
def test_errors(text, expected):
    assert errors(text) == expected


@pytest.mark.skipif(not UPSTREAM.exists(), reason="no ../dsl")
def test_vendored_schema_matches_dsl_repo():
    assert dsl.SPEC_PATH.read_text() == UPSTREAM.read_text(), "run `just sync-spec`"


def test_text_argument_takes_the_rest_of_the_line():
    doc = valid("x\ntasks fix  media link recurring mo")
    assert [(c.keyword, c.args) for c in doc.clauses] == [("tasks", ["fix  media link recurring mo"])]


def test_text_argument_must_not_be_empty():
    assert errors("x\ntasks") == ["missing_arg@2"]
    assert errors("x\ntasks   ") == ["missing_arg@2"]


def test_tags_argument_is_one_arg_per_tag():
    doc = valid("x\ntags break 10k  do-this appointment")
    assert [(c.keyword, c.args) for c in doc.clauses] == [("tags", ["break", "10k", "do-this", "appointment"])]


def test_tags_must_be_lowercase_tags_and_start_their_line():
    assert errors("x\ntags Break") == ["invalid_value@2"]
    assert errors("x\ntags a_b") == ["invalid_value@2"]
    assert errors("x\ntags") == ["missing_arg@2"]
    assert errors("x\nmedia a.png tags a") == ["unexpected_token@2"]


def test_block_ends_at_next_keyword_and_section_resumes():
    doc = valid("x\nextra\nfree text\n media indented\nunknownword 1\nmedia a.png\ndata\na: 1")
    assert doc.extra == ["free text", " media indented", "unknownword 1"]
    assert [c.keyword for c in doc.clauses] == ["media"]
    assert doc.data == {"a": 1}


def test_yaml_dates_stay_strings():
    assert valid("x\ndata\ndate: 2017-06-12").data == {"date": "2017-06-12"}
