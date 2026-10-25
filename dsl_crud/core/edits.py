"""Text-level mutations shared by item-facing features."""

from dsl_crud.core import dsl

TAGS_KEYWORD = "tags"


def _append_line(text: str, line: str) -> str:
    return text.rstrip("\n") + "\n" + line + "\n"


def add_relation(text: str, label: str, target: str) -> str:
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
    tags = next((c for c in dsl.parse(schema, text).clauses if c.keyword == TAGS_KEYWORD), None)
    if tags is None or tag not in tags.args:
        return text
    lines = text.split("\n")
    rest = [word for word in lines[tags.line - 1].split() if word != tag]
    if rest == [TAGS_KEYWORD]:
        del lines[tags.line - 1]
    else:
        lines[tags.line - 1] = " ".join(rest)
    return "\n".join(lines)
