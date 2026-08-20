from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel
from tests.helpers.app import create_test_app
from tests.helpers.fakes import FakeDatabase


TEST_DATABASE_URL = "postgresql+asyncpg://riva_test:riva_test@localhost:5432/riva_test"
TESTS_ROOT = Path(__file__).parent.resolve()
SLOW_TEST_PATHS = frozenset(
    {
        "integration/test_competency_migration.py",
        "integration/test_interview_completion_workflow.py",
        "integration/test_job_description_parsing_worker.py",
        "integration/test_matching_analysis_service.py",
        "integration/test_matching_analysis_worker.py",
        "integration/test_migrations.py",
        "integration/test_practice_reference_answer_workflow.py",
        "integration/test_practice_review_workflow.py",
        "integration/test_practice_weakness_priority_workflow.py",
        "integration/test_resume_import_api.py",
        "integration/test_resume_parsing_worker.py",
        "integration/test_training_intelligence_journey.py",
        "unit/evals/test_runner.py",
    }
)


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Apply the server test taxonomy from stable directory responsibilities."""

    for item in items:
        relative_path = item.path.resolve().relative_to(TESTS_ROOT).as_posix()
        parts = relative_path.split("/")

        if parts[0] == "unit":
            _add_marker(item, "unit")
        elif parts[0] == "integration":
            _add_marker(item, "integration")

        if parts[:2] == ["unit", "evals"]:
            _add_marker(item, "eval")
        if parts[0] == "integration" and "migration" in item.path.name:
            _add_marker(item, "migration")
        if relative_path in SLOW_TEST_PATHS:
            _add_marker(item, "slow")


def _add_marker(item: pytest.Item, marker_name: str) -> None:
    if item.get_closest_marker(marker_name) is None:
        item.add_marker(getattr(pytest.mark, marker_name))


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
