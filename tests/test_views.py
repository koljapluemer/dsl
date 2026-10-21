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


def test_media_only_images_and_videos():
    assert views.media(parse("x\nmedia a/b.JPG")) == "a/b.JPG"
    assert views.media(parse("x\nmedia a.pdf")) is None


def test_hidings_name_real_types_and_valid_tags():
    for h in (views.QUEUE_HIDING, views.FLOAT_HIDING, views.GRAPH_HIDING):
        assert all(store.SCHEMA["keywords"][t]["role"] == "primary" for t in h.types)
        assert all(dsl.is_tag(t) for t in {h.tag, *h.tags})
