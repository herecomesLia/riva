from fastapi.testclient import TestClient

from riva.core.app import wrap_cors
from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel
from tests.helpers.app import create_test_app
from tests.helpers.fakes import FakeDatabase

TEST_DATABASE_URL = "postgresql+asyncpg://riva_test:riva_test@localhost:5432/riva_test"


def create_cors_client(
    monkeypatch,
    allowed_origins: list[str],
) -> TestClient:
    settings = Settings(
        host="127.0.0.1",
        port=7482,
        log_level=LogLevel.INFO,
        log_format=LogFormat.CONSOLE,
        database_url=TEST_DATABASE_URL,
        cors_allowed_origins=allowed_origins,
        session_digest_key="test-session-digest-key",
        session_cookie_secure=False,
    )
    app = create_test_app(monkeypatch, settings, FakeDatabase())
    return TestClient(wrap_cors(app, settings))


def test_cors_default_does_not_allow_cross_origin(monkeypatch) -> None:
    with create_cors_client(monkeypatch, []) as client:
        response = client.get(
            "/api/health",
            headers={"Origin": "http://localhost:5173"},
        )

    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_configured_single_origin(monkeypatch) -> None:
    origin = "http://localhost:5173"

    with create_cors_client(monkeypatch, [origin]) as client:
        response = client.get("/api/health", headers={"Origin": origin})

    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_allows_configured_multiple_origins(monkeypatch) -> None:
    origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

    with create_cors_client(monkeypatch, origins) as client:
        first_response = client.get(
            "/api/health",
            headers={"Origin": origins[0]},
        )
        second_response = client.get(
            "/api/health",
            headers={"Origin": origins[1]},
        )
        rejected_response = client.get(
            "/api/health",
            headers={"Origin": "http://localhost:3000"},
        )

    assert first_response.headers["access-control-allow-origin"] == origins[0]
    assert second_response.headers["access-control-allow-origin"] == origins[1]
    assert "access-control-allow-origin" not in rejected_response.headers
