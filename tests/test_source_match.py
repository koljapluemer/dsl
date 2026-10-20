from source_match import compare, doi, eprint, families, fold, isbn, match, title_similarity, url

GEB = {
    "file": "geb.txt", "key": "hofstadter1979", "title": "Gödel, Escher, Bach: An Eternal Golden Braid",
    "author": ["Hofstadter, Douglas R."], "date": "1979", "isbn": "0-465-02656-7",
}


def level(entry, other=GEB):
    hit = compare(entry, other)
    return hit and hit[0]


def test_normalisers():
    assert doi("https://doi.org/10.1000/ABC") == doi("doi:10.1000/abc") == "10.1000/abc"
    assert isbn("0-465-02656-7") == isbn("978-0-465-02656-2") == "9780465026562"
    assert isbn("12") == ""
    assert eprint({"eprint": "2101.00001v2", "eprinttype": "arXiv"}) == eprint({"eprint": "arXiv:2101.00001"})
    assert url("https://www.example.org/a/#x") == url("http://example.org/a") == "example.org/a"
    assert fold("Gödel,  ESCHER!") == "godel escher"


def test_families():
    assert families({"author": ["van Beethoven, Ludwig", "others", "World Health Organization"]}) == ["beethoven", "organization"]
    assert families({"editor": ["Müller, Hans"]}) == ["muller"]


def test_identifier_decides():
    assert level({"title": "Something else entirely", "isbn": "9780465026562"}) == "same"
    assert level({"title": "x", "doi": "10.1/a"}, {"file": "f", "key": "k", "title": "y", "doi": "https://doi.org/10.1/A"}) == "same"


def test_shortened_title():
    assert title_similarity("Gödel, Escher, Bach", GEB["title"]) >= 0.9
    assert level({"title": "Godel Escher Bach", "author": ["Hofstadter, D."], "date": "1999"}) == "possible"
    assert level({"title": "Gödel, Escher, Bach", "author": ["Hofstadter, Douglas", "others"], "date": "1980"}) == "likely"


def test_missing_fields_are_neutral():
    assert level({"title": "Gödel, Escher, Bach: an eternal golden braid"}) == "likely"


def test_exact_without_identifier():
    assert level({"title": "GÖDEL, ESCHER, BACH: An Eternal Golden Braid", "author": ["Hofstadter, D"], "date": "1979"}) == "same"


def test_conflicting_identifier_caps():
    assert level({"title": GEB["title"], "author": ["Hofstadter, D"], "date": "1979", "isbn": "9780140179972"}) == "possible"


def test_url():
    other = {"file": "f", "key": "k", "title": "Home", "url": "https://www.example.org/"}
    assert level({"title": "Totally different", "url": "http://example.org"}, other) == "likely"


def test_unrelated():
    assert compare({"title": "Attention Is All You Need", "author": ["Vaswani, Ashish"], "date": "2017"}, GEB) is None
    assert compare({"title": ""}, GEB) is None


def test_match_orders_and_limits():
    others = [
        {**GEB, "file": "a.txt", "isbn": None, "title": "Gödel, Escher, Bach"},
        {"file": "b.txt", "key": "b", "title": "Unrelated"},
        GEB,
    ]
    found = match({"title": GEB["title"], "isbn": GEB["isbn"]}, others)
    assert [f["file"] for f in found] == ["geb.txt", "a.txt"]
    assert found[0] == {"file": "geb.txt", "key": "hofstadter1979", "title": GEB["title"], "level": "same", "reasons": ["ISBN"]}
    assert match({"title": "x"}, others * 3, limit=1) == []
