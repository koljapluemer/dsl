"""Text-level mutations shared by item-facing features."""

import yaml

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


DATA_KEYWORD = "data"


class DataError(ValueError):
    """The `data` block can't take the change without losing what's there."""


class _Dumper(yaml.SafeDumper):
    pass


# multi-line strings as literal blocks, so they read as they were written
_Dumper.add_representer(str, lambda dumper, value: dumper.represent_scalar(
    "tag:yaml.org,2002:str", value, style="|" if "\n" in value else None))


def _dump(mapping: dict) -> list[str]:
    return yaml.dump(mapping, Dumper=_Dumper, sort_keys=False, allow_unicode=True, default_flow_style=False).rstrip("\n").split("\n")


def _is_trailing(line: str) -> bool:
    """A blank line or a comment at column 0: not part of the value above it."""
    return not line.strip() or line.startswith("#")


def set_data_key(schema: dict, text: str, key: str, value) -> str:
    """`text` with the top-level `key` of its `data` block set to `value`, the
    block (or `data` itself) added when missing. Only that key's lines change;
    the other keys keep their text and comments. Raises DataError when the
    block isn't a YAML mapping, or when the result wouldn't read back as
    asked."""
    lines = [l.replace("\r", "") for l in text.split("\n")]
    before = dsl.parse(schema, text).data or {}
    span = dsl.block_span(schema, text, DATA_KEYWORD)
    if span is None:
        while lines and not lines[-1].strip():
            lines.pop()
        lines += [DATA_KEYWORD, *_dump({key: value}), ""]
    else:
        start, end = span
        lines[start + 1 : end] = _splice(lines[start + 1 : end], key, value)
    result = "\n".join(lines)
    after = dsl.parse(schema, result).data
    if after is None or after.get(key) != value or {k: v for k, v in after.items() if k != key} != {k: v for k, v in before.items() if k != key}:
        raise DataError("the data block would not read back as written")
    return result


def _splice(block: list[str], key: str, value) -> list[str]:
    try:
        root = dsl.compose_yaml("\n".join(block))
    except yaml.YAMLError as e:
        raise DataError(f"the data block is not valid YAML: {str(e).splitlines()[0]}") from e
    if root is None:  # an empty block
        return [*_dump({key: value}), *block]
    if not isinstance(root, yaml.MappingNode):
        raise DataError("the data block is not a mapping")
    if root.flow_style or any(k.start_mark.column != 0 for k, _ in root.value):
        # not one key per line: rewrite the whole mapping
        mapping = dsl.load_yaml("\n".join(block))
        return _dump({**mapping, key: value})
    pair = next(((k, v) for k, v in root.value if isinstance(k, yaml.ScalarNode) and k.value == key), None)
    if pair is None:
        last = len(block)
        while last > 0 and not block[last - 1].strip():
            last -= 1
        return [*block[:last], *_dump({key: value}), *block[last:]]
    k, v = pair
    first = k.start_mark.line
    # a block collection ends where the next key starts (column 0); a scalar ends within its line
    end = v.end_mark.line + (1 if v.end_mark.column > 0 else 0)
    while end > first + 1 and _is_trailing(block[end - 1]):
        end -= 1
    return [*block[:first], *_dump({key: value}), *block[end:]]


def body_text(schema: dict, text: str) -> str:
    """`text` as a note's body: lines after the first that would open the
    keyword section are indented by a space, as spec/language.md asks of writers."""
    lines = text.split("\n")
    first = next((i for i, l in enumerate(lines) if l.strip()), len(lines))
    return "\n".join(" " + l if i > first and dsl.is_section_opener(schema, l) else l for i, l in enumerate(lines))
