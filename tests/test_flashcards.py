import json
from datetime import datetime, timedelta, timezone

import pytest

from dsl_crud.application import create_app
from dsl_crud.core import file_kinds, flashcards
from dsl_crud.features.learn import service as learn
from dsl_crud.infrastructure import config, items as store, markdown, media

SCHEMA = store.SCHEMA
NOW = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def test_card_id_ignores_trailing_whitespace_and_blank_ends():
    assert flashcards.card_id("a  \nb\n\n") == flashcards.card_id("a\nb")
    assert flashcards.card_id("a") != flashcards.card_id("b")


def test_cards_keep_the_back_out_of_the_id():
    [one] = flashcards.cards(SCHEMA, "N\n::q::a\n")
    [two] = flashcards.cards(SCHEMA, "N\n::q::other\n")
    assert one.id == two.id


def test_section_opener_inside_a_card_ends_the_body():
    assert flashcards.cards(SCHEMA, "N\n::\nq\ntags x\n---\na\n::\n") == []
    assert flashcards.cards(SCHEMA, "N\n::\nq\n tags x\n---\na\n::\n")[0].front == "q\n tags x"


def test_flashcard_files_are_hidden():
    assert file_kinds.kind("files/flashcards/a-0123456789ab.json") is file_kinds.FLASHCARD
    assert file_kinds.kind("files/other.json") is file_kinds.OTHER


def test_markdown_renders_cards():
    html = markdown.render("a\n::q::**b**\nc")
    assert '<div class="flashcard">\n<p>q</p>\n<hr>\n<p><strong>b</strong></p>\n</div>' in html
    assert html.startswith("<p>a</p>") and html.endswith("<p>c</p>\n")


def test_nothing_to_learn():
    note("a", "A\n")
    assert learn.next_card(NOW) | {"counts": None} == {
        "card": None, "item": None, "counts": None, "next_due": None}


def test_new_card_is_offered():
    note("a", "A\n::q::a\n")
    out = learn.next_card(NOW)
    assert out["card"] | {"id": None} == {"file": "a.txt", "id": None, "front": "q", "back": "a", "state": "new"}
    assert out["item"]["file"] == "a.txt"
    assert out["counts"] == {"due": 0, "new": 1, "total": 1}


def test_review_writes_state_and_names_it_once(data_dir):
    note("a", "A\n::q::a\n::r::b\n")
    card_id = flashcards.card_id("q")
    rel = learn.state_file("a.txt", card_id)
    learn.review("a.txt", card_id, "good", NOW)
    text = store.get("a.txt")["text"]
    assert f"media {rel}" in text
    state = json.loads((data_dir / rel).read_text())
    assert state["front"] == "q" and len(state["reviews"]) == 1
    mtime = (data_dir / "a.txt").stat().st_mtime_ns
    learn.review("a.txt", card_id, "good", NOW + timedelta(minutes=20))
    assert (data_dir / "a.txt").stat().st_mtime_ns == mtime
    assert len(json.loads((data_dir / rel).read_text())["reviews"]) == 2
    assert store.get("a.txt")["files"] == [rel]


def test_due_card_comes_before_new_ones():
    note("a", "A\n::q::a\n" + "".join(f"::n{i}::x\n" for i in range(20)))
    card_id = flashcards.card_id("q")
    learn.review("a.txt", card_id, "again", NOW)
    later = NOW + timedelta(days=1)
    out = learn.next_card(later)
    assert out["card"]["id"] == card_id and out["card"]["state"] != "new"
    assert out["counts"] == {"due": 1, "new": 20, "total": 21}


def test_reviewed_card_not_due_yet():
    note("a", "A\n::q::a\n")
    out = learn.review("a.txt", flashcards.card_id("q"), "easy", NOW)
    assert out["card"] is None and out["counts"] == {"due": 0, "new": 0, "total": 1}
    assert datetime.fromisoformat(out["next_due"]) > NOW


def test_state_of_a_removed_card_is_dropped(data_dir):
    note("a", "A\n::q::a\n::r::b\n")
    old = flashcards.card_id("q")
    learn.review("a.txt", old, "good", NOW)
    store.update("a.txt", {"text": store.get("a.txt")["text"].replace("::q::a", "::q2::a")})
    learn.review("a.txt", flashcards.card_id("r"), "good", NOW)
    files = store.get("a.txt")["files"]
    assert files == [learn.state_file("a.txt", flashcards.card_id("r"))]
    assert not (data_dir / learn.state_file("a.txt", old)).exists()


def test_review_of_a_missing_card_or_bad_rating():
    note("a", "A\n::q::a\n")
    with pytest.raises(store.NotFound):
        learn.review("a.txt", "0123456789ab", "good", NOW)
    with pytest.raises(store.ValidationError):
        learn.review("a.txt", flashcards.card_id("q"), "meh", NOW)


def test_routes():
    note("a", "A\n::q::a\n")
    client = create_app().test_client()
    out = client.get("/api/learn/next").get_json()
    assert out["card"]["front"] == "q"
    res = client.post("/api/learn/review", json={"file": "a.txt", "id": out["card"]["id"], "rating": "good"})
    assert res.status_code == 200 and res.get_json()["counts"]["total"] == 1
    assert client.post("/api/learn/review", json={"file": "a.txt", "id": "x", "rating": "good"}).status_code == 404
    assert media.exists(learn.state_file("a.txt", out["card"]["id"]))
