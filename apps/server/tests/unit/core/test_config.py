import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from riva.core.config import (
    CORSSettings,
    DatabaseSettings,
    LLMSettings,
    SameSitePolicy,
    SessionSettings,
    Settings,
    TaskSettings,
    load_settings,
)

DATABASE_URL = "postgresql+psycopg://test:test@invalid/test"
SESSION_DIGEST_KEY = "valid-session-digest-key"


def test_stall_timeout_covers_shutdown_and_heartbeat_margin() -> None:
    with pytest.raises(ValidationError, match="heartbeat margin"):
        TaskSettings(shutdown_timeout_seconds=40, stall_timeout_seconds=69)
    TaskSettings(shutdown_timeout_seconds=40, stall_timeout_seconds=70)


@pytest.fixture(autouse=True)
def clear_riva_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in os.environ:
        if name.startswith("RIVA_"):
            monkeypatch.delenv(name)


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database": DatabaseSettings(url=DATABASE_URL),
        "session": SessionSettings(digest_key=SESSION_DIGEST_KEY),
    }
    values.update(overrides)
    return Settings(**values)


def test_cors_settings_parses_allowed_origins() -> None:
    settings = CORSSettings(allowed_origins=" https://a.test, ,https://b.test, ")

    assert settings.allowed_origins == ["https://a.test", "https://b.test"]


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


def test_llm_settings_treats_empty_base_url_as_not_configured() -> None:
    settings = LLMSettings(base_url="", models={"default": {"id": ""}}, api_key="")

    assert settings.configured is False


@pytest.mark.parametrize(
    "llm",
    [
        {"base_url": "https://llm.test/v1"},
        {
            "base_url": "https://llm.test/v1",
            "models": {"default": {"id": "   "}},
            "api_key": "key",
        },
        {
            "base_url": "https://llm.test/v1",
            "models": {"default": {"id": "model"}},
            "api_key": None,
        },
        {
            "base_url": "https://llm.test/v1",
            "models": {"default": {"id": "model"}},
            "api_key": "   ",
        },
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
        "RIVA_DATABASE_HEALTH_TIMEOUT_SECONDS=1.5\n"
        "RIVA_LLM_HEALTH_TTL_SECONDS=15\n"
        "RIVA_LLM_MODELS_DEFAULT_ID=dotenv-model\n"
        "RIVA_LLM_MODELS_DEFAULT_USE_RESPONSES_API=true\n"
        "RIVA_LLM_MODELS_REASONING_ID=\n"
        "RIVA_LLM_MODELS_REASONING_USE_RESPONSES_API=false\n"
    )
    monkeypatch.setenv("RIVA_HOST", "env-host")
    monkeypatch.setenv("RIVA_PORT", "8000")
    monkeypatch.setenv("RIVA_LLM_HEALTH_TTL_SECONDS", "0")
    monkeypatch.setenv("RIVA_LLM_MODELS_DEFAULT_ID", "env-model")

    settings = load_settings(env_file=env_file, overrides={"port": 9000})

    assert settings.database.url == DATABASE_URL
    assert settings.session.digest_key == SESSION_DIGEST_KEY
    assert settings.host == "env-host"
    assert settings.port == 9000
    assert settings.database.health.timeout_seconds == 1.5
    assert settings.llm.health.ttl_seconds == 0
    assert settings.llm.models.default.id == "env-model"
    assert settings.llm.models.reasoning == settings.llm.models.default
    assert settings.llm.models.reasoning.use_responses_api is True

    settings = load_settings(
        env_file=env_file,
        overrides={"llm": {"models": {"default": {"id": "override-model"}}}},
    )
    assert settings.llm.models.reasoning.id == "override-model"


@pytest.mark.parametrize("reasoning_id", [None, "", "   "])
def test_llm_reasoning_inherits_complete_default_model(
    reasoning_id: str | None,
) -> None:
    settings = LLMSettings(
        models={
            "default": {"id": "model", "use_responses_api": True},
            "reasoning": {"id": reasoning_id, "use_responses_api": False},
        }
    )
    assert settings.models.reasoning == settings.models.default


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


def test_write_environ_writes_all_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(
        host="0.0.0.0",
        port=8000,
        log_level="debug",
        log_format="json",
        database={
            "url": "postgresql+psycopg://riva:riva@db/riva",
            "health": {"timeout_seconds": 1.5, "ttl_seconds": 0},
        },
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
            "models": {"default": {"id": "test-model", "use_responses_api": True}},
            "api_key": "test-key",
            "base_url": "https://llm.test/v1",
            "health": {"timeout_seconds": 7, "ttl_seconds": 18},
        },
        tasks={
            "concurrency": 8,
            "shutdown_timeout_seconds": 12.5,
            "queue_timeout_seconds": 180,
            "stall_timeout_seconds": 65,
            "recovery_timeout_seconds": 75,
            "max_recovery_attempts": 0,
        },
    )
    expected = {
        "RIVA_HOST": "0.0.0.0",
        "RIVA_PORT": "8000",
        "RIVA_LOG_LEVEL": "debug",
        "RIVA_LOG_FORMAT": "json",
        "RIVA_DATABASE_URL": "postgresql+psycopg://riva:riva@db/riva",
        "RIVA_LLM_MODELS_DEFAULT_ID": "test-model",
        "RIVA_LLM_MODELS_DEFAULT_USE_RESPONSES_API": "true",
        "RIVA_LLM_MODELS_REASONING_ID": "test-model",
        "RIVA_LLM_MODELS_REASONING_USE_RESPONSES_API": "true",
        "RIVA_LLM_API_KEY": "test-key",
        "RIVA_LLM_BASE_URL": "https://llm.test/v1",
        "RIVA_DATABASE_HEALTH_TIMEOUT_SECONDS": "1.5",
        "RIVA_DATABASE_HEALTH_TTL_SECONDS": "0.0",
        "RIVA_LLM_HEALTH_TIMEOUT_SECONDS": "7.0",
        "RIVA_LLM_HEALTH_TTL_SECONDS": "18.0",
        "RIVA_TASKS_CONCURRENCY": "8",
        "RIVA_TASKS_SHUTDOWN_TIMEOUT_SECONDS": "12.5",
        "RIVA_TASKS_QUEUE_TIMEOUT_SECONDS": "180.0",
        "RIVA_TASKS_STALL_TIMEOUT_SECONDS": "65.0",
        "RIVA_TASKS_RECOVERY_TIMEOUT_SECONDS": "75.0",
        "RIVA_TASKS_MAX_RECOVERY_ATTEMPTS": "0",
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

    assert load_settings() == settings
