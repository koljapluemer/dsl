"""Local-LLM calls via an Ollama server. Only its `url` is configured (under
`llm` in the app's config); each feature names the model it was tuned with.
Every failure is `Unavailable`."""

import json
import os
import threading
import urllib.error
import urllib.request

import store

# Keeps the model loaded between calls, so only the first one waits for it to load.
KEEP_ALIVE = "30m"


class Unavailable(Exception):
    pass


class ModelMissing(Unavailable):
    """The server is up but doesn't have the model; `pull` gets it."""


def _normalize(u: str) -> str:
    u = u.strip().rstrip("/")
    return u if "://" in u else f"http://{u}"  # OLLAMA_HOST is often a bare host:port


def default_url() -> str:
    return _normalize(os.environ.get("OLLAMA_HOST") or "127.0.0.1:11434")


def url() -> str:
    cfg = store._config().get("llm")
    return _normalize((cfg.get("url") if isinstance(cfg, dict) else None) or default_url())


def _request(path: str, body: dict | None) -> urllib.request.Request:
    return urllib.request.Request(
        url() + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )


def _post(path: str, body: dict | None, timeout: float) -> dict:
    try:
        with urllib.request.urlopen(_request(path, body), timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise (ModelMissing if e.code == 404 else Unavailable)(_server_error(e)) from e
    except (OSError, ValueError) as e:
        raise Unavailable(str(e)) from e


def _server_error(e: urllib.error.HTTPError) -> str:
    """Ollama's own message, e.g. a missing model, rather than just the status."""
    try:
        return f"{e.code}: {json.loads(e.read())['error']}"
    except (OSError, ValueError, KeyError, TypeError):
        return str(e)


def models() -> list[str]:
    """The installed models."""
    try:
        return sorted(m["name"] for m in _post("/api/tags", None, 2)["models"])
    except (KeyError, TypeError) as e:
        raise Unavailable(f"unexpected reply: {e}") from e


def chat(model: str, system: str, user: str, schema: dict | None = None) -> str:
    """The model's reply text. `schema` asks for JSON of that shape, but not
    every model honours it: parse the reply leniently."""
    res = _post("/api/chat", {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        **({"format": schema} if schema else {}),
        "stream": False,
        "think": False,  # a thinking model's reasoning takes minutes on a laptop
        "keep_alive": KEEP_ALIVE,
    }, timeout=180)
    try:
        return res["message"]["content"]
    except (KeyError, TypeError) as e:
        raise Unavailable(f"unexpected reply: {e}") from e


def embed(model: str, inputs: list[str]) -> list[list[float]]:
    """One normalized embedding per input."""
    res = _post("/api/embed", {"model": model, "input": inputs, "keep_alive": KEEP_ALIVE}, timeout=180)
    try:
        return res["embeddings"]
    except (KeyError, TypeError) as e:
        raise Unavailable(f"unexpected reply: {e}") from e


_pulls: dict[str, dict] = {}
_pulls_lock = threading.Lock()


def pull_status(model: str) -> dict | None:
    """This session's download of the model, if any: `{status, completed,
    total, error}`; `status` is "success" when done, `error` set when it failed."""
    with _pulls_lock:
        p = _pulls.get(model)
        return dict(p) if p else None


def pull(model: str) -> None:
    """Starts downloading the model in the background, unless that's under way."""
    with _pulls_lock:
        cur = _pulls.get(model)
        if cur and not cur["error"] and cur["status"] != "success":
            return
        _pulls[model] = {"status": "starting", "completed": 0, "total": 0, "error": None}
    threading.Thread(target=_pull, args=(model,), daemon=True).start()


def _pull(model: str) -> None:
    def update(**kw):
        with _pulls_lock:
            _pulls[model].update(kw)

    try:
        with urllib.request.urlopen(_request("/api/pull", {"model": model, "stream": True}), timeout=60) as r:
            for line in r:  # one JSON object per progress step
                msg = json.loads(line)
                if msg.get("error"):
                    return update(error=msg["error"])
                update(status=msg.get("status", ""), completed=msg.get("completed", 0), total=msg.get("total", 0))
    except urllib.error.HTTPError as e:
        update(error=_server_error(e))
    except (OSError, ValueError) as e:
        update(error=str(e))
