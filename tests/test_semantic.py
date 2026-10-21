import numpy as np
import pytest

import llm
import semantic
import search
import store

WORDS = ["cat", "dog", "car"]


def fake_embed(model, inputs):
    """One dimension per word in WORDS, normalized."""
    out = []
    for t in inputs:
        v = np.array([t.lower().count(w) for w in WORDS], np.float32) + 1e-3
        out.append((v / np.linalg.norm(v)).tolist())
    return out


@pytest.fixture(autouse=True)
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    store.set_path(str(tmp_path / "data"))
    monkeypatch.setattr(semantic, "_EMBEDDINGS", semantic._Embeddings(tmp_path / "cache" / "e.npz"))
    monkeypatch.setattr(llm, "embed", fake_embed)
    return tmp_path


def wait():
    if (w := semantic._EMBEDDINGS._worker) is not None:
        w.join()


def files(res):
    return [r["file"] for r in res["results"]]


def ranked(q):
    return search.search(q, semantic_search=True)


def test_ranks_by_similarity_once_embedded():
    store.create({"file": "a.txt", "text": "the dog barked"})
    store.create({"file": "b.txt", "text": "a cat sat"})
    store.create({"file": "c.txt", "text": "car car"})
    first = ranked("kitten cat")
    assert first["semantic"]["total"] == 3
    wait()
    res = ranked("kitten cat")
    assert files(res)[0] == "b.txt"
    assert res["total"] == 3
    assert res["semantic"] | {"embedding": False} == {
        "indexed": 3, "total": 3, "embedding": False, "error": None, "missing_model": None}


def test_cache_survives_restart_and_is_pruned(setup):
    store.create({"file": "a.txt", "text": "dog"})
    store.create({"file": "b.txt", "text": "cat"})
    ranked("cat")
    wait()
    store.delete("a.txt")
    ranked("cat")
    wait()  # nothing new: no worker ran, the stale vector is still cached
    store.update("b.txt", {"text": "cat cat"})
    ranked("cat")
    wait()
    restarted = semantic._Embeddings(setup / "cache" / "e.npz")
    restarted._load()
    assert list(restarted._rows) == [semantic._key("cat cat")]


def test_only_body_is_embedded():
    store.create({"file": "a.txt", "text": "dog\ntags cat"})
    store.create({"file": "b.txt", "text": "cat"})
    ranked("cat")
    wait()
    assert files(ranked("cat")) == ["b.txt", "a.txt"]


def test_unavailable_falls_back_to_the_query_language(monkeypatch):
    def missing(model, inputs):
        raise llm.ModelMissing("404: model not found")

    monkeypatch.setattr(llm, "embed", missing)
    store.create({"file": "a.txt", "text": "dog"})
    store.create({"file": "b.txt", "text": "cat"})
    res = ranked("cat")
    assert files(res) == ["b.txt"]
    assert res["semantic"]["missing_model"] == semantic.MODEL
    wait()
    assert semantic.status()["missing_model"] == semantic.MODEL


def test_empty_query_lists_all_newest_first():
    store.create({"file": "a.txt", "text": "dog"})
    res = ranked("")
    assert files(res) == ["a.txt"] and res["semantic"] is None


def test_filenames_follow_the_semantic_ranking():
    store.create({"file": "a.txt", "text": "the dog barked"})
    store.create({"file": "b.txt", "text": "a cat sat"})
    ranked("cat")
    wait()
    assert search.filenames("cat", semantic_search=True) == {"filenames": ["b.txt", "a.txt"], "total": 2}
