from dsl_crud.core.inline_math import MathSpan, math_at
from dsl_crud.infrastructure import markdown


def test_inline_and_display():
    assert math_at("$x^2$ y", 0) == MathSpan(0, 5, "x^2", False)
    assert math_at("$$\n\\int f\n$$", 0) == MathSpan(0, 12, "\n\\int f\n", True)


def test_pandoc_whitespace_and_digits():
    assert math_at("$ x$", 0) is None
    assert math_at("$x $", 0) is None
    assert math_at("$20,000 and $30,000", 0) is None
    assert math_at("$x$1", 0) is None


def test_inline_on_one_line_display_within_a_paragraph():
    assert math_at("$x\ny$", 0) is None
    assert math_at("$$x\n\ny$$", 0) is None
    assert math_at("$$ $$", 0) is None


def test_escaped_dollar_inside():
    assert math_at("$a\\$b$", 0).tex == "a\\$b"


def test_rendered_as_mathml():
    html = markdown.render("a $x^2$ b\n$$\n\\frac{1}{2}\n$$")
    assert '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">' in html
    assert 'display="block"' in html and "<mfrac>" in html


def test_money_escapes_and_code_stay_text():
    assert "<math" not in markdown.render("$20 and $30")
    assert "<math" not in markdown.render("\\$x$")
    assert "<code>$x$</code>" in markdown.render("`$x$`")


def test_math_font_embedded():
    assert "font-family: 'Latin Modern Math'" in markdown.math_font_css()
    assert "data:" in markdown.math_font_css()
