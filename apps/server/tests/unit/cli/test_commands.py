import os
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest
import uvicorn
from typer.testing import CliRunner

from riva.cli import commands
from riva.cli.main import app
from riva.core.logging import LogFormat, LogLevel

runner = CliRunner()


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


@pytest.fixture
def required_environment(
    restore_riva_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+psycopg://unused:unused@invalid/unused",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "test-session-digest-key")


def _capture_boundaries(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Mock, Mock]:
    uvicorn_run = Mock()
    configure_logging = Mock()

    monkeypatch.setattr(uvicorn, "run", uvicorn_run)
    monkeypatch.setattr(commands, "configure_logging", configure_logging)
    return uvicorn_run, configure_logging


def test_start_runs_uvicorn_with_settings_defaults(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uvicorn_run, configure_logging = _capture_boundaries(monkeypatch)

    result = runner.invoke(app, ["start"])

    assert result.exit_code == 0, result.output
    uvicorn_run.assert_called_once()
    application = uvicorn_run.call_args.args[0]
    options = uvicorn_run.call_args.kwargs
    assert application == "riva.main:app"
    assert options["host"] == "127.0.0.1"
    assert options["port"] == 7482
    assert options["reload"] is False
    assert options["log_level"] == "info"
    assert options["log_config"] is None
    assert options["access_log"] is False
    assert "reload_dirs" not in options
    configure_logging.assert_called_once_with(LogLevel.INFO, LogFormat.CONSOLE)


def test_start_cli_options_override_environment(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_HOST", "env-host")
    monkeypatch.setenv("RIVA_PORT", "8000")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "console")
    uvicorn_run, configure_logging = _capture_boundaries(monkeypatch)

    result = runner.invoke(
        app,
        [
            "start",
            "--host",
            "cli-host",
            "--port",
            "9000",
            "--log-level",
            "debug",
            "--log-format",
            "json",
        ],
    )

    assert result.exit_code == 0, result.output
    options = uvicorn_run.call_args.kwargs
    assert options["host"] == "cli-host"
    assert options["port"] == 9000
    assert options["log_level"] == "debug"
    configure_logging.assert_called_once_with(LogLevel.DEBUG, LogFormat.JSON)


def test_start_reload_watches_source_root(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uvicorn_run, _ = _capture_boundaries(monkeypatch)
    monkeypatch.setattr(commands, "_source_root_dir", lambda: Path("/tmp/riva-src"))

    result = runner.invoke(app, ["start", "--reload"])

    assert result.exit_code == 0, result.output
    options = uvicorn_run.call_args.kwargs
    assert options["reload"] is True
    assert options["reload_dirs"] == ["/tmp/riva-src"]


def test_worker_runs_with_environment_settings(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_TASKS_CONCURRENCY", "6")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "json")
    run_worker = AsyncMock()
    configure_logging = Mock()
    monkeypatch.setattr(commands, "run_worker", run_worker)
    monkeypatch.setattr(commands, "configure_logging", configure_logging)

    result = runner.invoke(app, ["worker"])

    assert result.exit_code == 0, result.output
    run_worker.assert_awaited_once()
    settings = run_worker.await_args.args[0]
    assert settings.database_url == "postgresql+psycopg://unused:unused@invalid/unused"
    assert settings.tasks.concurrency == 6
    assert run_worker.await_args.kwargs["concurrency"] is None
    configure_logging.assert_called_once_with(LogLevel.WARNING, LogFormat.JSON)


def test_worker_cli_options_override_environment(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_TASKS_CONCURRENCY", "6")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "console")
    run_worker = AsyncMock()
    configure_logging = Mock()
    monkeypatch.setattr(commands, "run_worker", run_worker)
    monkeypatch.setattr(commands, "configure_logging", configure_logging)

    result = runner.invoke(
        app,
        [
            "worker",
            "--concurrency",
            "8",
            "--log-level",
            "debug",
            "--log-format",
            "json",
        ],
    )

    assert result.exit_code == 0, result.output
    run_worker.assert_awaited_once()
    settings = run_worker.await_args.args[0]
    assert settings.tasks.concurrency == 6
    assert run_worker.await_args.kwargs["concurrency"] == 8
    configure_logging.assert_called_once_with(LogLevel.DEBUG, LogFormat.JSON)
