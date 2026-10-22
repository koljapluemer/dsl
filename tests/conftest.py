import pytest

import exports


@pytest.fixture(autouse=True)
def no_background_exports(monkeypatch):
    """API writes schedule an export in a timer thread, which could fire after a
    test has restored the real config; tests call exports.sync themselves."""
    monkeypatch.setattr(exports, "schedule", lambda: None)
