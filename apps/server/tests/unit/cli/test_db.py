import os
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Self

import pytest
from typer.testing import CliRunner

from riva.cli import db as db_commands
from riva.cli.main import app

runner = CliRunner()


@dataclass
class DatabaseCalls:
    urls: list[str] = field(default_factory=list)
    entered: int = 0
    exited: int = 0
    create_tables: int = 0
    reset: int = 0
    failure_operation: str | None = None


@pytest.fixture(autouse=True)
def restore_riva_environment() -> Iterator[None]:
    original = {
        key: value for key, value in os.environ.items() if key.startswith("RIVA_")
    }
    for key in original:
        os.environ.pop(key)

    yield

    for key in list(os.environ):
        if key.startswith("RIVA_"):
            os.environ.pop(key)
    os.environ.update(original)


@pytest.fixture(autouse=True)
def required_environment(
    restore_riva_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+psycopg://unused:unused@invalid/unused",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "test-session-digest-key")


@pytest.fixture
def database_calls(monkeypatch: pytest.MonkeyPatch) -> DatabaseCalls:
    calls = DatabaseCalls()

    class DatabaseDouble:
        def __init__(self, database_url: str) -> None:
            calls.urls.append(database_url)

        async def __aenter__(self) -> Self:
            calls.entered += 1
            return self

        async def __aexit__(self, *args: object) -> None:
            calls.exited += 1

        async def create_tables(self) -> None:
            calls.create_tables += 1
            if calls.failure_operation == "create_tables":
                raise RuntimeError("database failure")

        async def reset(self) -> None:
            calls.reset += 1
            if calls.failure_operation == "reset":
                raise RuntimeError("database failure")

    monkeypatch.setattr(db_commands, "Database", DatabaseDouble)
    return calls


@pytest.mark.parametrize("command", ["setup", "reset"])
def test_database_command_cancellation_does_not_open_database(
    command: str,
    database_calls: DatabaseCalls,
) -> None:
    result = runner.invoke(app, ["db", command], input="n\n")

    assert result.exit_code == 1
    assert database_calls.urls == []
    assert database_calls.entered == 0
    assert database_calls.create_tables == 0
    assert database_calls.reset == 0


@pytest.mark.parametrize(
    ("command", "operation"),
    [("setup", "create_tables"), ("reset", "reset")],
)
def test_database_command_yes_executes_requested_operation(
    command: str,
    operation: str,
    database_calls: DatabaseCalls,
) -> None:
    result = runner.invoke(app, ["db", command, "--yes"])

    assert result.exit_code == 0, result.output
    assert len(database_calls.urls) == 1
    assert database_calls.entered == 1
    assert database_calls.exited == 1
    assert getattr(database_calls, operation) == 1


@pytest.mark.parametrize(
    ("command", "operation"),
    [("setup", "create_tables"), ("reset", "reset")],
)
def test_database_command_failure_returns_nonzero_exit(
    command: str,
    operation: str,
    database_calls: DatabaseCalls,
) -> None:
    database_calls.failure_operation = operation

    result = runner.invoke(app, ["db", command, "--yes"])

    assert result.exit_code == 1
    assert getattr(database_calls, operation) == 1
    assert database_calls.exited == 1
    assert "Failed" in result.output
