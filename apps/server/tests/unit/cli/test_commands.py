import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

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
) -> tuple[list[tuple[str, dict[str, Any]]], list[tuple[LogLevel, LogFormat]]]:
    uvicorn_calls: list[tuple[str, dict[str, Any]]] = []
    logging_calls: list[tuple[LogLevel, LogFormat]] = []

    def capture_uvicorn_run(application: str, **options: Any) -> None:
        uvicorn_calls.append((application, options))

    def capture_configure_logging(
        log_level: LogLevel,
        log_format: LogFormat,
    ) -> None:
        logging_calls.append((log_level, log_format))

    monkeypatch.setattr(uvicorn, "run", capture_uvicorn_run)
    monkeypatch.setattr(commands, "configure_logging", capture_configure_logging)
    return uvicorn_calls, logging_calls


def test_start_runs_uvicorn_with_settings_defaults(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uvicorn_calls, logging_calls = _capture_boundaries(monkeypatch)

    result = runner.invoke(app, ["start"])

    assert result.exit_code == 0, result.output
    assert len(uvicorn_calls) == 1
    application, options = uvicorn_calls[0]
    assert application == "riva.main:app"
    assert options["host"] == "127.0.0.1"
    assert options["port"] == 7482
    assert options["reload"] is False
    assert options["log_level"] == "info"
    assert options["log_config"] is None
    assert options["access_log"] is False
    assert "reload_dirs" not in options
    assert logging_calls == [(LogLevel.INFO, LogFormat.CONSOLE)]


def test_start_cli_options_override_environment(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_HOST", "env-host")
    monkeypatch.setenv("RIVA_PORT", "8000")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "console")
    uvicorn_calls, logging_calls = _capture_boundaries(monkeypatch)

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
    _, options = uvicorn_calls[0]
    assert options["host"] == "cli-host"
    assert options["port"] == 9000
    assert options["log_level"] == "debug"
    assert logging_calls == [(LogLevel.DEBUG, LogFormat.JSON)]


def test_start_reload_watches_source_root(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uvicorn_calls, _ = _capture_boundaries(monkeypatch)
    monkeypatch.setattr(commands, "_source_root_dir", lambda: Path("/tmp/riva-src"))

    result = runner.invoke(app, ["start", "--reload"])

    assert result.exit_code == 0, result.output
    _, options = uvicorn_calls[0]
    assert options["reload"] is True
    assert options["reload_dirs"] == ["/tmp/riva-src"]


def test_worker_runs_with_environment_settings(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_TASKS_CONCURRENCY", "6")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "json")
    worker_calls: list[tuple[str, int, int | None]] = []
    logging_calls: list[tuple[LogLevel, LogFormat]] = []

    async def capture_run_worker(settings: Any, *, concurrency: int | None) -> None:
        worker_calls.append(
            (settings.database_url, settings.tasks.concurrency, concurrency)
        )

    monkeypatch.setattr(commands, "run_worker", capture_run_worker)
    monkeypatch.setattr(
        commands,
        "configure_logging",
        lambda level, format_: logging_calls.append((level, format_)),
    )

    result = runner.invoke(app, ["worker"])

    assert result.exit_code == 0, result.output
    assert worker_calls == [
        ("postgresql+psycopg://unused:unused@invalid/unused", 6, None)
    ]
    assert logging_calls == [(LogLevel.WARNING, LogFormat.JSON)]


def test_worker_cli_options_override_environment(
    required_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_TASKS_CONCURRENCY", "6")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "warning")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "console")
    worker_calls: list[tuple[int, int | None]] = []
    logging_calls: list[tuple[LogLevel, LogFormat]] = []

    async def capture_run_worker(settings: Any, *, concurrency: int | None) -> None:
        worker_calls.append((settings.tasks.concurrency, concurrency))

    monkeypatch.setattr(commands, "run_worker", capture_run_worker)
    monkeypatch.setattr(
        commands,
        "configure_logging",
        lambda level, format_: logging_calls.append((level, format_)),
    )

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
    assert worker_calls == [(6, 8)]
    assert logging_calls == [(LogLevel.DEBUG, LogFormat.JSON)]
