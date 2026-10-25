import pytest

from dsl_crud.infrastructure import exports
from dsl_crud.features.portfolio import service as portfolio
from dsl_crud.features.sources import bibtex_export

exports.register(bibtex_export.definition())
exports.register(portfolio.export_definition())


@pytest.fixture(autouse=True)
def no_background_exports(monkeypatch):
    """API writes schedule an export in a timer thread, which could fire after a
    test has restored the real config; tests call exports.sync themselves."""
    monkeypatch.setattr(exports, "schedule", lambda: None)
