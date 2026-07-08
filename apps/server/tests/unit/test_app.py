import pytest
from fastapi.testclient import TestClient

from riva.core.errors import DatabaseUnavailableError
from tests.helpers.app import create_test_app
from tests.helpers.fakes import FakeDatabase


def test_create_app_uses_settings_and_database_factory(
    app,
    test_settings,
    fake_database,
) -> None:
    assert app.state.settings is test_settings
    assert app.state.database is fake_database
    assert fake_database.database_urls == [test_settings.database_url]


def test_lifespan_pings_database_and_disposes_on_shutdown(app, fake_database) -> None:
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert fake_database.ping_count == 2
        assert fake_database.dispose_count == 0

    assert fake_database.enter_count == 1
    assert fake_database.exit_count == 1
    assert fake_database.dispose_count == 1


def test_lifespan_fails_when_database_is_unavailable(
    monkeypatch,
    test_settings,
) -> None:
    database = FakeDatabase(ping_results=[DatabaseUnavailableError("database down")])
    app = create_test_app(monkeypatch, test_settings, database)

    with pytest.raises(DatabaseUnavailableError, match="database down"):
        with TestClient(app):
            pass

    assert database.ping_count == 1
    assert database.dispose_count == 1
