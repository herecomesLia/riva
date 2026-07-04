from fastapi.testclient import TestClient

from riva.core.errors import DatabaseUnavailableError
from tests.helpers.app import create_test_app
from tests.helpers.fakes import FakeDatabase


def test_health_returns_ok_when_database_is_available(client, fake_database) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert fake_database.ping_count == 2


def test_health_returns_503_when_database_is_unavailable(
    monkeypatch,
    test_settings,
) -> None:
    database = FakeDatabase(
        ping_results=[None, DatabaseUnavailableError("database down")]
    )
    app = create_test_app(monkeypatch, test_settings, database)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unhealthy",
        "database": "unavailable",
    }
    assert database.ping_count == 2
