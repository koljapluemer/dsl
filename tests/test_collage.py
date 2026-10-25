import io

import pytest

from dsl_crud.features.portfolio import collage

pytestmark = pytest.mark.skipif(not collage.available()["available"], reason=str(collage.available()["reason"]))

from PIL import Image  # noqa: E402 - only with the `cards` group


@pytest.fixture(autouse=True)
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(collage, "CACHE_DIR", tmp_path / "cache")
    return tmp_path / "cache"


@pytest.fixture(scope="module")
def session():
    with collage.Session() as s:
        yield s


def images(tmp_path, *sizes):
    out = []
    for i, size in enumerate(sizes):
        p = tmp_path / f"{i}.png"
        Image.new("RGB", size, (200, 100, 50)).save(p)
        out.append(p)
    return out


def size(webp: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(webp)) as im:
        assert im.format == "WEBP"
        return im.size


def test_page_and_thumbnail(tmp_path, session):
    page, thumb = session.render("Title", "<p>Some <strong>bold</strong> text.</p>", images(tmp_path, (800, 600), (600, 900)))
    assert size(page) == (collage.WIDTH, collage.HEIGHT) == (1754, 1240)
    assert size(thumb)[0] == collage.THUMB_WIDTH


LONG_WORD = "Supercalifragilisticexpialidocious" * 4


@pytest.mark.parametrize("title, body, sizes, layout", [
    ("Only text", "<p>" + "lorem ipsum " * 200 + "</p>", [], "text"),
    ("", "", [(800, 600), (600, 900), (1200, 500), (500, 500), (900, 300), (300, 1200)], "images"),
    ("Short", "<p>a line</p>", [(800, 600)], "band-left"),
    ("Title only", "", [(800, 600)], "band-images"),
    (LONG_WORD, "<p>" + LONG_WORD * 3 + "</p>", [(800, 600), (4000, 3000)], None),
    ("Many", "<ul>" + "<li>an item with words</li>" * 40 + "</ul>", [(300, 1200)] * 7, None),
])
def test_everything_stays_on_the_page(tmp_path, session, title, body, sizes, layout):
    _, result = session.layout(title, body, images(tmp_path, *sizes))
    assert result["inside"] and result["fits"] and result["titleWhole"]
    assert result["images"] == len(sizes)
    if layout:
        assert result["layout"] == layout


@pytest.mark.parametrize("title", [LONG_WORD[:60], "Antidisestablishmentarianism Pneumonoultramicroscopic " * 3])
def test_the_title_is_not_broken_inside_a_word(tmp_path, session, title):
    _, result = session.layout(title, "<p>" + "text " * 300 + "</p>", images(tmp_path, (800, 600), (600, 900)))
    assert result["titleWhole"] and result["inside"]
    assert result["titleSize"] >= 16


def test_a_title_too_long_for_its_share_leaves_the_text_on_the_page(tmp_path, session):
    title = "\n".join(["A line of the title"] * 40)
    for sizes in ([], [(800, 600)]):
        _, result = session.layout(title, "<p>" + "text " * 500 + "</p>", images(tmp_path, *sizes))
        assert result["inside"]


def test_a_word_too_long_for_the_page_is_broken_as_a_last_resort(session):
    _, result = session.layout("x" * 400, "", [])
    assert result["inside"] and not result["titleWhole"]


def test_too_much_text_is_cut_inside_its_box(tmp_path, session):
    _, result = session.layout("T", "<p>" + "word " * 8000 + "</p>", images(tmp_path, (800, 600)))
    assert result["inside"] and not result["fits"]


def test_missing_and_unreadable_images_are_left_out(tmp_path, session):
    bad = tmp_path / "bad.png"
    bad.write_text("not an image")
    _, result = session.layout("T", "", [tmp_path / "missing.png", bad])
    assert result["images"] == 0 and result["layout"] == "text"


def test_cached(tmp_path, cache_dir, session, monkeypatch):
    [img] = images(tmp_path, (400, 300))
    first = session.render("T", "<p>x</p>", [img])
    monkeypatch.setattr(session, "layout", lambda *a: pytest.fail("rendered again"))
    assert session.render("T", "<p>x</p>", [img]) == first
    assert len(list(cache_dir.iterdir())) == 2
