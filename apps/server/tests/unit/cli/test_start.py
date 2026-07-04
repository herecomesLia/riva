from pathlib import Path

import uvicorn
from typer.testing import CliRunner

import riva.cli.commands as commands_module
from riva.cli.main import app
from riva.core.logging import LogFormat, LogLevel


def test_start_passes_cli_options_to_uvicorn(monkeypatch) -> None:
    runner = CliRunner()
    run_calls: list[tuple[str, dict[str, object]]] = []
    logging_calls: list[tuple[LogLevel, LogFormat]] = []
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db",
    )
    monkeypatch.setattr(
        uvicorn,
        "run",
        lambda target, **options: run_calls.append((target, options)),
    )
    monkeypatch.setattr(
        commands_module,
        "configure_logging",
        lambda log_level, log_format: logging_calls.append((log_level, log_format)),
    )

    result = runner.invoke(
        app,
        [
            "start",
            "--host",
            "0.0.0.0",
            "--port",
            "9001",
            "--log-level",
            "debug",
            "--log-format",
            "json",
        ],
    )

    assert result.exit_code == 0, result.output
    assert logging_calls == [(LogLevel.DEBUG, LogFormat.JSON)]
    assert run_calls == [
        (
            "riva.main:app",
            {
                "host": "0.0.0.0",
                "port": 9001,
                "reload": False,
                "log_level": "debug",
                "log_config": None,
                "access_log": False,
            },
        )
    ]


def test_start_passes_reload_source_directory(monkeypatch) -> None:
    runner = CliRunner()
    run_calls: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db",
    )
    monkeypatch.setattr(
        uvicorn,
        "run",
        lambda target, **options: run_calls.append((target, options)),
    )
    monkeypatch.setattr(commands_module, "configure_logging", lambda *_args: None)

    result = runner.invoke(app, ["start", "--reload"])

    assert result.exit_code == 0, result.output
    assert run_calls[0][0] == "riva.main:app"
    options = run_calls[0][1]
    assert options["reload"] is True
    assert Path(options["reload_dirs"][0]).name == "src"
    assert Path(options["reload_dirs"][0], "riva").is_dir()
