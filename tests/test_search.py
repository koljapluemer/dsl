import os

import pytest

from dsl_crud.features.graph import service as graph
from dsl_crud.features.search import service as search
from dsl_crud.infrastructure import config, items as store


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


def note(name: str, text: str) -> str:
    store.create({"file": f"{name}.txt", "text": text})
    return f"{name}.txt"


def hits(q: str, **kw) -> list[str]:
    return [r["file"] for r in search.search(q, **kw)["results"]]


def test_query_parser():
    q = search.parse_query('foo "a b" OR -/x+/i body:(bar baz) key:val')
    assert isinstance(q, search.Op) and q.type == "or"
    assert q.children[0] == search.Op("and", [search.Term("foo", "fuzzy"), search.Term("a b", "exact")])
    right = q.children[1].children
    assert right[0] == search.Not(search.Term("x+", "regex", "i"))
    assert right[1] == search.Scope("body", search.Op("and", [search.Term("bar", "fuzzy"), search.Term("baz", "fuzzy")]))
    assert right[2] == search.Term("key:val", "fuzzy")
    for incomplete in ['"open', "/open", "(a", "a OR"]:
        with pytest.raises(search.IncompleteQuery):
            search.parse_query(incomplete)
    with pytest.raises(store.ValidationError):
        search.parse_query("/x/g")
    assert search.parse_query("/x+/g", regex_terms=False) == search.Term("/x+/g", "fuzzy")


def test_fuzzy_prefix_and_fields():
    note("a", "Apples and pears")
    note("b", "Bananas\nextra\nalso apples")
    note("c", "Cherries")
    assert hits("app") == ["a.txt", "b.txt"]  # an extra-only match comes last
    assert hits("body:app") == ["a.txt"]
    assert hits("extra:apples") == ["b.txt"]
    assert hits("app -bananas") == ["a.txt"]
    assert sorted(hits("cherries OR pears")) == ["a.txt", "c.txt"]
    assert hits("file:cherr") == [] and hits("file:c.txt") == ["c.txt"]
    assert hits("cafe") == []
    note("d", "Café culture")
    assert hits("cafe") == hits("CAFÉ") == ["d.txt"]


def test_exact_regex_and_orphans():
    note("a", "The quick fox\n-> r @b")
    note("b", "Slow fox")
    assert hits('"QUICK FOX"') == ["a.txt"]
    assert hits("/sl.w/i") == ["b.txt"]
    assert hits("/sl.w/i", regex_terms=False) == []
    assert sorted(hits("fox", orphan="connected")) == ["a.txt", "b.txt"]
    note("c", "Lonely fox")
    assert hits("fox", orphan="orphan") == ["c.txt"]
    with pytest.raises(store.ValidationError):
        search.search("/(/")
    with pytest.raises(store.ValidationError):
        search.search("fox", orphan="some")
    assert search.filenames("fox", cap=1) == {"filenames": [search.filenames("fox")["filenames"][0]], "total": 3}


def test_inline_relationships_count_as_connected_and_explicit_wins_for_degree():
    note("a", "Fox [[b]] [[b|again]]")
    note("b", "Fox")
    assert sorted(hits("fox", orphan="connected")) == ["a.txt", "b.txt"]
    assert graph._view().degree("a.txt") == 1
    store.update("a.txt", {"text": "Fox [[b]]\n-> knows @b"})
    assert graph._view().degree("a.txt") == 1


def test_match_in_the_first_line_or_an_excerpt():
    note("a", "😀 x  needle\nmore")
    r = search.search('"needle"')["results"][0]
    assert (r["file"], r["text"], r["match"], r["excerpt"]) == ("a.txt", "😀 x  needle\nmore\n", "needle", None)
    note("b", "Body\nextra\n" + "w " * 40 + "deep needle")
    r = search.search('"deep"')["results"][0]
    assert r["match"] is None and r["excerpt"]["text"].startswith("…")
    ex = r["excerpt"]
    assert ex["text"][ex["match"]["start"] : ex["match"]["start"] + ex["match"]["length"]] == "deep"


def test_scopes_and_problems(data_dir):
    note("ok", "Fine note")
    note("bad", "Bad note\nappointment 26-02-30")
    note("task", "Task note\ntasks clean up")
    note("hidden", "Hidden note\ntags no-graph")
    assert sorted(hits("note")) == ["bad.txt", "hidden.txt", "ok.txt", "task.txt"]
    assert hits("note", scope="attention") == ["bad.txt"]
    assert hits("note", scope="tasks") == ["task.txt"]
    assert sorted(hits("note", scope="graph")) == ["ok.txt", "task.txt"]
    errors = {r["file"]: bool(r["errors"]) for r in search.search("note")["results"]}
    assert errors["bad.txt"] and not errors["ok.txt"]
    with pytest.raises(store.ValidationError):
        search.search("note", scope="nope")


def test_exclude_limit_and_pages():
    for k in "abcde":
        note(k, f"fox {k}")
    assert hits("fox", exclude=["a.txt", "b.txt"]) == [f for f in hits("fox") if f not in ("a.txt", "b.txt")]
    pages = [search.search("fox", limit=2, page=p) for p in range(3)]
    assert [len(p["results"]) for p in pages] == [2, 2, 1]
    assert pages[0]["total"] == 5 and pages[1]["pageSize"] == 2 and pages[1]["page"] == 1
    assert sorted(f for p in pages for f in (r["file"] for r in p["results"])) == [f"{k}.txt" for k in "abcde"]


def test_empty_query_lists_newest_first(data_dir):
    for i, k in enumerate("abc"):
        note(k, k)
        os.utime(data_dir / f"{k}.txt", ns=(10**18 + i, 10**18 + i))
    assert hits("") == ["c.txt", "b.txt", "a.txt"]
    assert hits("  ", exclude=["c.txt"]) == ["b.txt", "a.txt"]


def test_sees_own_writes_at_once():
    search.search("x")
    note("n", "zebra")
    assert hits("zeb") == ["n.txt"]
    store.update("n.txt", {"text": "yak"})
    assert hits("zeb") == []
    store.delete("n.txt")
    assert hits("yak") == []


def test_hidden_notes_leave_the_graph_scope():
    note("b", "B")
    assert hits("B", scope="graph") == ["b.txt"]
    graph.hide("b.txt")
    assert hits("B", scope="graph") == []
    assert hits("B") == ["b.txt"]
