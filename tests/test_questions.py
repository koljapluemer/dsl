import pytest

import dsl
import llm
import questions
import store

SCHEMA = store.SCHEMA


def parse(text):
    return dsl.parse(SCHEMA, text)


@pytest.mark.parametrize("text", [
    "a > b",
    "a > b\nmore body",
    "a ~ b\nrecurring mo",
    "a > b\nextra\nlong text\n",
    "a > b\ndata\nk: v\n",
    "a > b\n-> rel @x\n",
])
def test_add_relation_parses_cleanly(text):
    out = questions.add_relation(text, "experts on this:", "target-123abc")
    doc = parse(out)
    assert not doc.diagnostics
    assert doc.relations[-1].label == "experts on this:"
    assert doc.relations[-1].target == "target-123abc"
    assert doc.body == parse(text).body
    assert doc.blocks == parse(text).blocks


def test_add_tag_extends_existing_tags_line():
    out = questions.add_tag(SCHEMA, "a > b\ntags x y\nrecurring mo\n", "no-questions")
    assert out == "a > b\ntags x y no-questions\nrecurring mo\n"
    assert questions.add_tag(SCHEMA, out, "no-questions") == out


@pytest.mark.parametrize("text, out", [
    ("a\ntags x t y\n", "a\ntags x y\n"),
    ("a\ntags t\nrecurring mo\n", "a\nrecurring mo\n"),
    ("a\ntags x\n", "a\ntags x\n"),
    ("a\n", "a\n"),
])
def test_remove_tag(text, out):
    assert questions.remove_tag(SCHEMA, text, "t") == out


@pytest.mark.parametrize("text", ["a > b", "a > b\nextra\nlong\n", "a > b\n-> r @x"])
def test_add_tag_appends_tags_line(text):
    doc = parse(questions.add_tag(SCHEMA, text, "no-questions"))
    assert not doc.diagnostics
    assert [c.args for c in doc.clauses if c.keyword == "tags"] == [["no-questions"]]
    assert doc.blocks == parse(text).blocks


@pytest.mark.parametrize("text,expected", [
    ("a > b", True),
    ("a ~ b", True),
    ("plain", False),
    ("plain\nrecurring mo\n-> r @x", False),  # marker only outside the body
    ("a > b\n-> r @x", True),
    ("a > b\n-> r @x\n-> s @y", False),
    ("a > b\ntags no-questions", False),
    ("a > b\ntags other", True),
])
def test_is_candidate(text, expected):
    assert questions.is_candidate(parse(text)) is expected


QS = [{"id": k, "question": f"q {k}?", "label": k} for k in ("a", "b", "c", "so-what", "what")]


def test_pick_skips_llm_when_nothing_to_choose(monkeypatch):
    monkeypatch.setattr(questions, "QUESTIONS", QS[:3])
    monkeypatch.setattr(llm, "_post", lambda *a, **k: pytest.fail("LLM called"))
    assert questions.pick("note") == ["a", "b", "c"]


def test_pick_asks_pinned_model_once(monkeypatch):
    monkeypatch.setattr(questions, "QUESTIONS", QS)
    monkeypatch.setattr(questions, "_cache", {})
    calls = []

    def post(path, body, timeout):
        calls.append(body)
        return {"message": {"content": '{"ids": ["what", "zzz", "b", "what", "a", "c"]}'}}

    monkeypatch.setattr(llm, "_post", post)
    assert questions.pick("note text") == ["what", "b", "a"]
    assert questions.pick("note text") == ["what", "b", "a"]
    assert len(calls) == 1
    assert calls[0]["model"] == questions.MODEL
    assert calls[0]["format"]["properties"]["ids"]["items"]["enum"] == [q["id"] for q in QS]
    assert calls[0]["think"] is False


@pytest.mark.parametrize("reply,expected", [
    ('{"ids": []}', []),
    ('{"ids": ["so-what", "a"]}', ["so-what", "a"]),
    ("so-what, what and b", ["so-what", "what", "b"]),  # ids as words, not inside each other
    ("```json\n[\"c\", \"a\"]\n```", ["c", "a"]),
    ("a b c so-what", ["a", "b", "c"]),
])
def test_ids_in_reply(reply, expected):
    assert questions._ids_in(reply, [q["id"] for q in QS]) == expected


def test_reply_without_ids_is_unavailable():
    with pytest.raises(llm.Unavailable):
        questions._ids_in("7, 9, 11", [q["id"] for q in QS])


def test_unreachable_server_is_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "url", lambda: "http://127.0.0.1:9")
    with pytest.raises(llm.Unavailable):
        llm.models()


def test_questions_have_unique_ids():
    ids = [q["id"] for q in questions.QUESTIONS]
    assert len(set(ids)) == len(ids)


@pytest.mark.parametrize("q", questions.QUESTIONS, ids=lambda q: q["id"])
def test_question_labels_round_trip(q):
    rel = parse(questions.add_relation("a > b", q["label"], "x-123abc")).relations[-1]
    assert (rel.label, rel.target) == (q["label"], "x-123abc")
