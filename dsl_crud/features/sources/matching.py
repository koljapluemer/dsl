"""Finding existing sources that are probably the one about to be added.

A shared identifier (DOI, ISBN, eprint) decides; without one, title, authors
and year are compared loosely: a title may be shortened or lose its subtitle,
an author list end in `others`, a year be off by one (online first, preprint).
A field missing on either side counts neither way.
"""

import re
import unicodedata
from difflib import SequenceMatcher

LEVELS = ("same", "likely", "possible")

STOPWORDS = frozenset(
    "a an and at by for from in into of on or the to with "
    "der die das ein eine und von zu im in mit fur auf uber "
    "le la les un une des du et en".split()
)


def fold(s: str) -> str:
    """Lowercase words without accents or punctuation, single-spaced."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    return " ".join(re.sub(r"[^\w]+|_", " ", s).split())


def doi(v) -> str:
    s = str(v or "").strip().lower()
    s = re.sub(r"^(https?://)?(dx\.)?doi\.org/|^doi:\s*", "", s)
    return s.strip()


def isbn(v) -> str:
    """ISBN-13 digits; an ISBN-10 is converted."""
    s = re.sub(r"[^0-9X]", "", str(v or "").upper())
    if len(s) == 10:
        s = "978" + s[:9]
        s += str((10 - sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(s)) % 10) % 10)
    return s if len(s) == 13 else ""


def eprint(source: dict) -> str:
    e = str(source.get("eprint") or "").strip().lower()
    if not e:
        return ""
    e = re.sub(r"^arxiv:", "", e)
    e = re.sub(r"v\d+$", "", e)
    return f"{str(source.get('eprinttype') or 'arxiv').strip().lower()}:{e}"


def url(v) -> str:
    s = str(v or "").strip().lower()
    s = re.sub(r"^https?://", "", s).split("#")[0]
    return re.sub(r"^www\.", "", s).rstrip("/")


def _main(title: str) -> str:
    """The title before its subtitle."""
    return re.split(r":|\s[-–—]\s|\.\s", title, maxsplit=1)[0]


def title_similarity(a: str, b: str) -> float:
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return 0.0
    best = max(SequenceMatcher(None, fa, fb).ratio(), SequenceMatcher(None, fold(_main(a)), fold(_main(b))).ratio())
    wa, wb = (set(fa.split()) - STOPWORDS, set(fb.split()) - STOPWORDS)
    short, long = sorted((wa, wb), key=len)
    if len(short) >= 2 and short <= long:
        best = max(best, 0.95)
    return best


def families(source: dict) -> list[str]:
    """The folded family names of the authors, else the editors, without `others`."""
    out = []
    for name in source.get("author") or source.get("editor") or []:
        name = str(name)
        if "," in name:
            words = name.split(",")[0].split()
            while len(words) > 1 and words[0][:1].islower():
                words = words[1:]  # the prefix: `van`
            family = fold(" ".join(words))
        else:
            # an organisation, or a name typed as spoken
            family = (fold(name).split() or [""])[-1]
        if family and family != "others":
            out.append(family)
    return out


def year(source: dict) -> int | None:
    m = re.match(r"\d{4}", str(source.get("date") or ""))
    return int(m.group()) if m else None


_IDS = (("DOI", lambda s: doi(s.get("doi"))), ("ISBN", lambda s: isbn(s.get("isbn"))), ("eprint", eprint))


def compare(entry: dict, other: dict) -> tuple[str, list[str], float] | None:
    """`(level, reasons, title score)` when `other` may be `entry`, else None."""
    reasons: list[str] = []
    conflict = False
    for label, get in _IDS:
        a, b = get(entry), get(other)
        if a and b:
            if a == b:
                return "same", [label], 1.0
            conflict = True
            reasons.append(f"≠{label}")

    score = title_similarity(entry.get("title") or "", other.get("title") or "")
    fa, fb = families(entry), families(other)
    first = not fa or not fb or fa[0] == fb[0]
    overlap = bool(set(fa) & set(fb))
    ya, yb = year(entry), year(other)
    near = ya is None or yb is None or abs(ya - yb) <= 1
    same_url = bool(url(entry.get("url"))) and url(entry.get("url")) == url(other.get("url"))

    if score >= 0.75:
        reasons.append(f"title {round(score * 100)}%")
    if fa and fb and (first or overlap):
        reasons.append("author")
    if ya and yb and ya != yb:
        reasons.append(f"{ya}≠{yb}")
    if same_url:
        reasons.insert(0, "URL")

    if fold(entry.get("title") or "") == fold(other.get("title") or "") and fa and fb and fa[0] == fb[0] and ya and ya == yb:
        level = "same"
    elif same_url or (score >= 0.9 and first and near):
        level = "likely"
    elif score >= 0.75:
        level = "possible"
    else:
        return None
    if conflict:
        level = "possible"
    return level, reasons, score


def match(entry: dict, existing: list[dict], limit: int = 3) -> list[dict]:
    """The sources in `existing` that may be `entry`, best first."""
    found = []
    for other in existing:
        hit = compare(entry, other)
        if hit is None:
            continue
        level, reasons, score = hit
        found.append(({"file": other["file"], "key": other["key"], "title": other.get("title", ""),
                       "level": level, "reasons": reasons}, LEVELS.index(level), -score))
    found.sort(key=lambda f: (f[1], f[2]))
    return [f[0] for f in found[:limit]]
