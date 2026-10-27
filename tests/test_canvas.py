import pytest

from dsl_crud.application import create_app
from dsl_crud.core import canvas, dsl, edits
from dsl_crud.infrastructure import config

SCHEMA = dsl.load_schema()
NODES = [{"id": "a", "x": 1, "y": 2, "text": "multi\nline: with colon"}, {"id": "b", "x": -3.5, "y": 4, "note": "other-abc123"}]


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "cfg" / "config.json")
    config.set_path(str(tmp_path / "data"))
    return tmp_path / "data"


@pytest.fixture
def client(data_dir):
    return create_app().test_client()


def test_set_data_key_keeps_other_keys_and_comments():
    text = "Title\ndata\n# top\na: 1  # keep\ncanvas:\n  nodes: []\n# about b\nb:\n  - x\nextra\nfree\n"
    result = edits.set_data_key(SCHEMA, text, "canvas", {"nodes": NODES})
    assert "# top\na: 1  # keep\n" in result
    assert "# about b\nb:\n  - x\nextra\nfree\n" in result
    doc = dsl.parse(SCHEMA, result)
    assert doc.data == {"a": 1, "canvas": {"nodes": NODES}, "b": ["x"]}
    assert doc.extra == ["free"]


@pytest.mark.parametrize("text", ["a", "a\n", "\n", "a\n\n", "a\nb", " lead\nx", "trail \nx", "x\n\n\ny", "  ", "a\n  "])
def test_set_data_key_round_trips_any_text(text):
    value = {"nodes": [{"id": "i", "x": 0, "y": 0, "text": text}]}
    for host in ("Host\n", "Host\ndata\ncanvas: 1\nafter: 2\n"):
        assert dsl.parse(SCHEMA, edits.set_data_key(SCHEMA, host, "canvas", value)).data["canvas"] == value


def test_set_data_key_adds_the_key_or_the_block():
    assert dsl.parse(SCHEMA, edits.set_data_key(SCHEMA, "T\ndata\nz: 1\n", "canvas", {"nodes": []})).data == {"z": 1, "canvas": {"nodes": []}}
    added = edits.set_data_key(SCHEMA, "T\nbody\nextra\nlong text\n", "canvas", {"nodes": NODES})
    doc = dsl.parse(SCHEMA, added)
    assert doc.data == {"canvas": {"nodes": NODES}} and doc.extra == ["long text"] and doc.body == ["T", "body"]


def test_set_data_key_rewrites_a_flow_mapping():
    assert dsl.parse(SCHEMA, edits.set_data_key(SCHEMA, "T\ndata\n{a: 1, canvas: 2}\n", "canvas", {"nodes": []})).data == {"a": 1, "canvas": {"nodes": []}}


@pytest.mark.parametrize("block", ["- a\n", "a: [\n"])
def test_set_data_key_refuses_unreadable_data(block):
    with pytest.raises(edits.DataError):
        edits.set_data_key(SCHEMA, "T\ndata\n" + block, "canvas", {"nodes": []})


def test_body_text_indents_section_openers():
    text = edits.body_text(SCHEMA, "data first line\ndata\n-> x @y\ntags a\nnormal")
    doc = dsl.parse(SCHEMA, text)
    assert doc.body == ["data first line", " data", " -> x @y", " tags a", "normal"] and not doc.clauses and not doc.blocks


def test_validate_reports_and_keeps_order():
    nodes, problems = canvas.validate([*NODES, {"id": "a", "x": 0, "y": 0, "text": ""}, {"id": "c", "x": 0, "y": 0},
                                        {"id": "d", "x": True, "y": 0, "text": ""}, {"id": "e", "x": 0, "y": 0, "note": "a b"},
                                        {"id": "f", "x": 0, "y": 0, "text": "", "color": "red"}])
    assert nodes == NODES
    assert len(problems) == 5


def test_api_round_trip_and_conflict(client, data_dir):
    host = client.post("/api/items", json={"text": "Host\ndata\nkeep: me\n"}).get_json()["file"]
    first = client.get(f"/api/items/{host}/canvas").get_json()
    assert first == {"nodes": [], "problems": [], "rev": canvas.rev(None), "dataError": None}

    put = client.put(f"/api/items/{host}/canvas", json={"nodes": NODES, "rev": first["rev"]})
    assert put.status_code == 200
    again = client.get(f"/api/items/{host}/canvas").get_json()
    assert again["nodes"] == NODES and again["rev"] == put.get_json()["rev"]
    assert (data_dir / host).read_text().startswith("Host\ndata\nkeep: me\ncanvas:\n")

    stale = client.put(f"/api/items/{host}/canvas", json={"nodes": [], "rev": first["rev"]})
    assert stale.status_code == 409
    assert client.get(f"/api/items/{host}/canvas").get_json()["nodes"] == NODES


def test_api_keeps_concurrent_body_edits(client, data_dir):
    host = client.post("/api/items", json={"text": "Host\n"}).get_json()["file"]
    rev = client.get(f"/api/items/{host}/canvas").get_json()["rev"]
    client.put(f"/api/items/{host}", json={"text": "Host edited\nmore\n"})
    assert client.put(f"/api/items/{host}/canvas", json={"nodes": NODES, "rev": rev}).status_code == 200
    assert dsl.parse(SCHEMA, (data_dir / host).read_text()).body == ["Host edited", "more"]


def test_api_refuses_to_write_over_problems(client, data_dir):
    host = client.post("/api/items", json={"text": "Host\ndata\ncanvas:\n  nodes:\n  - {id: a, x: 1}\n"}).get_json()["file"]
    got = client.get(f"/api/items/{host}/canvas").get_json()
    assert got["nodes"] == [] and len(got["problems"]) == 1
    assert client.put(f"/api/items/{host}/canvas", json={"nodes": [], "rev": got["rev"]}).status_code == 400

    broken = client.post("/api/items", json={"text": "Broken\ndata\n- a\n"}).get_json()["file"]
    got = client.get(f"/api/items/{broken}/canvas").get_json()
    assert got["dataError"]
    assert client.put(f"/api/items/{broken}/canvas", json={"nodes": [], "rev": got["rev"]}).status_code == 400
    assert (data_dir / broken).read_text() == "Broken\ndata\n- a\n"


def test_api_refuses_invalid_nodes(client):
    host = client.post("/api/items", json={"text": "Host\n"}).get_json()["file"]
    rev = client.get(f"/api/items/{host}/canvas").get_json()["rev"]
    assert client.put(f"/api/items/{host}/canvas", json={"nodes": [{"id": "a"}], "rev": rev}).status_code == 400


def test_api_creates_a_note_from_text(client, data_dir):
    made = client.post("/api/canvas/note", json={"text": "\nHeading\ndata\nmore\n"})
    assert made.status_code == 201
    item = made.get_json()
    assert (data_dir / item["file"]).read_text() == "Heading\n data\nmore\n"
    assert client.post("/api/canvas/note", json={"text": "  "}).status_code == 400
