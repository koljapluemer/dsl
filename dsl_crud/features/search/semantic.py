"""Semantic search: each note's
body is embedded (by the Ollama server, see llm) and notes are ranked by cosine
similarity to the query's embedding. Embeddings are cached on disk by body
hash and computed in the background, so until that's done a search ranks only
the notes embedded so far."""

import hashlib
import io
import os
import threading
import time
from pathlib import Path

import numpy as np

from dsl_crud.infrastructure import ollama as llm

# Multilingual; the notes aren't all English.
MODEL = "qwen3-embedding:0.6b"
# Qwen3-Embedding takes an instruction on the query side only.
QUERY_PREFIX = "Instruct: Given a search query, retrieve notes relevant to the query\nQuery: "
# Only a body's start is embedded: it says what the note is about, and the model truncates anyway.
MAX_CHARS = 4000
BATCH = 64
# How often the background embedding saves its progress, in seconds.
SAVE_EVERY = 30.0
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "dsl-crud"


def _key(body: str) -> str:
    return hashlib.sha1(body.encode()).hexdigest()


class _Embeddings:
    """Embedding vectors by body hash, loaded from and saved to `path`."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._loaded = False
        self._rows: dict[str, int] = {}
        self._chunks: list[np.ndarray] = []
        # bodies waiting to be embedded, by hash
        self._pending: dict[str, str] = {}
        # the hashes of the bodies last ranked: what a save keeps
        self._live: set[str] = set()
        self._worker: threading.Thread | None = None
        self.error: str | None = None
        self.missing_model = False

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            with np.load(self.path) as f:
                keys, vectors = list(f["keys"]), f["vectors"]
        except (OSError, ValueError, KeyError):
            return
        self._rows = {str(k): i for i, k in enumerate(keys)}
        self._chunks = [vectors.astype(np.float32)]

    def _matrix(self) -> np.ndarray:
        if len(self._chunks) > 1:
            self._chunks = [np.concatenate(self._chunks)]
        return self._chunks[0] if self._chunks else np.zeros((0, 0), np.float32)

    def _save(self, prune: bool) -> None:
        """Writes the vectors; with `prune`, only those of live bodies."""
        with self._lock:
            m = self._matrix()
            keys = [k for k in self._rows if not prune or k in self._live]
            vectors = m[[self._rows[k] for k in keys]] if keys else np.zeros((0, m.shape[1] if m.ndim == 2 else 0), np.float32)
            if prune:
                self._rows = {k: i for i, k in enumerate(keys)}
                self._chunks = [vectors]
        buf = io.BytesIO()
        np.savez(buf, keys=np.array(keys, dtype=str), vectors=vectors)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.tmp")
        tmp.write_bytes(buf.getvalue())
        tmp.replace(self.path)

    def status(self) -> dict:
        with self._lock:
            return {
                "indexed": sum(k in self._rows for k in self._live),
                "total": len(self._live),
                "embedding": self._worker is not None and self._worker.is_alive(),
                "error": self.error,
                "missing_model": MODEL if self.missing_model else None,
            }

    def rank(self, query: str, bodies: dict[str, str]) -> list[str]:
        """The names in `bodies` whose body is embedded, most similar to
        `query` first; starts embedding the others. Raises llm.Unavailable."""
        texts = {name: body[:MAX_CHARS] for name, body in bodies.items() if body.strip()}
        keys = {name: _key(t) for name, t in texts.items()}
        with self._lock:
            self._load()
            self._live = set(keys.values())
            for name, k in keys.items():
                if k not in self._rows:
                    self._pending[k] = texts[name]
            if self._pending and not (self._worker and self._worker.is_alive()):
                self._worker = threading.Thread(target=self._embed_pending, daemon=True)
                self._worker.start()
        q = np.asarray(llm.embed(MODEL, [QUERY_PREFIX + query])[0], np.float32)
        with self._lock:
            names = [n for n, k in keys.items() if k in self._rows]
            if not names:
                return []
            scores = self._matrix()[[self._rows[keys[n]] for n in names]] @ q
        return [names[i] for i in np.argsort(-scores, kind="stable")]

    def _embed_pending(self) -> None:
        saved = time.monotonic()
        try:
            while True:
                with self._lock:
                    batch = list(self._pending.items())[:BATCH]
                if not batch:
                    break
                try:
                    vectors = np.asarray(llm.embed(MODEL, [t for _, t in batch]), np.float32)
                except llm.Unavailable as e:
                    with self._lock:
                        self.error, self.missing_model = str(e), isinstance(e, llm.ModelMissing)
                    return
                with self._lock:
                    self.error, self.missing_model = None, False
                    n = sum(len(c) for c in self._chunks)
                    self._chunks.append(vectors)
                    for i, (k, _) in enumerate(batch):
                        self._rows[k] = n + i
                        self._pending.pop(k, None)
                if time.monotonic() - saved > SAVE_EVERY:
                    self._save(prune=False)
                    saved = time.monotonic()
            self._save(prune=True)
        except OSError as e:
            with self._lock:
                self.error = f"saving embeddings: {e}"


_EMBEDDINGS = _Embeddings(CACHE_DIR / f"embeddings-{MODEL.replace(':', '-').replace('/', '-')}.npz")


def rank(query: str, bodies: dict[str, str]) -> list[str]:
    return _EMBEDDINGS.rank(query, bodies)


def status() -> dict:
    return _EMBEDDINGS.status()
