"""Questions asked about a note in the questions view; an answer becomes a
relationship `-> <label> @<answer>` on the note."""

import dsl

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
    return _append_line(text, f"-> {label} @{target}")


def add_tag(schema: dict, text: str, tag: str) -> str:
    tags = next((c for c in dsl.parse(schema, text).clauses if c.keyword == TAGS_KEYWORD), None)
    if tags is None:
        return _append_line(text, f"{TAGS_KEYWORD} {tag}")
    if tag in tags.args:
        return text
    lines = text.split("\n")
    lines[tags.line - 1] = lines[tags.line - 1].rstrip() + " " + tag
    return "\n".join(lines)
