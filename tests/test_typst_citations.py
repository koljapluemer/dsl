from dsl_crud.features.typst.citations import cited_keys


def test_references_and_cite_calls():
    text = 'See @doe2020, @smith.2019: and #cite(<van-x>) and #cite(label("a/b")).\n@doe2020 again'
    assert cited_keys(text) == ["doe2020", "smith.2019", "van-x", "a/b"]


def test_emails_strings_and_comments_are_skipped():
    text = ('mail me@x.org // @commented\n/* @block\n@also */ #link("https://x.org/@user")[@real]\n'
            '#let s = "@quoted"')
    assert cited_keys(text) == ["real"]
