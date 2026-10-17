import numpy as np
import pytest

import llm
import semantic
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
    return [i["file"] for i in res["items"]]


def test_ranks_by_similarity_once_embedded():
    store.create({"file": "a.txt", "text": "the dog barked"})
    store.create({"file": "b.txt", "text": "a cat sat"})
    store.create({"file": "c.txt", "text": "car car"})
    first = store.list_page("kitten cat", semantic_search=True)
    assert first["semantic"]["total"] == 3
    wait()
    res = store.list_page("kitten cat", semantic_search=True)
    assert files(res)[0] == "b.txt"
    assert res["total"] == 3
    assert res["semantic"] | {"embedding": False} == {
        "indexed": 3, "total": 3, "embedding": False, "error": None, "missing_model": None}


def test_cache_survives_restart_and_is_pruned(setup):
    store.create({"file": "a.txt", "text": "dog"})
    store.create({"file": "b.txt", "text": "cat"})
    store.list_page("cat", semantic_search=True)
    wait()
    store.delete("a.txt")
    store.list_page("cat", semantic_search=True)
    wait()  # nothing new: no worker ran, the stale vector is still cached
    store.update("b.txt", {"text": "cat cat"})
    store.list_page("cat", semantic_search=True)
    wait()
    restarted = semantic._Embeddings(setup / "cache" / "e.npz")
    restarted._load()
    assert list(restarted._rows) == [semantic._key("cat cat")]


def test_only_body_is_embedded():
    store.create({"file": "a.txt", "text": "dog\ntags cat"})
    store.create({"file": "b.txt", "text": "cat"})
    store.list_page("cat", semantic_search=True)
    wait()
    assert files(store.list_page("cat", semantic_search=True)) == ["b.txt", "a.txt"]


def test_unavailable_falls_back_to_text_filter(monkeypatch):
    def missing(model, inputs):
        raise llm.ModelMissing("404: model not found")

    monkeypatch.setattr(llm, "embed", missing)
    store.create({"file": "a.txt", "text": "dog"})
    store.create({"file": "b.txt", "text": "cat"})
    res = store.list_page("cat", semantic_search=True)
    assert files(res) == ["b.txt"]
    assert res["semantic"]["missing_model"] == semantic.MODEL
    wait()
    assert semantic.status()["missing_model"] == semantic.MODEL


def test_empty_query_lists_all():
    store.create({"file": "a.txt", "text": "dog"})
    res = store.list_page("", semantic_search=True)
    assert files(res) == ["a.txt"] and res["semantic"] is None
