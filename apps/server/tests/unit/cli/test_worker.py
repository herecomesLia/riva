import os

from typer.testing import CliRunner

import riva.cli.worker as worker_module
from riva.cli.main import app
from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel
from riva.integrations import LLMProviderConfigurationError


WORKER_ENV_KEYS = [
    "RIVA_DATABASE_URL",
    "RIVA_SESSION_DIGEST_KEY",
    "RIVA_LLM_PROVIDER",
    "RIVA_LLM_MODEL",
    "RIVA_LLM_API_KEY",
    "RIVA_LLM_BASE_URL",
    "RIVA_LLM_TIMEOUT_SECONDS",
    "RIVA_LLM_ENABLE_THINKING",
    "RIVA_WORKER_ID",
    "RIVA_WORKER_LEASE_SECONDS",
    "RIVA_WORKER_HEARTBEAT_SECONDS",
    "RIVA_WORKER_POLL_SECONDS",
    "RIVA_WORKER_REQUEUE_SECONDS",
    "RIVA_WORKER_RETRY_BASE_SECONDS",
    "RIVA_WORKER_RETRY_MAX_SECONDS",
    "RIVA_WORKER_REQUEUE_BATCH_SIZE",
    "RIVA_LOG_LEVEL",
    "RIVA_LOG_FORMAT",
]


def clear_worker_env(monkeypatch) -> None:
    for key in WORKER_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_cli_help_lists_worker_and_worker_help_is_available() -> None:
    runner = CliRunner()

    root_help = runner.invoke(app, ["--help"])
    worker_help = runner.invoke(app, ["worker", "--help"])

    assert root_help.exit_code == 0
    assert "worker" in root_help.output
    assert worker_help.exit_code == 0
    assert "PostgreSQL-backed Agent queue Worker" in worker_help.output
    assert "--env-file" in worker_help.output
    assert "--worker-id" in worker_help.output


def test_worker_reads_env_file_and_applies_cli_overrides(
    monkeypatch,
    tmp_path,
) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    settings_seen: list[Settings] = []
    logging_calls: list[tuple[LogLevel, LogFormat]] = []
    env_file = tmp_path / "worker.env"
    env_file.write_text(
        "\n".join(
            [
                "RIVA_DATABASE_URL=postgresql+asyncpg://worker:test@localhost/db",
                "RIVA_SESSION_DIGEST_KEY=worker-session-key",
                "RIVA_WORKER_ID=env-worker",
                "RIVA_WORKER_LEASE_SECONDS=420",
                "RIVA_WORKER_HEARTBEAT_SECONDS=70",
                "RIVA_LOG_LEVEL=info",
                "RIVA_LOG_FORMAT=console",
            ]
        )
    )
    monkeypatch.setenv("RIVA_WORKER_ID", "os-worker")

    async def fake_run_worker(settings: Settings) -> None:
        settings_seen.append(settings)

    monkeypatch.setattr(worker_module, "run_worker", fake_run_worker)
    monkeypatch.setattr(
        worker_module,
        "configure_logging",
        lambda level, format: logging_calls.append((level, format)),
    )

    result = runner.invoke(
        app,
        [
            "worker",
            "--env-file",
            str(env_file),
            "--worker-id",
            "cli-worker",
            "--log-level",
            "debug",
            "--log-format",
            "json",
        ],
    )

    assert result.exit_code == 0, result.output
    assert settings_seen[0].database_url.endswith("@localhost/db")
    assert settings_seen[0].worker_id == "cli-worker"
    assert settings_seen[0].worker_lease_seconds == 420
    assert settings_seen[0].worker_heartbeat_seconds == 70
    assert logging_calls == [(LogLevel.DEBUG, LogFormat.JSON)]
    assert os.environ["RIVA_WORKER_ID"] == "os-worker"


def test_worker_configuration_error_has_nonzero_exit(
    monkeypatch,
    tmp_path,
) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    env_file = tmp_path / "invalid-worker.env"
    env_file.write_text(
        "\n".join(
            [
                "RIVA_DATABASE_URL=postgresql+asyncpg://worker:test@localhost/db",
                "RIVA_SESSION_DIGEST_KEY=worker-session-key",
                "RIVA_WORKER_LEASE_SECONDS=60",
                "RIVA_WORKER_HEARTBEAT_SECONDS=60",
            ]
        )
    )
    called = False

    async def fake_run_worker(_settings: Settings) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(worker_module, "run_worker", fake_run_worker)

    result = runner.invoke(
        app,
        ["worker", "--env-file", str(env_file)],
    )

    assert result.exit_code != 0
    assert "Invalid worker configuration." in result.output
    assert called is False


def test_worker_runtime_error_has_safe_nonzero_exit(monkeypatch) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://secret:password@localhost/private",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "worker-session-key")
    monkeypatch.setattr(worker_module, "configure_logging", lambda *_args: None)

    async def failing_worker(_settings: Settings) -> None:
        raise RuntimeError("private payload and database password")

    monkeypatch.setattr(worker_module, "run_worker", failing_worker)

    result = runner.invoke(app, ["worker"])

    assert result.exit_code == 1
    assert "Worker failed. See logs for details." in result.output
    assert "private payload" not in result.output
    assert "secret:password" not in result.output


def test_worker_with_complete_qwen_configuration_enters_run_worker(
    monkeypatch,
    tmp_path,
) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    settings_seen: list[Settings] = []
    api_key = "cli-qwen-test-api-key"
    env_file = tmp_path / "qwen-worker.env"
    env_file.write_text(
        "\n".join(
            [
                "RIVA_DATABASE_URL=postgresql+asyncpg://worker:test@localhost/db",
                "RIVA_SESSION_DIGEST_KEY=worker-session-key",
                "RIVA_LLM_PROVIDER=qwen",
                "RIVA_LLM_MODEL=qwen-test-model",
                f"RIVA_LLM_API_KEY={api_key}",
                "RIVA_LLM_BASE_URL=https://example.invalid/compatible-mode/v1",
            ]
        )
    )

    async def fake_run_worker(settings: Settings) -> None:
        settings_seen.append(settings)

    monkeypatch.setattr(worker_module, "run_worker", fake_run_worker)
    monkeypatch.setattr(worker_module, "configure_logging", lambda *_args: None)

    result = runner.invoke(
        app,
        ["worker", "--env-file", str(env_file)],
    )

    assert result.exit_code == 0, result.output
    assert len(settings_seen) == 1
    assert settings_seen[0].llm_provider == "qwen"
    assert settings_seen[0].llm_model == "qwen-test-model"
    assert settings_seen[0].llm_api_key is not None
    assert settings_seen[0].llm_api_key.get_secret_value() == api_key
    assert api_key not in result.output


def test_worker_provider_configuration_error_has_safe_nonzero_exit(
    monkeypatch,
) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    api_key = "cli-private-api-key"
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://worker:test@localhost/db",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "worker-session-key")
    monkeypatch.setenv("RIVA_LLM_PROVIDER", "qwen")
    monkeypatch.setenv("RIVA_LLM_MODEL", "qwen-test-model")
    monkeypatch.setenv("RIVA_LLM_API_KEY", api_key)
    monkeypatch.setenv(
        "RIVA_LLM_BASE_URL",
        "https://example.invalid/v1?private=value",
    )
    monkeypatch.setattr(worker_module, "configure_logging", lambda *_args: None)

    async def failing_worker(_settings: Settings) -> None:
        raise LLMProviderConfigurationError

    monkeypatch.setattr(worker_module, "run_worker", failing_worker)

    result = runner.invoke(app, ["worker"])

    assert result.exit_code == 1
    assert result.output.strip() == "Worker failed. See logs for details."
    assert api_key not in result.output
    assert "private=value" not in result.output


def test_worker_keyboard_interrupt_exits_normally(monkeypatch) -> None:
    runner = CliRunner()
    clear_worker_env(monkeypatch)
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://worker:test@localhost/db",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "worker-session-key")
    monkeypatch.setattr(worker_module, "configure_logging", lambda *_args: None)

    async def interrupted_worker(_settings: Settings) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(worker_module, "run_worker", interrupted_worker)

    result = runner.invoke(app, ["worker"])

    assert result.exit_code == 0, result.output
