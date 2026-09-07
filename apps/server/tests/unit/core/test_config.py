import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from riva.core.config import (
    CORSSettings,
    LLMSettings,
    SameSitePolicy,
    SessionSettings,
    Settings,
    TaskSettings,
    load_settings,
)

DATABASE_URL = "postgresql+psycopg://test:test@invalid/test"
SESSION_DIGEST_KEY = "valid-session-digest-key"


@pytest.fixture(autouse=True)
def clear_riva_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for field_name in Settings.model_fields:
        monkeypatch.delenv(f"RIVA_{field_name.upper()}", raising=False)
    for field_name in LLMSettings.model_fields:
        monkeypatch.delenv(f"RIVA_LLM_{field_name.upper()}", raising=False)
    for field_name in TaskSettings.model_fields:
        monkeypatch.delenv(f"RIVA_TASKS_{field_name.upper()}", raising=False)
    for field_name in CORSSettings.model_fields:
        monkeypatch.delenv(f"RIVA_CORS_{field_name.upper()}", raising=False)
    for field_name in SessionSettings.model_fields:
        monkeypatch.delenv(f"RIVA_SESSION_{field_name.upper()}", raising=False)


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": DATABASE_URL,
        "session": SessionSettings(digest_key=SESSION_DIGEST_KEY),
    }
    values.update(overrides)
    return Settings(**values)


def test_settings_uses_production_defaults() -> None:
    settings = Settings(
        database_url=DATABASE_URL,
        session={"digest_key": SESSION_DIGEST_KEY},
    )

    assert settings.host == "127.0.0.1"
    assert settings.port == 7482
    assert settings.cors.allowed_origins == []
    assert settings.cors.allow_credentials is True
    assert settings.session.cookie_name == "riva_session"
    assert settings.session.cookie_secure is True
    assert settings.session.cookie_samesite == SameSitePolicy.LAX
    assert settings.session.cookie_path == "/"
    assert settings.session.idle_timeout_seconds == 604800
    assert settings.session.refresh_interval_seconds == 300


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (
            " https://a.test, ,https://b.test, ",
            ["https://a.test", "https://b.test"],
        ),
        (["https://a.test", "https://b.test"], ["https://a.test", "https://b.test"]),
    ],
)
def test_cors_settings_parses_allowed_origins(
    value: object,
    expected: list[str],
) -> None:
    settings = CORSSettings(allowed_origins=value)

    assert settings.allowed_origins == expected


def test_cors_settings_rejects_wildcard_origin_with_credentials() -> None:
    with pytest.raises(ValidationError, match=r"cannot contain '\*'"):
        CORSSettings(allowed_origins=["*"], allow_credentials=True)


def test_cors_settings_allows_wildcard_origin_without_credentials() -> None:
    settings = CORSSettings(allowed_origins=["*"], allow_credentials=False)

    assert settings.allowed_origins == ["*"]


@pytest.mark.parametrize("digest_key", ["", "   "])
def test_session_settings_rejects_blank_digest_key(digest_key: str) -> None:
    with pytest.raises(ValidationError, match="must not be empty"):
        SessionSettings(digest_key=digest_key)


def test_session_settings_accepts_non_blank_digest_key() -> None:
    assert SessionSettings(digest_key="valid-key").digest_key == "valid-key"


def test_llm_settings_treats_empty_base_url_as_not_configured() -> None:
    settings = LLMSettings(base_url="", model="", api_key="")

    assert settings.configured is False


@pytest.mark.parametrize(
    "llm",
    [
        {"base_url": "https://llm.test/v1"},
        {"base_url": "https://llm.test/v1", "model": "   "},
        {"base_url": "https://llm.test/v1", "api_key": None},
        {"base_url": "https://llm.test/v1", "api_key": "   "},
    ],
)
def test_llm_settings_requires_model_and_api_key_when_configured(
    llm: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        LLMSettings(**llm)


def test_load_settings_source_precedence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        f"RIVA_DATABASE_URL={DATABASE_URL}\n"
        f"RIVA_SESSION_DIGEST_KEY={SESSION_DIGEST_KEY}\n"
        "RIVA_HOST=dotenv-host\n"
        "RIVA_PORT=7000\n"
    )
    monkeypatch.setenv("RIVA_HOST", "env-host")
    monkeypatch.setenv("RIVA_PORT", "8000")

    settings = load_settings(env_file=env_file, overrides={"port": 9000})

    assert settings.database_url == DATABASE_URL
    assert settings.session.digest_key == SESSION_DIGEST_KEY
    assert settings.host == "env-host"
    assert settings.port == 9000


def _session(**overrides: object) -> SessionSettings:
    values: dict[str, object] = {"digest_key": SESSION_DIGEST_KEY}
    values.update(overrides)
    return SessionSettings(**values)


@pytest.mark.parametrize(
    ("overrides", "is_valid"),
    [
        (
            {
                "cookie_name": "__Host-riva",
                "cookie_secure": True,
                "cookie_path": "/",
            },
            True,
        ),
        (
            {
                "cookie_name": "__Host-riva",
                "cookie_secure": False,
            },
            False,
        ),
        (
            {
                "cookie_name": "__Host-riva",
                "cookie_path": "/api",
            },
            False,
        ),
        (
            {
                "cookie_name": "riva_session",
                "cookie_secure": False,
            },
            True,
        ),
    ],
)
def test_session_settings_enforces_host_cookie_requirements(
    overrides: dict[str, object],
    is_valid: bool,
) -> None:
    if is_valid:
        _session(**overrides)
        return

    with pytest.raises(ValidationError, match="__Host- cookies require"):
        _session(**overrides)


@pytest.mark.parametrize(
    ("secure", "is_valid"),
    [(True, True), (False, False)],
)
def test_session_settings_requires_secure_cookie_for_samesite_none(
    secure: bool,
    is_valid: bool,
) -> None:
    if is_valid:
        _session(
            cookie_samesite=SameSitePolicy.NONE,
            cookie_secure=secure,
        )
        return

    with pytest.raises(ValidationError, match="SameSite=None cookies require"):
        _session(
            cookie_samesite=SameSitePolicy.NONE,
            cookie_secure=secure,
        )


@pytest.mark.parametrize(
    ("field_name", "value", "is_valid"),
    [
        ("idle_timeout_seconds", 0, False),
        ("idle_timeout_seconds", 1, True),
        ("refresh_interval_seconds", -1, False),
        ("refresh_interval_seconds", 0, True),
    ],
)
def test_session_settings_validates_timeout_boundaries(
    field_name: str,
    value: int,
    is_valid: bool,
) -> None:
    if is_valid:
        assert getattr(_session(**{field_name: value}), field_name) == value
        return

    with pytest.raises(ValidationError):
        _session(**{field_name: value})


def test_write_environ_writes_all_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(
        host="0.0.0.0",
        port=8000,
        log_level="debug",
        log_format="json",
        database_url="postgresql+psycopg://riva:riva@db/riva",
        cors={
            "allowed_origins": ["https://a.test", "https://b.test"],
            "allow_credentials": False,
        },
        session={
            "digest_key": "digest-key",
            "cookie_name": "custom_session",
            "cookie_secure": False,
            "cookie_samesite": SameSitePolicy.STRICT,
            "cookie_path": "/api",
            "idle_timeout_seconds": 60,
            "refresh_interval_seconds": 0,
        },
        llm={
            "model": "test-model",
            "api_key": "test-key",
            "base_url": "https://llm.test/v1",
            "timeout_seconds": 12,
            "max_retries": 3,
            "health_timeout_seconds": 7,
            "health_ttl_seconds": 18,
        },
        tasks={
            "concurrency": 8,
            "shutdown_timeout_seconds": 12.5,
        },
    )
    expected = {
        "RIVA_HOST": "0.0.0.0",
        "RIVA_PORT": "8000",
        "RIVA_LOG_LEVEL": "debug",
        "RIVA_LOG_FORMAT": "json",
        "RIVA_DATABASE_URL": "postgresql+psycopg://riva:riva@db/riva",
        "RIVA_LLM_MODEL": "test-model",
        "RIVA_LLM_API_KEY": "test-key",
        "RIVA_LLM_BASE_URL": "https://llm.test/v1",
        "RIVA_LLM_TIMEOUT_SECONDS": "12.0",
        "RIVA_LLM_MAX_RETRIES": "3",
        "RIVA_LLM_HEALTH_TIMEOUT_SECONDS": "7.0",
        "RIVA_LLM_HEALTH_TTL_SECONDS": "18.0",
        "RIVA_TASKS_CONCURRENCY": "8",
        "RIVA_TASKS_SHUTDOWN_TIMEOUT_SECONDS": "12.5",
        "RIVA_CORS_ALLOWED_ORIGINS": "https://a.test,https://b.test",
        "RIVA_CORS_ALLOW_CREDENTIALS": "false",
        "RIVA_SESSION_DIGEST_KEY": "digest-key",
        "RIVA_SESSION_COOKIE_NAME": "custom_session",
        "RIVA_SESSION_COOKIE_SECURE": "false",
        "RIVA_SESSION_COOKIE_SAMESITE": "strict",
        "RIVA_SESSION_COOKIE_PATH": "/api",
        "RIVA_SESSION_IDLE_TIMEOUT_SECONDS": "60",
        "RIVA_SESSION_REFRESH_INTERVAL_SECONDS": "0",
    }
    for name in expected:
        monkeypatch.setenv(name, "restore-after-test")

    settings.write_environ()

    assert {name: os.environ[name] for name in expected} == expected
