import os
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from typer.testing import CliRunner

from riva.cli import db as db_commands
from riva.cli.main import app
from riva.core.config import DatabaseSettings

runner = CliRunner()
DATABASE_URL = "postgresql+psycopg://unused:unused@invalid/unused"


@pytest.fixture(autouse=True)
def restore_riva_environment() -> Iterator[None]:
    with patch.dict(os.environ):
        for key in list(os.environ):
            if key.startswith("RIVA_"):
                os.environ.pop(key)
        yield


@pytest.fixture(autouse=True)
def required_environment(
    restore_riva_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "test-session-digest-key")


@pytest.fixture
def database_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Mock, MagicMock, AsyncMock, AsyncMock]:
    database = MagicMock()
    database.__aenter__ = AsyncMock(return_value=database)
    database.__aexit__ = AsyncMock(return_value=None)
    database.create_tables = AsyncMock()
    database.reset = AsyncMock()

    database_factory = Mock(return_value=database)
    setup_task_schema = AsyncMock()
    reset_task_schema = AsyncMock()
    monkeypatch.setattr(db_commands, "Database", database_factory)
    monkeypatch.setattr(db_commands, "setup_task_schema", setup_task_schema)
    monkeypatch.setattr(db_commands, "reset_task_schema", reset_task_schema)
    monkeypatch.setattr(db_commands, "setup_checkpoints", AsyncMock())
    return database_factory, database, setup_task_schema, reset_task_schema


@pytest.mark.parametrize("command", ["setup", "reset"])
def test_database_command_cancellation_does_not_open_database(
    command: str,
    database_calls: tuple[Mock, MagicMock, AsyncMock, AsyncMock],
) -> None:
    database_factory, _, setup_task_schema, reset_task_schema = database_calls
    result = runner.invoke(app, ["db", command], input="n\n")

    assert result.exit_code == 1
    database_factory.assert_not_called()
    setup_task_schema.assert_not_awaited()
    reset_task_schema.assert_not_awaited()
    db_commands.setup_checkpoints.assert_not_awaited()


@pytest.mark.parametrize(
    ("command", "operation"),
    [("setup", "create_tables"), ("reset", "reset")],
)
def test_database_command_yes_executes_requested_operation(
    command: str,
    operation: str,
    database_calls: tuple[Mock, MagicMock, AsyncMock, AsyncMock],
) -> None:
    database_factory, database, setup_task_schema, reset_task_schema = database_calls
    result = runner.invoke(app, ["db", command, "--yes"])

    assert result.exit_code == 0, result.output
    database_factory.assert_called_once_with(DatabaseSettings(url=DATABASE_URL))
    database.__aenter__.assert_awaited_once_with()
    database.__aexit__.assert_awaited_once()
    getattr(database, operation).assert_awaited_once_with()
    db_commands.setup_checkpoints.assert_awaited_once_with(DATABASE_URL)
    if command == "setup":
        setup_task_schema.assert_awaited_once_with(database)
        reset_task_schema.assert_not_awaited()
    else:
        setup_task_schema.assert_not_awaited()
        reset_task_schema.assert_awaited_once_with(database)


@pytest.mark.parametrize(
    ("command", "operation"),
    [("setup", "create_tables"), ("reset", "reset")],
)
def test_database_command_failure_returns_nonzero_exit(
    command: str,
    operation: str,
    database_calls: tuple[Mock, MagicMock, AsyncMock, AsyncMock],
) -> None:
    _, database, _, _ = database_calls
    getattr(database, operation).side_effect = RuntimeError("database failure")

    result = runner.invoke(app, ["db", command, "--yes"])

    assert result.exit_code == 1
    getattr(database, operation).assert_awaited_once_with()
    database.__aexit__.assert_awaited_once()
    assert "Failed" in result.output
    db_commands.setup_checkpoints.assert_not_awaited()
