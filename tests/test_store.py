import os
import re

import pytest

import store
import views


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


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
    assert [i["file"] for i in store.list_page("NOTE C")["items"]] == ["c.txt"]
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


def test_focus_returns_its_page(data_dir, monkeypatch):
    monkeypatch.setattr(store, "PAGE_SIZE", 2)
    for k in "abcde":
        store.create({"file": f"{k}.txt", "text": f"note {k}"})
    for k in "abcde":
        res = store.list_page(seed=7, focus=f"{k}.txt")
        assert res["focused"]
        assert f"{k}.txt" in [i["file"] for i in res["items"]]
        assert res["page"] == next(p for p in range(3) if res["items"] == store.list_page(seed=7, page=p)["items"])
    assert not store.list_page("note a", focus="b.txt")["focused"]
    assert not store.list_page(focus="x.txt")["focused"]


def test_refs_carry_target_headings(data_dir):
    store.create({"file": "a.txt", "text": "Alpha\n-> see @b\n-> gone @x"})
    store.create({"file": "b.txt", "text": "Beta heading\nbody"})
    item = next(i for i in store.list_page()["items"] if i["file"] == "a.txt")
    assert item["refs"] == {"b": "Beta heading", "x": None}


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
    assert store.random_candidate(["a.txt"])["item"]["file"] == "b.txt"
    assert store.random_candidate(["a.txt"])["item"]["refs"] == {"a": "a > b"}
    assert store.random_candidate(["a.txt", "b.txt"])["item"]["file"] in ("a.txt", "b.txt")
    assert store.random_candidate()["total"] == 2
    store.delete("a.txt")
    store.delete("b.txt")
    assert store.random_candidate() == {"item": None, "total": 0}


def test_search_ranks_and_prefixes(data_dir):
    store.create({"file": "ml.txt", "text": "Machine learning basics\nabout models"})
    store.create({"file": "body.txt", "text": "Notes\nsome machine learning in the body"})
    store.create({"file": "mach.txt", "text": "Machinery"})
    store.create({"file": "cafe.txt", "text": "Café culture"})
    files = lambda q, ex=(): [r["file"] for r in store.search(q, list(ex))]
    assert files("machine learning") == ["ml.txt", "body.txt", "mach.txt"]
    assert files("machine lea")[:2] == ["ml.txt", "body.txt"]
    assert files("mach")[0] == "mach.txt"  # heading, prefix
    assert files("cafe") == files("CAFÉ") == ["cafe.txt"]
    assert files("machine learning", ["ml.txt"]) == ["body.txt", "mach.txt"]
    assert store.search("machine")[0] == {"file": "ml.txt", "heading": "Machine learning basics"}
    assert files("  ") == []


def test_search_sees_own_writes_at_once(data_dir):
    store.search("x")
    store.create({"file": "n.txt", "text": "zebra"})
    assert [r["file"] for r in store.search("zeb")] == ["n.txt"]
    store.update("n.txt", {"text": "yak"})
    assert store.search("zeb") == []
    store.delete("n.txt")
    assert store.search("yak") == []


def test_answer_links_existing_and_new(data_dir):
    store.create({"file": "a.txt", "text": "a > b"})
    store.create({"file": "x.txt", "text": "X person"})
    res = store.answer("a.txt", {"qid": "experts", "target": "x.txt"})
    assert res["target"] == {"file": "x.txt", "heading": "X person"}
    assert res["refs"] == {"x": "X person"}
    res = store.answer("a.txt", {"qid": "solves", "text": "Some problem"})
    new = res["target"]["file"]
    assert (data_dir / "a.txt").read_text() == f"a > b\n-> experts on this: @x\n-> solves @{new[:-4]}\n"
    assert (data_dir / new).read_text() == "Some problem\n"
    with pytest.raises(store.ValidationError):
        store.answer("a.txt", {"qid": "nope", "text": "t"})
    with pytest.raises(store.NotFound):
        store.answer("a.txt", {"qid": "solves", "target": "missing.txt"})
    with pytest.raises(store.ValidationError):
        store.answer("a.txt", {"qid": "solves", "text": " "})


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


def test_with_refs(data_dir):
    store.create({"file": "x.txt", "text": "X person"})
    item = store.create({"file": "a.txt", "text": "a > b\n-> knows @x\n-> @gone\n"})
    assert store.with_refs(item)["refs"] == {"gone": None, "x": "X person"}


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
        {"file": "a.txt", "label": "", "heading": "A note"},
        {"file": "b.txt", "label": "cites", "heading": "B note"},
        {"file": "a.txt", "label": "knows", "heading": "A note"},
    ]
    with pytest.raises(store.NotFound):
        store.backlinks("missing.txt")


def test_backlink(data_dir):
    store.create({"file": "x.txt", "text": "X person"})
    store.create({"file": "a.txt", "text": "A note"})
    res = store.backlink("x.txt", {"label": " cites ", "source": "a.txt"})
    assert res == [{"file": "a.txt", "label": "cites", "heading": "A note"}]
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
    store.disable("a.txt")
    assert (data_dir / "a.txt").read_text() == "a > b\ntags no-questions\n"
    assert store.random_candidate()["total"] == 0


def test_set_llm(data_dir):
    store.set_llm({"url": " http://h:1 "})
    assert store._config()["llm"] == {"url": "http://h:1"}
    store.set_llm({"url": ""})
    assert store._config()["llm"] == {}
    assert store.get_path() == data_dir


def test_queue_skips_hidden_types_and_tags(data_dir):
    store.create({"file": "a.txt", "text": "a\nappointment 26-08-29"})
    store.create({"file": "b.txt", "text": "b"})
    store.create({"file": "c.txt", "text": "c"})
    store.create({"file": "d.txt", "text": "d\ntags suggest-book"})
    store.hide("b.txt", views.QUEUE_HIDING)
    assert store.get("b.txt")["text"] == "b\ntags no-q\n"
    for _ in range(5):
        res = store.queue_draw()
        assert [i["file"] for i in res["items"]] == ["c.txt"] and res["total"] == 1


def test_float_skips_hidden_and_filters(data_dir):
    store.create({"file": "a.txt", "text": "a apple\nappointment 26-08-29"})
    store.create({"file": "b.txt", "text": "b apple"})
    store.create({"file": "c.txt", "text": "c Apple"})
    store.create({"file": "d.txt", "text": "d pear"})
    store.create({"file": "e.txt", "text": "e apple\ntags suggest-book"})
    store.hide("b.txt", views.FLOAT_HIDING)
    assert store.get("b.txt")["text"] == "b apple\ntags no-float\n"
    res = store.float_draw(" apple")
    assert [i["file"] for i in res["items"]] == ["c.txt"] and res["total"] == 1
    assert sorted(i["file"] for i in store.float_draw()["items"]) == ["c.txt", "d.txt"]
    assert store.queue_draw()["total"] == 3


def test_zero_items(data_dir):
    store.create({"file": "a.txt", "text": "a\ntags zero"})
    store.create({"file": "b.txt", "text": "b\ntags zeros"})
    assert [i["file"] for i in store.zero_items()] == ["a.txt"]


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
    assert store.calendar_items() == [{
        "file": "a.txt", "heading": "Lecture", "details": ["(bring laptop)"],
        "when": {"recurring": 1, "until": "2026-03-31"},
    }]


def test_projects(data_dir):
    store.create({"file": "p.txt", "text": "Website\nproject"})
    store.create({"file": "q.txt", "text": "Archive\nproject"})
    store.create({"file": "i.txt", "text": "Login\nissue\n-> project @p"})
    store.create({"file": "j.txt", "text": "Both\nissue\n-> project @p\n-> project @q"})
    store.create({"file": "k.txt", "text": "Wrong label\nissue\n-> blocks @p"})
    store.create({"file": "l.txt", "text": "Not a project\nissue\n-> project @n"})
    store.create({"file": "m.txt", "text": "Sketch it\nissue\n-> project @p\ntags suggest-think-and-sketch"})
    store.create({"file": "n.txt", "text": "plain"})
    assert store.projects() == {
        "projects": [
            {"file": "q.txt", "heading": "Archive", "issues": [{"file": "j.txt", "heading": "Both", "think": False}]},
            {"file": "p.txt", "heading": "Website", "issues": [
                {"file": "m.txt", "heading": "Sketch it", "think": True},
                {"file": "j.txt", "heading": "Both", "think": False},
                {"file": "i.txt", "heading": "Login", "think": False},
            ]},
        ],
        "orphans": [
            {"file": "l.txt", "heading": "Not a project", "think": False},
            {"file": "k.txt", "heading": "Wrong label", "think": False},
        ],
    }


def test_set_think(data_dir):
    store.create({"file": "i.txt", "text": "Login\nissue\ntags x"})
    store.set_think("i.txt", True)
    assert store.get("i.txt")["text"].rstrip("\n") == "Login\nissue\ntags x suggest-think-and-sketch"
    store.set_think("i.txt", False)
    assert store.get("i.txt")["text"].rstrip("\n") == "Login\nissue\ntags x"


def test_media_path(data_dir):
    (data_dir / "img").mkdir()
    (data_dir / "img" / "a.png").write_bytes(b"x")
    assert store.media_path("img/a.png") == data_dir / "img" / "a.png"
    for bad in ["../x.png", "/etc/x.png", "img/a.txt"]:
        with pytest.raises(store.ValidationError):
            store.media_path(bad)
    with pytest.raises(store.NotFound):
        store.media_path("img/b.png")
