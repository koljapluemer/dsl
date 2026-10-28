"""Viz blocks (```thea fences, see core/thea.py and docs/thea.md), generated
by the local claude CLI: a background job per block writes its spec into a
workspace in the cache, seeded from the template or the block's current
version, lets the CLI build, lint and check it there, checks it again itself,
and copies the result into the data folder as the block's next version."""

import json
import os
import queue
import random
import shlex
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from dsl_crud.core import thea
from dsl_crud.features.thea import check, words
from dsl_crud.infrastructure import chromium, config
from dsl_crud.infrastructure import items as store

HERE = Path(__file__).parent
TEMPLATE = HERE / "template"
SYSTEM_PROMPT = HERE / "system-prompt.md"
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "dsl-crud" / "thea"
# bump when the template, prompt or pipeline changes in a way worth recording
GENERATOR = "thea-1"

# what a version's folder holds besides the sources
BUILT, THUMB, META = "index.html", "thumb.webp", "thea.json"
# workspace entries that aren't sources
_SCRATCH = {"node_modules", "dist", "SPEC.md", "PREVIOUS_ERRORS.md", ".claude"}
MAX_SOURCE_BYTES = 20 * 1024 * 1024
SHOT_WIDTH, THUMB_WIDTH = 800, 420
# the thumbnail is cut to at most this height per width
THUMB_RATIO = 0.6
JOBS_KEPT_S = 30 * 60
OUTPUT_CHARS = 6000
NPM_INSTALL = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"]
TOOLS = "Read,Write,Edit,Glob,Grep,Bash"
ALLOWED = "Read,Write,Edit,Glob,Grep,Bash(npm:*),Bash(npx:*)"


class Failed(Exception):
    pass


@dataclass
class Job:
    name: str
    file: str
    state: str = "queued"  # queued, running, done, failed
    step: str = "Waiting to start"
    error: str | None = None
    # the version id generated, once done
    id: str | None = None
    started: float = field(default_factory=time.time)
    finished: float | None = None
    cost_usd: float | None = None


_lock = threading.Lock()
_jobs: dict[str, Job] = {}
_queue: queue.Queue = queue.Queue()
_worker: threading.Thread | None = None
# the last failure per block name, handed to its next run
_failures: dict[str, str] = {}


def status() -> dict:
    """Whether viz blocks can be generated here, and the settings."""
    settings = config.get_thea()
    try:
        cli = shlex.split(settings["cli"])
    except ValueError:
        cli = []
    reasons = []
    if not cli or not shutil.which(cli[0]):
        reasons.append(f"the claude CLI `{settings['cli']}` isn't found")
    if not shutil.which("npm"):
        reasons.append("npm isn't found")
    if reason := chromium.missing():
        reasons.append(reason)
    return {"available": not reasons, "reason": "; ".join(reasons) or None, "settings": settings}


def jobs() -> list[dict]:
    """The queued and running jobs, and those finished in the last JOBS_KEPT_S."""
    with _lock:
        now = time.time()
        for name in [n for n, j in _jobs.items() if j.finished and now - j.finished > JOBS_KEPT_S]:
            del _jobs[name]
        return [asdict(j) for j in _jobs.values()]


def start(file: str, index, errors=None) -> dict:
    """Queues generating the note's `index`th viz block (as saved), naming it
    first when it has no name yet. `errors` are runtime errors the viz showed,
    passed on to the CLI."""
    if not isinstance(index, int) or isinstance(index, bool):
        raise store.ValidationError("index must be a number")
    errors = [str(e)[:2000] for e in errors[:10]] if isinstance(errors, list) else []
    if reason := status()["reason"]:
        raise chromium.Unavailable(f"viz blocks can't be generated here: {reason}")
    with _lock:
        text = store.get(file)["text"]
        blocks = thea.blocks(store.SCHEMA, text)
        if not 0 <= index < len(blocks):
            raise store.NotFound(f"viz block {index}")
        block = blocks[index]
        if not block.spec:
            raise store.ValidationError("the viz block has no spec")
        name = block.name
        if name and (job := _jobs.get(name)) and job.state in ("queued", "running"):
            raise store.Conflict(f"{name} is already being generated")
        if not name:
            name = _new_name()
            store.update(file, {"text": thea.with_header(text, block, name, None)})
        job = _jobs[name] = Job(name, file)
        _queue.put((job, errors))
        _ensure_worker()
        return asdict(job)


def view(ident: str) -> Path:
    """A version's built page."""
    if not thea.parse_id(ident):
        raise store.ValidationError(f"invalid viz id '{ident}'")
    path = store._dir() / thea.DIR / ident / BUILT
    if not path.is_file():
        raise store.NotFound(ident)
    return path


def _new_name() -> str:
    used = {n for e in store._INDEX.refresh().values() for n in e.thea_names}
    folder = store._dir() / thea.DIR
    if folder.is_dir():
        used |= {parsed[0] for p in folder.iterdir() if (parsed := thea.parse_id(p.name))}
    for _ in range(1000):
        name = f"{random.choice(words.ADJECTIVES)}-{random.choice(words.NOUNS)}"
        if name not in used:
            return name
    raise store.Conflict("no free viz name left")


def _ensure_worker() -> None:
    global _worker
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_work, name="thea", daemon=True)
        _worker.start()


def _work() -> None:
    while True:
        job, errors = _queue.get()
        job.state = "running"
        try:
            _run(job, errors)
            job.state, job.step = "done", "Done"
            _failures.pop(job.name, None)
        except Exception as e:  # noqa: BLE001 - any failure ends this job, not the worker
            job.state, job.step, job.error = "failed", "Failed", str(e) or type(e).__name__
            _failures[job.name] = job.error
        finally:
            job.finished = time.time()


# --- one run ---------------------------------------------------------------------


def _block(file: str, name: str) -> tuple[str, thea.Block]:
    try:
        text = store.get(file)["text"]
    except store.NotFound as e:
        raise Failed(f"the note {file} is gone") from e
    block = next((b for b in thea.blocks(store.SCHEMA, text) if b.name == name), None)
    if block is None:
        raise Failed(f"the note no longer has the viz block {name}")
    return text, block


def _run(job: Job, errors: list[str]) -> None:
    settings = config.get_thea()
    deadline = time.monotonic() + settings["timeout_min"] * 60
    _, block = _block(job.file, job.name)
    data = store._dir()
    previous = data / thea.DIR / block.id if block.id else None
    version = (block.version or 0) + 1

    job.step = "Preparing the workspace"
    ws = _workspace(job.name, previous if previous and previous.is_dir() else TEMPLATE)
    (ws / "SPEC.md").write_text(block.spec + "\n", encoding="utf-8")
    problems = errors + ([_failures[job.name]] if job.name in _failures else [])
    if problems:
        (ws / "PREVIOUS_ERRORS.md").write_text(
            "Problems with the previous version or attempt:\n\n" + "\n\n".join(f"- {p}" for p in problems) + "\n",
            encoding="utf-8")
    env = os.environ | {"DSL_PYTHON": sys.executable, "DSL_CHECK": str(Path(check.__file__).resolve())}

    job.step = "Installing packages"
    _command(NPM_INSTALL, ws, env, deadline)

    session = str(uuid.uuid4())
    prompt = ("Build the visualization SPEC.md describes" + (", starting from the previous version in the workspace" if previous else "")
              + (". PREVIOUS_ERRORS.md lists problems to fix" if problems else "") + ".")
    result = _claude(job, settings, ["--session-id", session], prompt, ws, env, deadline)
    failure = _gate(job, ws, env, deadline)
    if failure:
        result = _claude(job, settings, ["--resume", session],
                         f"The app's own check of the workspace failed:\n\n{failure}\n\nFix it.", ws, env, deadline)
        if failure := _gate(job, ws, env, deadline):
            raise Failed(f"build, lint or check still fails:\n{failure}")

    job.step = "Saving"
    ident = f"{job.name}-{version}"
    _save(ws, data / thea.DIR / ident, {
        "spec": block.spec, "model": settings["model"] or None, "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "cost_usd": job.cost_usd, "turns": result.get("num_turns"), "session": session, "generator": GENERATOR,
    })
    text, block = _block(job.file, job.name)
    store.update(job.file, {"text": thea.with_header(text, block, job.name, version)})
    _drop_old(job.name)
    job.id = ident


def _workspace(name: str, seed: Path) -> Path:
    """The block's workspace, holding `seed`'s sources (and node_modules from earlier runs)."""
    ws = CACHE_DIR / name
    ws.mkdir(parents=True, exist_ok=True)
    for p in ws.iterdir():
        if p.name == "node_modules":
            continue
        shutil.rmtree(p) if p.is_dir() and not p.is_symlink() else p.unlink()
    for p in seed.iterdir():
        if p.name in _SCRATCH or p.name in (BUILT, THUMB, META):
            continue
        (shutil.copytree if p.is_dir() else shutil.copy2)(p, ws / p.name)
    return ws


def _remaining(deadline: float) -> float:
    left = deadline - time.monotonic()
    if left <= 0:
        raise Failed("the time limit was reached (Settings → viz blocks)")
    return left


def _tail(text: str) -> str:
    return text if len(text) <= OUTPUT_CHARS else "…" + text[-OUTPUT_CHARS:]


def _command(args: list[str], cwd: Path, env: dict, deadline: float) -> tuple[bool, str]:
    """Runs `args`, failing the job when it can't start; whether it succeeded, and its output."""
    try:
        r = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=_remaining(deadline))
    except subprocess.TimeoutExpired as e:
        raise Failed(f"`{' '.join(args)}` reached the time limit") from e
    except OSError as e:
        raise Failed(f"`{args[0]}` can't run: {e}") from e
    output = (r.stdout + r.stderr).strip()
    if args == NPM_INSTALL and r.returncode:
        raise Failed(f"npm install failed:\n{_tail(output)}")
    return r.returncode == 0, output


def _gate(job: Job, ws: Path, env: dict, deadline: float) -> str | None:
    """What fails in build, lint and check, None when all pass."""
    job.step = "Checking"
    out = []
    for script in ("build", "lint", "check"):
        ok, output = _command(["npm", "run", "--silent", script], ws, env, deadline)
        if not ok:
            out.append(f"$ npm run {script}\n{output}")
            if script == "build":
                break
    built = ws / "dist" / BUILT
    if not out and "data-thea-bridge" not in built.read_text(encoding="utf-8"):
        out.append("dist/index.html lacks the bridge script: build.mjs must stay as it is")
    return _tail("\n\n".join(out)) if out else None


def _claude(job: Job, settings: dict, session: list[str], prompt: str, ws: Path, env: dict, deadline: float) -> dict:
    """Runs the CLI in the workspace; its result event."""
    args = [*shlex.split(settings["cli"]), "-p", "--output-format", "stream-json", "--verbose",
            "--restricted", "--strict-mcp-config", "--tools", TOOLS, "--allowedTools", ALLOWED,
            "--append-system-prompt-file", str(SYSTEM_PROMPT), *session]
    if settings["model"]:
        args += ["--model", settings["model"]]
    if settings["budget_usd"]:
        args += ["--max-budget-usd", str(settings["budget_usd"])]
    job.step = "Starting Claude"
    try:
        proc = subprocess.Popen(args, cwd=ws, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, start_new_session=True)
    except OSError as e:
        raise Failed(f"the claude CLI can't run: {e}") from e
    timer = threading.Timer(_remaining(deadline), _kill, (proc,))
    timer.start()
    stderr: list[str] = []
    reader = threading.Thread(target=lambda: stderr.extend(proc.stderr), daemon=True)
    reader.start()
    result: dict = {}
    try:
        proc.stdin.write(prompt)
        proc.stdin.close()
        for line in proc.stdout:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "result":
                result = event
            elif step := _step(event):
                job.step = step
        proc.wait()
    finally:
        timer.cancel()
        reader.join(timeout=5)
    if time.monotonic() >= deadline:
        raise Failed("the time limit was reached (Settings → viz blocks)")
    if result.get("total_cost_usd") is not None:
        job.cost_usd = round((job.cost_usd or 0) + result["total_cost_usd"], 4)
    if not result or result.get("is_error") or proc.returncode:
        detail = result.get("result") or "".join(stderr).strip() or f"exit status {proc.returncode}"
        raise Failed(f"the claude CLI failed: {_tail(str(detail))}")
    return result


def _kill(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, 9)
    except ProcessLookupError:
        pass


def _step(event: dict) -> str | None:
    """What a stream-json event says the CLI is doing, for the job's status."""
    if event.get("type") != "assistant":
        return None
    for part in reversed(event.get("message", {}).get("content") or []):
        if part.get("type") != "tool_use":
            continue
        tool, args = part.get("name", ""), part.get("input") or {}
        if tool == "Bash":
            return "$ " + str(args.get("command", ""))[:80]
        if path := args.get("file_path") or args.get("pattern"):
            return f"{tool} {Path(str(path)).name}"
        return tool
    return None


def _sources(ws: Path) -> list[Path]:
    out = []
    for p in ws.rglob("*"):
        rel = p.relative_to(ws)
        if rel.parts[0] in _SCRATCH or (len(rel.parts) == 1 and p.name.startswith("check-") and p.suffix == ".png"):
            continue
        if p.is_file() and not p.is_symlink():
            out.append(p)
    if sum(p.stat().st_size for p in out) > MAX_SOURCE_BYTES:
        raise Failed(f"the sources are larger than {MAX_SOURCE_BYTES // 1024 // 1024} MB")
    return out


def _save(ws: Path, dest: Path, meta: dict) -> None:
    """Writes the version's folder: the sources, the built page, its thumbnail and `meta`."""
    tmp = dest.with_name(f".{dest.name}.tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    for p in _sources(ws):
        target = tmp / p.relative_to(ws)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
    html = (ws / "dist" / BUILT).read_text(encoding="utf-8")
    (tmp / BUILT).write_text(html, encoding="utf-8")
    (tmp / THUMB).write_bytes(_thumbnail(html))
    (tmp / META).write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(dest, ignore_errors=True)
    tmp.rename(dest)


def _thumbnail(html: str) -> bytes:
    import io

    from PIL import Image

    with Image.open(io.BytesIO(check.screenshot(html, SHOT_WIDTH))) as im:
        im = im.convert("RGB")
        im = im.crop((0, 0, im.width, min(im.height, round(im.width * THUMB_RATIO))))
        im = im.resize((THUMB_WIDTH, round(THUMB_WIDTH * im.height / im.width)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        im.save(out, "WEBP", quality=82, method=4)
        return out.getvalue()


def _drop_old(name: str) -> None:
    """Deletes the block's version folders no note keeps (see thea.kept)."""
    folder = store._dir() / thea.DIR
    kept = {d for e in store._INDEX.refresh().values() for d in e.thea_dirs}
    for p in folder.iterdir():
        if (parsed := thea.parse_id(p.name)) and parsed[0] == name and p.name not in kept:
            shutil.rmtree(p, ignore_errors=True)
