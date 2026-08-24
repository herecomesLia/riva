import pytest
from fastapi.testclient import TestClient

from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel
from tests.helpers.app import create_test_app
from tests.helpers.fakes import FakeDatabase

TEST_DATABASE_URL = "postgresql+asyncpg://riva_test:riva_test@localhost:5432/riva_test"


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        host="127.0.0.1",
        port=7482,
        log_level=LogLevel.INFO,
        log_format=LogFormat.CONSOLE,
        database_url=TEST_DATABASE_URL,
        cors_allowed_origins=["http://localhost:5173"],
        session_digest_key="test-session-digest-key",
        session_cookie_secure=False,
    )


@pytest.fixture
def fake_database() -> FakeDatabase:
    return FakeDatabase()


@pytest.fixture
def app(monkeypatch, test_settings: Settings, fake_database: FakeDatabase):
    return create_test_app(monkeypatch, test_settings, fake_database)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
