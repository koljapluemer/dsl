"""Optional local-LLM calls via an Ollama server; configured under `llm` in
the app's config (`url`, `model`, and optionally `options`, `think`,
`keep_alive`). Every failure is `Unavailable`."""

import hashlib
import json
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path

import store

PICK_PROMPT_PATH = Path(__file__).parent / "prompts" / "pick-questions.md"
# Picking from a list needs no reasoning; a thinking model's reasoning would take minutes on a laptop.
DEFAULT_THINK = False
# Keeps the model loaded between notes, so only the first one waits for it to load.
DEFAULT_KEEP_ALIVE = "30m"


class Unavailable(Exception):
    pass


def _normalize(u: str) -> str:
    u = u.strip().rstrip("/")
    return u if "://" in u else f"http://{u}"  # OLLAMA_HOST is often a bare host:port


def default_url() -> str:
    return _normalize(os.environ.get("OLLAMA_HOST") or "127.0.0.1:11434")


def _cfg() -> dict:
    cfg = store._config().get("llm")
    return cfg if isinstance(cfg, dict) else {}


def url() -> str:
    return _normalize(_cfg().get("url") or default_url())


def model() -> str | None:
    return _cfg().get("model") or None


def _post(path: str, body: dict | None, timeout: float) -> dict:
    req = urllib.request.Request(
        url() + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise Unavailable(_server_error(e)) from e
    except (OSError, ValueError) as e:
        raise Unavailable(str(e)) from e


def _server_error(e: urllib.error.HTTPError) -> str:
    """Ollama's own message, e.g. a missing model, rather than just the status."""
    try:
        return f"{e.code}: {json.loads(e.read())['error']}"
    except (OSError, ValueError, KeyError, TypeError):
        return str(e)


def models() -> list[str]:
    try:
        return sorted(m["name"] for m in _post("/api/tags", None, 2)["models"])
    except (KeyError, TypeError) as e:
        raise Unavailable(f"unexpected reply: {e}") from e


def chat_json(system: str, user: str, schema: dict) -> dict:
    """The model's reply, constrained to the JSON `schema`."""
    m = model()
    if not m:
        raise Unavailable("no model configured")
    res = _post("/api/chat", {
        "model": m,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "format": schema,
        "stream": False,
        "think": _cfg().get("think", DEFAULT_THINK),
        "keep_alive": _cfg().get("keep_alive", DEFAULT_KEEP_ALIVE),
        "options": _cfg().get("options") or {},
    }, timeout=180)
    try:
        return json.loads(res["message"]["content"])
    except (KeyError, TypeError, ValueError) as e:
        raise Unavailable(f"unexpected reply: {e}") from e


_cache: dict[tuple, list[str]] = {}
_cache_lock = threading.Lock()


def _sha(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()


def pick(text: str, questions: list[dict], n: int = 3) -> list[str]:
    """Ids of up to `n` of `questions` that suit the note best, best first. With
    no more than `n` questions there's nothing to choose and the LLM isn't asked."""
    ids = [q["id"] for q in questions]
    if len(ids) <= n:
        return ids
    prompt = PICK_PROMPT_PATH.read_text(encoding="utf-8")
    key = (_sha(text), model(), _sha(json.dumps(questions) + prompt), n)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    listing = "\n".join(f"{i + 1}. [{q['id']}] {q['question']}" for i, q in enumerate(questions))
    user = f"Choose at most {n} questions.\n\nQuestions:\n{listing}\n\nNote:\n{text}"
    schema = {
        "type": "object",
        "properties": {"ids": {"type": "array", "items": {"type": "string", "enum": ids}, "maxItems": n}},
        "required": ["ids"],
    }
    reply = chat_json(prompt, user, schema).get("ids")
    if not isinstance(reply, list):
        raise Unavailable("unexpected reply: no ids")
    chosen = list(dict.fromkeys(i for i in reply if i in ids))[:n]
    with _cache_lock:
        _cache[key] = chosen
    return chosen
