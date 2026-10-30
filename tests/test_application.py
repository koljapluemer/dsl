from dsl_crud.application import create_app
from dsl_crud.infrastructure import exports


def test_factory_is_repeatable_and_registers_exports_once():
    first = create_app()
    first_exports = set(exports.EXPORTS)
    second = create_app()
    assert {rule.rule for rule in first.url_map.iter_rules()} == {rule.rule for rule in second.url_map.iter_rules()}
    assert first_exports == set(exports.EXPORTS) == {"bibtex", "portfolio", "site"}


def test_factory_registers_public_route_groups():
    rules = {rule.rule for rule in create_app().url_map.iter_rules()}
    assert {
        "/api/items", "/api/search", "/api/questions/next", "/api/graph",
        "/api/sources", "/api/portfolio", "/api/maintenance", "/api/settings",
        "/api/calendar", "/api/files/<path:rel>", "/<path:path>",
    } <= rules


def test_unknown_api_does_not_fall_back_to_frontend():
    assert create_app().test_client().get("/api/not-a-route").status_code == 404
