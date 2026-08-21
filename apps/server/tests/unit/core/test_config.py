import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from riva.core.config import SameSitePolicy, Settings
from riva.core.logging import LogFormat, LogLevel

RIVA_ENV_KEYS = [
    "RIVA_HOST",
    "RIVA_PORT",
    "RIVA_LOG_LEVEL",
    "RIVA_LOG_FORMAT",
    "RIVA_DATABASE_URL",
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
    "RIVA_RESUME_STORAGE_DIR",
    "RIVA_RESUME_MAX_UPLOAD_BYTES",
    "RIVA_RESUME_MAX_EXTRACTED_CHARACTERS",
    "RIVA_CORS_ALLOWED_ORIGINS",
    "RIVA_CORS_ALLOW_CREDENTIALS",
    "RIVA_SESSION_DIGEST_KEY",
    "RIVA_SESSION_COOKIE_NAME",
    "RIVA_SESSION_COOKIE_SECURE",
    "RIVA_SESSION_COOKIE_SAMESITE",
    "RIVA_SESSION_COOKIE_PATH",
    "RIVA_SESSION_IDLE_TIMEOUT_SECONDS",
    "RIVA_SESSION_REFRESH_INTERVAL_SECONDS",
]


def clear_riva_env(monkeypatch) -> None:
    for key in RIVA_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_settings_defaults_with_explicit_database_url(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    settings = Settings(
        database_url="postgresql+asyncpg://user:pass@localhost/db",
        session_digest_key="test-session-digest-key",
    )

    assert settings.host == "127.0.0.1"
    assert settings.port == 7482
    assert settings.log_level == LogLevel.INFO
    assert settings.log_format == LogFormat.CONSOLE
    assert settings.database_url == "postgresql+asyncpg://user:pass@localhost/db"
    assert settings.llm_provider is None
    assert settings.llm_model is None
    assert settings.llm_api_key is None
    assert settings.llm_base_url is None
    assert settings.llm_timeout_seconds == 60
    assert settings.llm_enable_thinking is False
    assert settings.worker_id is None
    assert settings.worker_lease_seconds == 300
    assert settings.worker_heartbeat_seconds == 60
    assert settings.worker_poll_seconds == 1
    assert settings.worker_requeue_seconds == 60
    assert settings.worker_retry_base_seconds == 10
    assert settings.worker_retry_max_seconds == 300
    assert settings.worker_requeue_batch_size == 100
    assert settings.resume_storage_dir == Path(".riva/resumes")
    assert settings.resume_max_upload_bytes == 10 * 1024 * 1024
    assert settings.resume_max_extracted_characters == 100_000
    assert settings.cors_allowed_origins == []
    assert settings.cors_allow_credentials is True
    assert settings.session_digest_key == "test-session-digest-key"
    assert settings.session_cookie_name == "riva_session"
    assert settings.session_cookie_secure is True
    assert settings.session_cookie_samesite == SameSitePolicy.LAX
    assert settings.session_cookie_path == "/"
    assert settings.session_idle_timeout_seconds == 604800
    assert settings.session_refresh_interval_seconds == 300


def test_settings_requires_session_digest_key(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match="session_digest_key"):
        Settings(database_url="postgresql+asyncpg://user:pass@localhost/db")


def test_settings_reads_riva_environment(monkeypatch) -> None:
    clear_riva_env(monkeypatch)
    monkeypatch.setenv("RIVA_HOST", "0.0.0.0")
    monkeypatch.setenv("RIVA_PORT", "8080")
    monkeypatch.setenv("RIVA_LOG_LEVEL", "debug")
    monkeypatch.setenv("RIVA_LOG_FORMAT", "json")
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://env_user:env_pass@localhost/env_db",
    )
    monkeypatch.setenv("RIVA_LLM_PROVIDER", "future-provider")
    monkeypatch.setenv("RIVA_LLM_MODEL", "future-model")
    monkeypatch.setenv("RIVA_LLM_API_KEY", "environment-test-key")
    monkeypatch.setenv("RIVA_LLM_BASE_URL", "https://llm.example/v1")
    monkeypatch.setenv("RIVA_LLM_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("RIVA_LLM_ENABLE_THINKING", "true")
    monkeypatch.setenv("RIVA_WORKER_ID", "env-worker")
    monkeypatch.setenv("RIVA_WORKER_LEASE_SECONDS", "420")
    monkeypatch.setenv("RIVA_WORKER_HEARTBEAT_SECONDS", "70")
    monkeypatch.setenv("RIVA_WORKER_POLL_SECONDS", "2.5")
    monkeypatch.setenv("RIVA_WORKER_REQUEUE_SECONDS", "80")
    monkeypatch.setenv("RIVA_WORKER_RETRY_BASE_SECONDS", "15")
    monkeypatch.setenv("RIVA_WORKER_RETRY_MAX_SECONDS", "240")
    monkeypatch.setenv("RIVA_WORKER_REQUEUE_BATCH_SIZE", "50")
    monkeypatch.setenv("RIVA_RESUME_STORAGE_DIR", "var/lib/riva/resumes")
    monkeypatch.setenv("RIVA_RESUME_MAX_UPLOAD_BYTES", "2097152")
    monkeypatch.setenv("RIVA_RESUME_MAX_EXTRACTED_CHARACTERS", "250000")
    monkeypatch.setenv("RIVA_CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("RIVA_CORS_ALLOW_CREDENTIALS", "false")
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "env-session-digest-key")
    monkeypatch.setenv("RIVA_SESSION_COOKIE_NAME", "__Host-riva_session")
    monkeypatch.setenv("RIVA_SESSION_COOKIE_SECURE", "true")
    monkeypatch.setenv("RIVA_SESSION_COOKIE_SAMESITE", "strict")
    monkeypatch.setenv("RIVA_SESSION_COOKIE_PATH", "/")
    monkeypatch.setenv("RIVA_SESSION_IDLE_TIMEOUT_SECONDS", "3600")
    monkeypatch.setenv("RIVA_SESSION_REFRESH_INTERVAL_SECONDS", "60")

    settings = Settings()

    assert settings.host == "0.0.0.0"
    assert settings.port == 8080
    assert settings.log_level == LogLevel.DEBUG
    assert settings.log_format == LogFormat.JSON
    assert settings.database_url == (
        "postgresql+asyncpg://env_user:env_pass@localhost/env_db"
    )
    assert settings.llm_provider == "future-provider"
    assert settings.llm_model == "future-model"
    assert settings.llm_api_key is not None
    assert settings.llm_api_key.get_secret_value() == "environment-test-key"
    assert settings.llm_base_url == "https://llm.example/v1"
    assert settings.llm_timeout_seconds == 45
    assert settings.llm_enable_thinking is True
    assert settings.worker_id == "env-worker"
    assert settings.worker_lease_seconds == 420
    assert settings.worker_heartbeat_seconds == 70
    assert settings.worker_poll_seconds == 2.5
    assert settings.worker_requeue_seconds == 80
    assert settings.worker_retry_base_seconds == 15
    assert settings.worker_retry_max_seconds == 240
    assert settings.worker_requeue_batch_size == 50
    assert settings.resume_storage_dir == Path("var/lib/riva/resumes")
    assert settings.resume_max_upload_bytes == 2 * 1024 * 1024
    assert settings.resume_max_extracted_characters == 250_000
    assert settings.cors_allowed_origins == ["http://localhost:5173"]
    assert settings.cors_allow_credentials is False
    assert settings.session_digest_key == "env-session-digest-key"
    assert settings.session_cookie_name == "__Host-riva_session"
    assert settings.session_cookie_secure is True
    assert settings.session_cookie_samesite == SameSitePolicy.STRICT
    assert settings.session_cookie_path == "/"
    assert settings.session_idle_timeout_seconds == 3600
    assert settings.session_refresh_interval_seconds == 60


@pytest.mark.parametrize(
    ("env_value", "expected_origins"),
    [
        ("", []),
        ("http://localhost:5173", ["http://localhost:5173"]),
        (
            "http://localhost:5173, http://127.0.0.1:5173",
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        ),
    ],
)
def test_settings_parses_cors_allowed_origins(
    monkeypatch,
    env_value: str,
    expected_origins: list[str],
) -> None:
    clear_riva_env(monkeypatch)
    monkeypatch.setenv("RIVA_CORS_ALLOWED_ORIGINS", env_value)

    settings = Settings(
        database_url="postgresql+asyncpg://user:pass@localhost/db",
        session_digest_key="test-session-digest-key",
    )

    assert settings.cors_allowed_origins == expected_origins


def test_settings_rejects_wildcard_origin_with_credentials(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match="cannot contain '\\*'"):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            session_digest_key="test-session-digest-key",
            cors_allowed_origins=["*"],
            cors_allow_credentials=True,
        )


def test_write_environ_sets_riva_environment(monkeypatch) -> None:
    clear_riva_env(monkeypatch)
    settings = Settings(
        host="0.0.0.0",
        port=9000,
        log_level=LogLevel.WARNING,
        log_format=LogFormat.JSON,
        database_url="postgresql+asyncpg://write_user:write_pass@localhost/write_db",
        llm_provider="future-provider",
        llm_model="future-model",
        llm_api_key="write-test-key",
        llm_base_url="https://llm.example/v1",
        llm_timeout_seconds=45,
        llm_enable_thinking=True,
        worker_id="write-worker",
        worker_lease_seconds=420,
        worker_heartbeat_seconds=70,
        worker_poll_seconds=2.5,
        worker_requeue_seconds=80,
        worker_retry_base_seconds=15,
        worker_retry_max_seconds=240,
        worker_requeue_batch_size=50,
        resume_storage_dir=Path("var/lib/riva/resumes"),
        resume_max_upload_bytes=2 * 1024 * 1024,
        resume_max_extracted_characters=250_000,
        cors_allowed_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        cors_allow_credentials=True,
        session_digest_key="write-session-digest-key",
        session_cookie_name="riva_session",
        session_cookie_secure=False,
        session_cookie_samesite=SameSitePolicy.LAX,
        session_cookie_path="/",
        session_idle_timeout_seconds=7200,
        session_refresh_interval_seconds=120,
    )

    settings.write_environ()

    assert os.environ["RIVA_HOST"] == "0.0.0.0"
    assert os.environ["RIVA_PORT"] == "9000"
    assert os.environ["RIVA_LOG_LEVEL"] == "warning"
    assert os.environ["RIVA_LOG_FORMAT"] == "json"
    assert os.environ["RIVA_DATABASE_URL"] == (
        "postgresql+asyncpg://write_user:write_pass@localhost/write_db"
    )
    assert os.environ["RIVA_LLM_PROVIDER"] == "future-provider"
    assert os.environ["RIVA_LLM_MODEL"] == "future-model"
    assert os.environ["RIVA_LLM_API_KEY"] == "write-test-key"
    assert os.environ["RIVA_LLM_BASE_URL"] == "https://llm.example/v1"
    assert os.environ["RIVA_LLM_TIMEOUT_SECONDS"] == "45.0"
    assert os.environ["RIVA_LLM_ENABLE_THINKING"] == "true"
    assert os.environ["RIVA_WORKER_ID"] == "write-worker"
    assert os.environ["RIVA_WORKER_LEASE_SECONDS"] == "420.0"
    assert os.environ["RIVA_WORKER_HEARTBEAT_SECONDS"] == "70.0"
    assert os.environ["RIVA_WORKER_POLL_SECONDS"] == "2.5"
    assert os.environ["RIVA_WORKER_REQUEUE_SECONDS"] == "80.0"
    assert os.environ["RIVA_WORKER_RETRY_BASE_SECONDS"] == "15.0"
    assert os.environ["RIVA_WORKER_RETRY_MAX_SECONDS"] == "240.0"
    assert os.environ["RIVA_WORKER_REQUEUE_BATCH_SIZE"] == "50"
    assert os.environ["RIVA_RESUME_STORAGE_DIR"] == "var/lib/riva/resumes"
    assert os.environ["RIVA_RESUME_MAX_UPLOAD_BYTES"] == "2097152"
    assert os.environ["RIVA_RESUME_MAX_EXTRACTED_CHARACTERS"] == "250000"
    assert os.environ["RIVA_CORS_ALLOWED_ORIGINS"] == (
        "http://localhost:5173,http://127.0.0.1:5173"
    )
    assert os.environ["RIVA_CORS_ALLOW_CREDENTIALS"] == "true"
    assert os.environ["RIVA_SESSION_DIGEST_KEY"] == "write-session-digest-key"
    assert os.environ["RIVA_SESSION_COOKIE_NAME"] == "riva_session"
    assert os.environ["RIVA_SESSION_COOKIE_SECURE"] == "false"
    assert os.environ["RIVA_SESSION_COOKIE_SAMESITE"] == "lax"
    assert os.environ["RIVA_SESSION_COOKIE_PATH"] == "/"
    assert os.environ["RIVA_SESSION_IDLE_TIMEOUT_SECONDS"] == "7200"
    assert os.environ["RIVA_SESSION_REFRESH_INTERVAL_SECONDS"] == "120"


def test_write_environ_round_trips_empty_cors_allowed_origins(monkeypatch) -> None:
    clear_riva_env(monkeypatch)
    settings = Settings(
        database_url="postgresql+asyncpg://user:pass@localhost/db",
        session_digest_key="test-session-digest-key",
    )

    settings.write_environ()
    reloaded_settings = Settings()

    assert os.environ["RIVA_CORS_ALLOWED_ORIGINS"] == ""
    assert reloaded_settings.cors_allowed_origins == []
    assert reloaded_settings.llm_provider is None
    assert reloaded_settings.llm_model is None
    assert reloaded_settings.llm_api_key is None
    assert reloaded_settings.llm_base_url is None
    assert reloaded_settings.llm_timeout_seconds == 60
    assert reloaded_settings.llm_enable_thinking is False
    assert reloaded_settings.worker_id is None
    assert reloaded_settings.worker_lease_seconds == 300
    assert reloaded_settings.worker_heartbeat_seconds == 60
    assert reloaded_settings.worker_requeue_batch_size == 100
    assert reloaded_settings.resume_storage_dir == Path(".riva/resumes")
    assert reloaded_settings.resume_max_upload_bytes == 10 * 1024 * 1024
    assert reloaded_settings.resume_max_extracted_characters == 100_000
    assert reloaded_settings.cors_allow_credentials is True
    assert reloaded_settings.session_digest_key == "test-session-digest-key"
    assert reloaded_settings.session_cookie_name == "riva_session"
    assert reloaded_settings.session_cookie_secure is True
    assert reloaded_settings.session_cookie_samesite == SameSitePolicy.LAX
    assert reloaded_settings.session_cookie_path == "/"
    assert reloaded_settings.session_idle_timeout_seconds == 604800
    assert reloaded_settings.session_refresh_interval_seconds == 300


def test_settings_allows_empty_worker_id_for_cli_generation(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    settings = Settings(
        database_url="postgresql+asyncpg://user:pass@localhost/db",
        session_digest_key="test-session-digest-key",
        worker_id="",
    )

    assert settings.worker_id == ""


def test_settings_rejects_heartbeat_not_shorter_than_lease(
    monkeypatch,
) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match="HEARTBEAT_SECONDS"):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            session_digest_key="test-session-digest-key",
            worker_lease_seconds=60,
            worker_heartbeat_seconds=60,
        )


def test_settings_rejects_retry_max_shorter_than_base(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match="RETRY_MAX_SECONDS"):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            session_digest_key="test-session-digest-key",
            worker_retry_base_seconds=20,
            worker_retry_max_seconds=10,
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("resume_max_upload_bytes", 0),
        ("resume_max_upload_bytes", -1),
        ("resume_max_upload_bytes", 50 * 1024 * 1024 + 1),
        ("resume_max_extracted_characters", 0),
        ("resume_max_extracted_characters", -1),
        ("resume_max_extracted_characters", 1_000_001),
    ],
)
def test_settings_rejects_invalid_resume_limits(
    monkeypatch,
    field: str,
    value: int,
) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match=field):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            session_digest_key="test-session-digest-key",
            **{field: value},
        )


@pytest.mark.parametrize(
    "field",
    [
        "worker_lease_seconds",
        "worker_heartbeat_seconds",
        "worker_poll_seconds",
        "worker_requeue_seconds",
        "worker_retry_base_seconds",
        "worker_retry_max_seconds",
        "worker_requeue_batch_size",
    ],
)
def test_settings_rejects_non_positive_worker_values(
    monkeypatch,
    field: str,
) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match=field):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            session_digest_key="test-session-digest-key",
            **{field: 0},
        )
