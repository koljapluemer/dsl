from dsl_crud.core import inline_refs


def refs(text):
    return [(r.target, r.label) for r in inline_refs.references(text)]


def test_references_and_labels():
    assert refs("See [[alpha-a1b2c3]] and [[beta-123abc|the other note]].") == [
        ("alpha-a1b2c3", None), ("beta-123abc", "the other note")]


def test_code_fences_spans_escapes_and_malformed_are_ignored():
    text = """\\[[escaped]] `[[span]]`
```
[[fenced]]
```
[[bad target]] [[bad|]] [[ok]]"""
    assert refs(text) == [("ok", None)]


def test_tilde_fence_and_longer_closer():
    assert refs("~~~py\n[[no]]\n~~~~\n[[yes]]") == [("yes", None)]


def test_references_in_math_are_tex():
    assert refs("$[[a]]$ $$\n[[b]]\n$$ [[c]]") == [("c", None)]


def test_math_in_a_label_is_text():
    assert refs("[[a|$x$]]") == [("a", "$x$")]


def test_substitute():
    assert inline_refs.substitute("x [[a]] `[[b]]` [[c|C]]", lambda r: r.label or r.target.upper()) == "x A `[[b]]` C"


def test_embeds_are_not_references():
    text = "![[images/a b.webp]] ![[a.webp|Alt]] [[note]] `![[no]]` \\![[c]]"
    # `\!` is a literal `!`, followed by a reference
    assert refs(text) == [("note", None), ("c", None)]
    assert [(e.target, e.label) for e in inline_refs.embeds(text)] == [("images/a b.webp", None), ("a.webp", "Alt")]


def test_substitute_embeds():
    text = "![[a.webp]] [[b]]"
    assert inline_refs.substitute(text, lambda r: "X") == "![[a.webp]] X"
    assert inline_refs.substitute(text, lambda r: "E" if r.embed else "R", embeds=True) == "E R"
