import dsl
import store
import views

parse = lambda text: dsl.parse(store.SCHEMA, text)


def test_when_appointment():
    assert views.when(parse("x\nappointment 26-08-29")) == {"appointment": "2026-08-29"}


def test_when_recurring_until_date_and_month():
    assert views.when(parse("x\nrecurring mo")) == {"recurring": 1, "until": None}
    assert views.when(parse("x\nrecurring su until 26-03-27")) == {"recurring": 7, "until": "2026-03-27"}
    assert views.when(parse("x\nrecurring we until 28-02")) == {"recurring": 3, "until": "2028-02-29"}


def test_when_none_for_plain_or_invalid():
    assert views.when(parse("just a note")) is None
    assert views.when(parse("x\nappointment 26-02-30")) is None


def test_primary_and_tags():
    doc = parse("x\nappointment 26-08-29\ntags zero b")
    assert views.primary(store.SCHEMA, doc) == "appointment"
    assert views.tags(doc) == ["zero", "b"]
    assert views.primary(store.SCHEMA, parse("note")) is None


def test_hashtags_in_body_and_extra():
    doc = parse("read #Article, not foo#bar\nextra\nsee #project-idea")
    assert views.hashtags(doc) == {"#article", "#project-idea"}


def test_view_media_only_images_and_videos():
    assert views.view({}, parse("x\nmedia a/b.JPG"))["media"] == "a/b.JPG"
    assert views.view({}, parse("x\nmedia a.pdf"))["media"] is None
