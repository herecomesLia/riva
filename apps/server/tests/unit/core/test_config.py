import os

import pytest
from pydantic import ValidationError

from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel


RIVA_ENV_KEYS = [
    "RIVA_HOST",
    "RIVA_PORT",
    "RIVA_LOG_LEVEL",
    "RIVA_LOG_FORMAT",
    "RIVA_DATABASE_URL",
    "RIVA_CORS_ALLOWED_ORIGINS",
    "RIVA_CORS_ALLOW_CREDENTIALS",
]


def clear_riva_env(monkeypatch) -> None:
    for key in RIVA_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_settings_defaults_with_explicit_database_url(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    settings = Settings(database_url="postgresql+asyncpg://user:pass@localhost/db")

    assert settings.host == "127.0.0.1"
    assert settings.port == 7482
    assert settings.log_level == LogLevel.INFO
    assert settings.log_format == LogFormat.CONSOLE
    assert settings.database_url == "postgresql+asyncpg://user:pass@localhost/db"
    assert settings.cors_allowed_origins == []
    assert settings.cors_allow_credentials is True


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
    monkeypatch.setenv("RIVA_CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("RIVA_CORS_ALLOW_CREDENTIALS", "false")

    settings = Settings()

    assert settings.host == "0.0.0.0"
    assert settings.port == 8080
    assert settings.log_level == LogLevel.DEBUG
    assert settings.log_format == LogFormat.JSON
    assert settings.database_url == (
        "postgresql+asyncpg://env_user:env_pass@localhost/env_db"
    )
    assert settings.cors_allowed_origins == ["http://localhost:5173"]
    assert settings.cors_allow_credentials is False


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

    settings = Settings(database_url="postgresql+asyncpg://user:pass@localhost/db")

    assert settings.cors_allowed_origins == expected_origins


def test_settings_rejects_wildcard_origin_with_credentials(monkeypatch) -> None:
    clear_riva_env(monkeypatch)

    with pytest.raises(ValidationError, match="cannot contain '\\*'"):
        Settings(
            database_url="postgresql+asyncpg://user:pass@localhost/db",
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
        cors_allowed_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        cors_allow_credentials=True,
    )

    settings.write_environ()

    assert os.environ["RIVA_HOST"] == "0.0.0.0"
    assert os.environ["RIVA_PORT"] == "9000"
    assert os.environ["RIVA_LOG_LEVEL"] == "warning"
    assert os.environ["RIVA_LOG_FORMAT"] == "json"
    assert os.environ["RIVA_DATABASE_URL"] == (
        "postgresql+asyncpg://write_user:write_pass@localhost/write_db"
    )
    assert os.environ["RIVA_CORS_ALLOWED_ORIGINS"] == (
        "http://localhost:5173,http://127.0.0.1:5173"
    )
    assert os.environ["RIVA_CORS_ALLOW_CREDENTIALS"] == "true"


def test_write_environ_round_trips_empty_cors_allowed_origins(monkeypatch) -> None:
    clear_riva_env(monkeypatch)
    settings = Settings(database_url="postgresql+asyncpg://user:pass@localhost/db")

    settings.write_environ()
    reloaded_settings = Settings()

    assert os.environ["RIVA_CORS_ALLOWED_ORIGINS"] == ""
    assert reloaded_settings.cors_allowed_origins == []
    assert reloaded_settings.cors_allow_credentials is True
