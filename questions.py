"""Questions asked about a note in the questions view; an answer becomes a
relationship `-> <label> @<answer>` on the note. When there are more than
ASK_COUNT, a local LLM picks the ones that fit the note."""

import hashlib
import json
import re
import threading
from pathlib import Path

import dsl
import llm

QUESTIONS = [
    {"id": "experts", "question": "Who would be the experts on this?", "label": "experts on this:"},
    {"id": "solves", "question": "What problem does this solve?", "label": "solves"},
    {"id": "does-not-solve", "question": "What doesn't this solve?", "label": "does not solve"},
    {"id": "so-what", "question": "So what?", "label": "so:"},
    {"id": "assumes", "question": "What does this assume?", "label": "assumes"},
    {"id": "money-bet", "question": "Would I bet money on this being true?", "label": "money-bet test:"},
    {"id": "matters", "question": "Why does this matter?", "label": "matters b/c"},
    {"id": "paradigm", "question": "What paradigm(s) is this based on?", "label": "paradigm:"},
    {"id": "leads-to", "question": "Where does this lead to?", "label": "leads to"},
    {"id": "if-not-true", "question": "What if this isn't true?", "label": "if not true"},
    {"id": "testable", "question": "How can I test this?", "label": "testable via"},
]

# How many questions are asked per note; the LLM picks them when there are more.
ASK_COUNT = 3
# Tuned together with the prompt: small, fast without a GPU, and it keeps to the reply format.
MODEL = "gemma3:4b"
PROMPT_PATH = Path(__file__).parent / "prompts" / "pick-questions.md"
NO_QUESTIONS_TAG = "no-questions"
TAGS_KEYWORD = "tags"
# The body must contain one of these for a note to be asked about.
BODY_MARKERS = (">", "~")
MAX_RELATIONS = 1


def by_id(qid: str) -> dict | None:
    return next((q for q in QUESTIONS if q["id"] == qid), None)


def is_candidate(doc: dsl.Document) -> bool:
    body = "\n".join(doc.body)
    return (
        any(m in body for m in BODY_MARKERS)
        and len(doc.relations) <= MAX_RELATIONS
        and not any(c.keyword == TAGS_KEYWORD and NO_QUESTIONS_TAG in c.args for c in doc.clauses)
    )


def _append_line(text: str, line: str) -> str:
    return text.rstrip("\n") + "\n" + line + "\n"


def add_relation(text: str, label: str, target: str) -> str:
    """A relationship line always ends a block and opens the keyword section,
    so appending it is safe after anything."""
    return _append_line(text, f"-> {label} @{target}" if label else f"-> @{target}")


def add_tag(schema: dict, text: str, tag: str) -> str:
    tags = next((c for c in dsl.parse(schema, text).clauses if c.keyword == TAGS_KEYWORD), None)
    if tags is None:
        return _append_line(text, f"{TAGS_KEYWORD} {tag}")
    if tag in tags.args:
        return text
    lines = text.split("\n")
    lines[tags.line - 1] = lines[tags.line - 1].rstrip() + " " + tag
    return "\n".join(lines)



def remove_tag(schema: dict, text: str, tag: str) -> str:
    """`text` without the tag `tag`; drops the tags line when nothing's left on it."""
    tags = next((c for c in dsl.parse(schema, text).clauses if c.keyword == TAGS_KEYWORD), None)
    if tags is None or tag not in tags.args:
        return text
    lines = text.split("\n")
    rest = [w for w in lines[tags.line - 1].split() if w != tag]
    if rest == [TAGS_KEYWORD]:
        del lines[tags.line - 1]
    else:
        lines[tags.line - 1] = " ".join(rest)
    return "\n".join(lines)

_cache: dict[tuple, list[str]] = {}
_cache_lock = threading.Lock()


def _sha(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()


def pick(text: str) -> list[str]:
    """Ids of up to ASK_COUNT questions that suit the note best, best first;
    possibly none. With no more than ASK_COUNT questions there's nothing to
    choose and the LLM isn't asked."""
    ids = [q["id"] for q in QUESTIONS]
    if len(ids) <= ASK_COUNT:
        return ids
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    key = (_sha(text), MODEL, _sha(json.dumps(QUESTIONS) + prompt))
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    listing = "\n".join(f"- {q['id']}: {q['question']}" for q in QUESTIONS)
    user = (
        f"Questions:\n{listing}\n\nNote:\n{text}\n\n"
        f'Choose at most {ASK_COUNT}. Answer with JSON only, like {{"ids": ["<id>", ...]}}.'
    )
    schema = {
        "type": "object",
        "properties": {"ids": {"type": "array", "items": {"type": "string", "enum": ids}, "maxItems": ASK_COUNT}},
        "required": ["ids"],
    }
    chosen = _ids_in(llm.chat(MODEL, prompt, user, schema), ids)
    with _cache_lock:
        _cache[key] = chosen
    return chosen


def _ids_in(reply: str, ids: list[str]) -> list[str]:
    """The known ids in the reply, in order: from `{"ids": [...]}` when it's
    that JSON, else wherever they appear in the text (models don't all keep to
    the schema)."""
    try:
        found = json.loads(reply).get("ids")
    except (ValueError, AttributeError):
        found = None
    if not isinstance(found, list):
        pattern = r"(?<![\w-])(" + "|".join(map(re.escape, sorted(ids, key=len, reverse=True))) + r")(?![\w-])"
        found = re.findall(pattern, reply)
        if not found:
            raise llm.Unavailable(f"unexpected reply: {reply[:100]!r}")
    return list(dict.fromkeys(i for i in found if i in ids))[:ASK_COUNT]
