import os
import re
import threading

import pytest

from dsl_crud.core import documents as views
from dsl_crud.features.questions import service as questions
from dsl_crud.infrastructure import config, items as store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def test_config_reads_stay_whole_during_writes(data_dir):
    stop = threading.Event()

    def write():
        while not stop.is_set():
            config.update({"graph": {"pins": [{"filename": "x.txt", "depth": 1}] * 50}})

    t = threading.Thread(target=write)
    t.start()
    try:
        paths = {config.get_path() for _ in range(2000)}
    finally:
        stop.set()
        t.join()
    assert paths == {data_dir.resolve()}


def test_create_names_file_slug_hex(data_dir):
    a = store.create({"text": "HCI lecture 4pm\nrecurring mo"})
    b = store.create({"text": "HCI lecture 4pm\nrecurring mo"})
    assert re.fullmatch(r"hci-lecture-4pm-[0-9a-f]{6}\.txt", a["file"])
    assert a["file"] != b["file"]
    assert (data_dir / a["file"]).read_text() == "HCI lecture 4pm\nrecurring mo\n"
    assert not a["errors"]


def test_name_stays_when_text_changes(data_dir):
    a = store.create({"text": "a\nrecurring mo"})
    assert store.update(a["file"], {"text": "b\nrecurring tu"})["file"] == a["file"]
    assert [p.name for p in data_dir.iterdir()] == [a["file"]]


def test_invalid_text_is_kept(data_dir):
    item = store.create({"text": "x\nappointment 26-02-30"})
    assert [e["code"] for e in item["errors"]] == ["invalid_value"]
    assert (data_dir / item["file"]).read_text() == "x\nappointment 26-02-30\n"


def test_restore_and_delete(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    with pytest.raises(store.Conflict):
        store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    store.delete("a.txt")
    with pytest.raises(store.NotFound):
        store.delete("a.txt")
    with pytest.raises(store.NotFound):
        store.update("a.txt", {"text": "a"})


def test_lists_only_txt_directly_inside(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    (data_dir / "notes.md").write_text("x")
    (data_dir / "sub").mkdir()
    (data_dir / "sub" / "b.txt").write_text("b\nrecurring mo")
    assert [i["file"] for i in store.list_page()["items"]] == ["a.txt"]


def test_pages_filters_and_flags(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 2)
    for k in "abcde":
        store.create({"file": f"{k}.txt", "text": f"note {k}\n" + ("appointment 26-02-30" if k == "d" else "")})
    pages = [store.list_page(page=p) for p in range(3)]
    assert [len(p["items"]) for p in pages] == [2, 2, 1]
    assert sorted(i["file"] for p in pages for i in p["items"]) == ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]
    assert (pages[0]["total"], pages[0]["flagged"]) == (5, 1)
    assert [i["file"] for i in store.list_page(attention=True)["items"]] == ["d.txt"]
    store.update("d.txt", {"text": "note d\nappointment 26-02-28"})
    assert store.list_page(attention=True)["total"] == 0
    store.delete("e.txt")
    assert store.list_page()["total"] == 4


def test_order_is_shuffled_by_seed(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 100)
    for k in range(20):
        store.create({"file": f"{k:02}.txt", "text": f"note {k}"})
    order = lambda seed: [i["file"] for i in store.list_page(seed=seed)["items"]]
    assert order(1) == order(1)
    assert order(1) != order(2)
    assert order(1) != sorted(order(1))


def test_refs_carry_target_headings(data_dir):
    store.create({"file": "a.txt", "text": "Alpha\n-> see @b\n-> gone @x"})
    store.create({"file": "b.txt", "text": "Beta heading\nbody"})
    item = next(i for i in store.list_page()["items"] if i["file"] == "a.txt")
    assert item["refs"] == {"b": "Beta heading", "x": None}


def test_inline_refs_carry_headings_and_backlinks_are_explicit(data_dir):
    store.create({"file": "a.txt", "text": "Alpha [[b]] and [[gone|missing]]\nextra\nagain [[b]]"})
    store.create({"file": "b.txt", "text": "Beta heading"})
    item = store.get_payload("a.txt")
    assert item["refs"] == {"b": "Beta heading", "gone": None}
    assert store.backlinks("b.txt") == [
        {"file": "a.txt", "label": "", "heading": "Alpha [[b]] and [[gone|missing]]", "inline": True}
    ]


def test_get(data_dir):
    store.create({"file": "a.txt", "text": "a"})
    assert store.get("a.txt")["text"] == "a\n"
    with pytest.raises(store.NotFound):
        store.get("b.txt")


def test_unchanged_write_keeps_mtime(data_dir):
    store.create({"file": "a.txt", "text": "a\nrecurring mo"})
    os.utime(data_dir / "a.txt", ns=(0, 0))
    store.update("a.txt", {"text": "a\nrecurring mo"})
    assert (data_dir / "a.txt").stat().st_mtime_ns == 0
    store.update("a.txt", {"text": "a\nrecurring tu"})
    assert (data_dir / "a.txt").stat().st_mtime_ns != 0


@pytest.mark.parametrize("body", [
    {"file": "../x.txt", "text": "x"}, {"file": ".h.txt", "text": "x"}, {"file": "a/b.txt", "text": "x"},
    {"text": "  \n"}, {},
])
def test_invalid(body):
    with pytest.raises(store.ValidationError):
        store.create(body)


def test_tasks_filter(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 2)
    for k in "abcde":
        store.create({"file": f"{k}.txt", "text": f"note {k}\n" + ("tasks clean up" if k in "bd" else "")})
    r = store.list_page(tasks=True)
    assert sorted(i["file"] for i in r["items"]) == ["b.txt", "d.txt"]
    assert r["total"] == 2 and r["tasks"] == 2
    store.update("d.txt", {"text": "note d\ntasks clean up\nappointment 26-02-30"})
    assert [i["file"] for i in store.list_page(tasks=True, attention=False)["items"]] == ["b.txt"]
    assert store.list_page()["total"] == 5


def test_random_candidate(data_dir):
    store.create({"file": "a.txt", "text": "a > b"})
    store.create({"file": "b.txt", "text": "b ~ c\n-> r @a"})
    store.create({"file": "c.txt", "text": "plain"})
    store.create({"file": "d.txt", "text": "d > e\ntags no-questions"})
    assert questions.random_candidate(["a.txt"])["item"]["file"] == "b.txt"
    assert questions.random_candidate(["a.txt"])["item"]["refs"] == {"a": "a > b"}
    assert questions.random_candidate(["a.txt", "b.txt"])["item"]["file"] in ("a.txt", "b.txt")
    assert questions.random_candidate()["total"] == 2
    store.delete("a.txt")
    store.delete("b.txt")
    assert questions.random_candidate() == {"item": None, "total": 0}


def test_answer_links_existing_and_new(data_dir):
    store.create({"file": "a.txt", "text": "a > b"})
    store.create({"file": "x.txt", "text": "X person"})
    res = questions.answer("a.txt", {"qid": "experts", "target": "x.txt"})
    assert res["target"] == {"file": "x.txt", "heading": "X person"}
    assert res["refs"] == {"x": "X person"}
    res = questions.answer("a.txt", {"qid": "solves", "text": "Some problem"})
    new = res["target"]["file"]
    assert (data_dir / "a.txt").read_text() == f"a > b\n-> experts on this: @x\n-> solves @{new[:-4]}\n"
    assert (data_dir / new).read_text() == "Some problem\n"
    with pytest.raises(store.ValidationError):
        questions.answer("a.txt", {"qid": "nope", "text": "t"})
    with pytest.raises(store.NotFound):
        questions.answer("a.txt", {"qid": "solves", "target": "missing.txt"})
    with pytest.raises(store.ValidationError):
        questions.answer("a.txt", {"qid": "solves", "text": " "})


def test_relate_with_any_label(data_dir):
    store.create({"file": "a.txt", "text": "a > b"})
    store.create({"file": "x.txt", "text": "X person"})
    res = store.relate("a.txt", {"label": " knows ", "target": "x.txt"})
    assert res["refs"] == {"x": "X person"}
    res = store.relate("a.txt", {"label": "", "text": "Other"})
    new = res["target"]["file"]
    assert (data_dir / "a.txt").read_text() == f"a > b\n-> knows @x\n-> @{new[:-4]}\n"
    with pytest.raises(store.ValidationError):
        store.relate("a.txt", {"label": "a\nb", "target": "x.txt"})
    with pytest.raises(store.ValidationError):
        store.relate("a.txt", {"target": "x.txt"})


def test_payload(data_dir):
    store.create({"file": "x.txt", "text": "X person\nmore"})
    item = store.create({"file": "a.txt", "text": "a > b\n-> knows @x\n-> @gone\n"})
    assert store.payload(item)["refs"] == {"gone": None, "x": "X person"}
    assert item["sourceKey"] is None
    store.create({"file": "s.txt", "text": "S\nsource\ndata\nkey: vaswani2017\n"})
    store.create({"file": "t.txt", "text": "T\nsource\ndata\nentrytype: misc\n"})
    store.create({"file": "u.txt", "text": "U\nsource\ndata\nkey: [unclosed\n"})
    assert [store.get_payload(f"{k}.txt")["sourceKey"] for k in "stu"] == ["vaswani2017", "t", "u"]


def test_relabel_and_tags(data_dir):
    store.create({"file": "a.txt", "text": "a\n-> knows @x\n-> knows @x\n"})
    assert store.relabel("a.txt", {"label": "knows", "target": "x", "nextLabel": " met "})["text"] == "a\n-> met @x\n-> knows @x\n"
    assert store.relabel("a.txt", {"label": "met", "target": "x", "nextLabel": ""})["text"] == "a\n-> @x\n-> knows @x\n"
    with pytest.raises(store.NotFound):
        store.relabel("a.txt", {"label": "met", "target": "x", "nextLabel": "y"})
    with pytest.raises(store.ValidationError):
        store.relabel("a.txt", {"label": "knows", "target": "x", "nextLabel": "a\nb"})
    store.create({"file": "i.txt", "text": "Login\nissue\ntags x"})
    assert store.set_tag("i.txt", {"tag": "suggest-think-and-sketch", "on": True})["text"].rstrip("\n") == "Login\nissue\ntags x suggest-think-and-sketch"
    assert store.set_tag("i.txt", {"tag": "suggest-think-and-sketch", "on": False})["text"].rstrip("\n") == "Login\nissue\ntags x"
    with pytest.raises(store.ValidationError):
        store.set_tag("i.txt", {"tag": "Not A Tag", "on": True})


def test_detach_removes_first_match(data_dir):
    store.create({"file": "a.txt", "text": "a > b\n-> knows @x\n-> @x\n-> knows @x\n"})
    res = store.detach("a.txt", {"label": "knows", "target": "x"})
    assert res["text"] == "a > b\n-> @x\n-> knows @x\n"
    res = store.detach("a.txt", {"label": "", "target": "x"})
    assert res["text"] == "a > b\n-> knows @x\n"
    with pytest.raises(store.NotFound):
        store.detach("a.txt", {"label": "other", "target": "x"})


def test_backlinks(data_dir):
    store.create({"file": "x.txt", "text": "X person"})
    store.create({"file": "a.txt", "text": "A note\n-> knows @x\n-> @x\n"})
    store.create({"file": "b.txt", "text": "B note\n-> cites @x\n-> @other\n"})
    assert store.backlinks("x.txt") == [
        {"file": "a.txt", "label": "", "heading": "A note", "inline": False},
        {"file": "b.txt", "label": "cites", "heading": "B note", "inline": False},
        {"file": "a.txt", "label": "knows", "heading": "A note", "inline": False},
    ]
    with pytest.raises(store.NotFound):
        store.backlinks("missing.txt")


def test_backlink(data_dir):
    store.create({"file": "x.txt", "text": "X person"})
    store.create({"file": "a.txt", "text": "A note"})
    res = store.backlink("x.txt", {"label": " cites ", "source": "a.txt"})
    assert res == [{"file": "a.txt", "label": "cites", "heading": "A note", "inline": False}]
    assert (data_dir / "a.txt").read_text() == "A note\n-> cites @x\n"
    res = store.backlink("x.txt", {"label": "", "text": "New one"})
    new = next(b["file"] for b in res if b["heading"] == "New one")
    assert (data_dir / new).read_text() == "New one\n-> @x\n"
    with pytest.raises(store.ValidationError):
        store.backlink("x.txt", {"label": "a\nb", "source": "a.txt"})
    with pytest.raises(store.ValidationError):
        store.backlink("x.txt", {"label": "", "text": " "})
    with pytest.raises(store.NotFound):
        store.backlink("x.txt", {"label": "", "source": "missing.txt"})


def test_disable(data_dir):
    store.create({"file": "a.txt", "text": "a > b"})
    questions.disable("a.txt")
    assert (data_dir / "a.txt").read_text() == "a > b\ntags no-questions\n"
    assert questions.random_candidate()["total"] == 0


def test_set_llm(data_dir):
    config.set_llm({"url": " http://h:1 "})
    assert config.read()["llm"] == {"url": "http://h:1"}
    config.set_llm({"url": ""})
    assert config.read()["llm"] == {}
    assert config.get_path() == data_dir


def test_queue_skips_hidden_types_and_tags(data_dir):
    store.create({"file": "a.txt", "text": "a\nappointment 26-08-29"})
    store.create({"file": "b.txt", "text": "b"})
    store.create({"file": "c.txt", "text": "c"})
    store.set_tag("b.txt", {"tag": views.QUEUE_HIDING.tag, "on": True})
    assert store.get("b.txt")["text"] == "b\ntags no-q\n"
    for _ in range(5):
        res = store.queue_draw()
        assert [i["file"] for i in res["items"]] == ["c.txt"] and res["total"] == 1


def test_float_skips_hidden_and_filters(data_dir):
    store.create({"file": "a.txt", "text": "a apple\nappointment 26-08-29"})
    store.create({"file": "b.txt", "text": "b apple"})
    store.create({"file": "c.txt", "text": "c Apple"})
    store.create({"file": "d.txt", "text": "d pear"})
    store.set_tag("b.txt", {"tag": views.FLOAT_HIDING.tag, "on": True})
    assert store.get("b.txt")["text"] == "b apple\ntags no-float\n"
    res = store.float_draw(" apple")
    assert [i["file"] for i in res["items"]] == ["c.txt"] and res["total"] == 1
    assert sorted(i["file"] for i in store.float_draw()["items"]) == ["c.txt", "d.txt"]
    assert store.queue_draw()["total"] == 3


def test_tagged_items(data_dir):
    store.create({"file": "a.txt", "text": "a\ntags zero"})
    store.create({"file": "b.txt", "text": "b\ntags zeros x"})
    assert store.all_tags() == ["x", "zero", "zeros"]
    assert [i["file"] for i in store.tagged_items("zero")] == ["a.txt"]


def test_explorations_last_edited_first_and_not_in_queue(data_dir):
    store.create({"file": "a.txt", "text": "A\ntags exploration"})
    store.create({"file": "b.txt", "text": "B\ntags x exploration"})
    store.create({"file": "c.txt", "text": "C\ntags explorations"})
    os.utime(data_dir / "a.txt", ns=(2_000_000_000, 2_000_000_000))
    os.utime(data_dir / "b.txt", ns=(1_000_000_000, 1_000_000_000))
    assert [i["file"] for i in store.explorations()] == ["a.txt", "b.txt"]
    assert [i["file"] for i in store.queue_draw()["items"]] == ["c.txt"]


def test_goals_without_an_image_by_heading(data_dir):
    store.create({"file": "a.txt", "text": "b goal\ntags goal"})
    store.create({"file": "b.txt", "text": "A goal\ntags x goal\nmedia clip.mp4\nmedia notes.pdf"})
    store.create({"file": "c.txt", "text": "done\ntags goal\nmedia clip.mp4\nmedia photo.png"})
    store.create({"file": "d.txt", "text": "not one\ntags goals"})
    assert [i["file"] for i in store.goals()] == ["b.txt", "a.txt"]


def test_suggest_random_excludes_unless_only_one(data_dir):
    store.create({"file": "a.txt", "text": "a\ntags suggest-idea"})
    store.create({"file": "b.txt", "text": "b\ntags x suggest-idea"})
    store.create({"file": "c.txt", "text": "c\ntags suggest-other"})
    store.create({"file": "d.txt", "text": "d #suggest-hashtag\ntags other"})
    assert store.suggest_tags() == ["suggest-idea", "suggest-other"]
    assert store.suggest_random("suggest-idea", ["a.txt"])["file"] == "b.txt"
    assert store.suggest_random("suggest-other", ["c.txt"])["file"] == "c.txt"
    assert store.suggest_random("suggest-none") is None


def test_calendar_items(data_dir):
    store.create({"file": "a.txt", "text": "Lecture\n(bring laptop)\nrecurring mo until 26-03"})
    store.create({"file": "b.txt", "text": "plain"})
    store.create({"file": "c.txt", "text": "bad\nappointment 26-02-30"})
    [item] = store.calendar_items()
    assert (item["file"], item["when"]) == ("a.txt", {"recurring": 1, "until": "2026-03-31"})
    assert item["text"].startswith("Lecture\n")


def test_projects(data_dir):
    store.create({"file": "p.txt", "text": "Website\ntags project"})
    store.create({"file": "q.txt", "text": "Archive\ntags project"})
    store.create({"file": "i.txt", "text": "Login\nissue\n-> project @p"})
    store.create({"file": "j.txt", "text": "Both\nissue\n-> project @p\n-> project @q"})
    store.create({"file": "k.txt", "text": "Wrong label\nissue\n-> blocks @p"})
    store.create({"file": "l.txt", "text": "Not a project\nissue\n-> project @n"})
    store.create({"file": "m.txt", "text": "Sketch it\nissue\n-> project @p\ntags suggest-think-and-sketch"})
    store.create({"file": "n.txt", "text": "plain"})
    store.create({"file": "o.txt", "text": "Inline is not ownership [[p]]\nissue"})
    files = lambda items: [i["file"] for i in items]
    res = store.projects()
    assert [(p["file"], files(p["issues"])) for p in res["projects"]] == [
        ("q.txt", ["j.txt"]), ("p.txt", ["m.txt", "j.txt", "i.txt"])]
    assert files(res["orphans"]) == ["o.txt", "l.txt", "k.txt"]
    assert res["projects"][0]["text"] == "Archive\ntags project\n"


def test_item_endpoints(data_dir):
    from dsl_crud.application import app
    client = app.test_client()
    store.create({"file": "a.txt", "text": "a\n-> knows @x\n"})
    r = client.post("/api/items/a.txt/relabel", json={"label": "knows", "target": "x", "nextLabel": "met"})
    assert r.get_json()["text"] == "a\n-> met @x\n" and "refs" in r.get_json()
    r = client.put("/api/items/a.txt/tags", json={"tag": "no-q", "on": True})
    assert r.get_json()["text"] == "a\n-> met @x\ntags no-q\n"
    assert client.put("/api/items/a.txt/tags", json={"tag": "", "on": True}).status_code == 400
    for method, url in [("post", "/api/queue/hide/a.txt"), ("post", "/api/float/hide/a.txt"),
                        ("put", "/api/projects/think/a.txt"), ("get", "/api/sources/schema"), ("post", "/api/graph/notes")]:
        assert getattr(client, method)(url).status_code in (404, 405)
