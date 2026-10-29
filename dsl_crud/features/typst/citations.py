"""The bibliography keys a Typst document cites: `@key`, `#cite(<key>)` and
`#cite(label("key"))`. Strings and comments are skipped, roughly; a key found
where it isn't a citation only matters when a source has it."""

import re

# whichever starts first: `cite(label("key"`, a string (a URL's `//` is no comment), a comment
_SKIPPED = re.compile(r'cite\(\s*label\(\s*"(?P<key>[^"\\\n]*)"|"(?:[^"\\\n]|\\.)*"|/\*.*?\*/|//[^\n]*', re.S)
# Typst's reference syntax: no trailing `.` or `:`, not after a word character (emails)
_REF = re.compile(r"(?<![\w@])@([\w\-.:]*[\w\-])")
_CITE_LABEL = re.compile(r"cite\(\s*<([^>\s]+)>")


def cited_keys(text: str) -> list[str]:
    """The keys cited, each once, in the order first cited."""
    found = []

    def blank(m: re.Match) -> str:
        if m.group("key"):
            found.append((m.start(), m.group("key")))
        return " " * len(m.group())

    rest = _SKIPPED.sub(blank, text)
    found += [(m.start(), m.group(1)) for r in (_REF, _CITE_LABEL) for m in r.finditer(rest)]
    return list(dict.fromkeys(key for _, key in sorted(found)))
