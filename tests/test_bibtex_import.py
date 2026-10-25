import pytest

from dsl_crud.features.sources.bibtex_import import parse
from dsl_crud.features.sources.fields import normalise


def test_article_legacy_fields():
    [s] = parse(r"""@article{Foo:2020,
      author={M{\"u}ller, Hans and {Some Corp} and van der Berg, Jan},
      title={A {T}itle}, journal={J}, year=2020, month=jan, volume={3}, weird={x}}""")
    assert s["entrytype"] == "article"
    assert s["journaltitle"] == "J"
    assert s["date"] == "2020-01"
    assert s["volume"] == 3
    assert s["title"] == "A Title"
    assert s["author"] == [
        "Müller, Hans",
        "Some Corp",
        "van der Berg, Jan",
    ]
    assert "weird" not in s and "extra" not in s
    normalise(s)


def test_legacy_types():
    a, b, c = parse("""@phdthesis{t, author={X, Y}, school={U}, year=2001}
      @conference{c, title={C}}
      @misc{m, howpublished={\\url{http://a.b/c}}}""")
    assert (a["entrytype"], a["type"], a["institution"]) == ("thesis", "phdthesis", ["U"])
    assert b["entrytype"] == "inproceedings"
    assert c["url"] == "http://a.b/c" and "howpublished" not in c
    for s in (a, b, c):
        normalise(s)


def test_not_bibtex():
    with pytest.raises(ValueError):
        parse("just some text")
