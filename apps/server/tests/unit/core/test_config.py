import os

import pytest
from pydantic import ValidationError

from riva.core.config import LLMSettings, SameSitePolicy, Settings

DATABASE_URL = "postgresql+asyncpg://test:test@invalid/test"
SESSION_DIGEST_KEY = "valid-session-digest-key"


@pytest.fixture(autouse=True)
def clear_riva_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for field_name in Settings.model_fields:
        monkeypatch.delenv(f"RIVA_{field_name.upper()}", raising=False)
    for field_name in LLMSettings.model_fields:
        monkeypatch.delenv(f"RIVA_LLM_{field_name.upper()}", raising=False)


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": DATABASE_URL,
        "session_digest_key": SESSION_DIGEST_KEY,
    }
    values.update(overrides)
    return Settings(**values)


def test_settings_uses_production_defaults() -> None:
    settings = Settings(
        database_url=DATABASE_URL,
        session_digest_key=SESSION_DIGEST_KEY,
    )

    assert settings.host == "127.0.0.1"
    assert settings.port == 7482
    assert settings.cors_allowed_origins == []
    assert settings.cors_allow_credentials is True
    assert settings.session_cookie_name == "riva_session"
    assert settings.session_cookie_secure is True
    assert settings.session_cookie_samesite == SameSitePolicy.LAX
    assert settings.session_cookie_path == "/"
    assert settings.session_idle_timeout_seconds == 604800
    assert settings.session_refresh_interval_seconds == 300


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
def test_settings_parses_cors_allowed_origins(
    value: object,
    expected: list[str],
) -> None:
    settings = _settings(cors_allowed_origins=value)

    assert settings.cors_allowed_origins == expected


def test_settings_rejects_wildcard_origin_with_credentials() -> None:
    with pytest.raises(ValidationError, match=r"cannot contain '\*'"):
        _settings(cors_allowed_origins=["*"], cors_allow_credentials=True)


def test_settings_allows_wildcard_origin_without_credentials() -> None:
    settings = _settings(
        cors_allowed_origins=["*"],
        cors_allow_credentials=False,
    )

    assert settings.cors_allowed_origins == ["*"]


@pytest.mark.parametrize("session_digest_key", ["", "   "])
def test_settings_rejects_blank_session_digest_key(session_digest_key: str) -> None:
    with pytest.raises(ValidationError, match="must not be empty"):
        _settings(session_digest_key=session_digest_key)


def test_settings_accepts_non_blank_session_digest_key() -> None:
    assert _settings(session_digest_key="valid-key").session_digest_key == "valid-key"


def test_settings_treats_empty_llm_base_url_as_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_LLM_BASE_URL", "")
    monkeypatch.setenv("RIVA_LLM_MODEL", "")
    monkeypatch.setenv("RIVA_LLM_API_KEY", "")

    settings = _settings()

    assert settings.llm.configured is False


@pytest.mark.parametrize(
    "llm",
    [
        {"base_url": "https://llm.test/v1"},
        {"base_url": "https://llm.test/v1", "model": "   "},
        {"base_url": "https://llm.test/v1", "api_key": None},
        {"base_url": "https://llm.test/v1", "api_key": "   "},
    ],
)
def test_settings_requires_model_and_api_key_when_llm_is_configured(
    llm: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        _settings(llm=llm)


def test_settings_loads_llm_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RIVA_LLM_BASE_URL", "https://llm.test/v1")
    monkeypatch.setenv("RIVA_LLM_MODEL", "test-model")
    monkeypatch.setenv("RIVA_LLM_API_KEY", "test-key")
    monkeypatch.setenv("RIVA_LLM_HEALTH_TTL_SECONDS", "12")

    settings = _settings()

    assert str(settings.llm.base_url) == "https://llm.test/v1"
    assert settings.llm.model == "test-model"
    assert settings.llm.api_key is not None
    assert settings.llm.api_key.get_secret_value() == "test-key"
    assert settings.llm.health_ttl_seconds == 12


@pytest.mark.parametrize(
    ("overrides", "is_valid"),
    [
        (
            {
                "session_cookie_name": "__Host-riva",
                "session_cookie_secure": True,
                "session_cookie_path": "/",
            },
            True,
        ),
        (
            {
                "session_cookie_name": "__Host-riva",
                "session_cookie_secure": False,
            },
            False,
        ),
        (
            {
                "session_cookie_name": "__Host-riva",
                "session_cookie_path": "/api",
            },
            False,
        ),
        (
            {
                "session_cookie_name": "riva_session",
                "session_cookie_secure": False,
            },
            True,
        ),
    ],
)
def test_settings_enforces_host_cookie_requirements(
    overrides: dict[str, object],
    is_valid: bool,
) -> None:
    if is_valid:
        _settings(**overrides)
        return

    with pytest.raises(ValidationError, match="__Host- cookies require"):
        _settings(**overrides)


@pytest.mark.parametrize(
    ("secure", "is_valid"),
    [(True, True), (False, False)],
)
def test_settings_requires_secure_cookie_for_samesite_none(
    secure: bool,
    is_valid: bool,
) -> None:
    if is_valid:
        _settings(
            session_cookie_samesite=SameSitePolicy.NONE,
            session_cookie_secure=secure,
        )
        return

    with pytest.raises(ValidationError, match="SameSite=None cookies require"):
        _settings(
            session_cookie_samesite=SameSitePolicy.NONE,
            session_cookie_secure=secure,
        )


@pytest.mark.parametrize(
    ("field_name", "value", "is_valid"),
    [
        ("session_idle_timeout_seconds", 0, False),
        ("session_idle_timeout_seconds", 1, True),
        ("session_refresh_interval_seconds", -1, False),
        ("session_refresh_interval_seconds", 0, True),
    ],
)
def test_settings_validates_session_timeout_boundaries(
    field_name: str,
    value: int,
    is_valid: bool,
) -> None:
    if is_valid:
        assert getattr(_settings(**{field_name: value}), field_name) == value
        return

    with pytest.raises(ValidationError):
        _settings(**{field_name: value})


def test_write_environ_writes_all_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(
        host="0.0.0.0",
        port=8000,
        log_level="debug",
        log_format="json",
        database_url="postgresql+asyncpg://riva:riva@db/riva",
        cors_allowed_origins=["https://a.test", "https://b.test"],
        cors_allow_credentials=False,
        session_digest_key="digest-key",
        session_cookie_name="custom_session",
        session_cookie_secure=False,
        session_cookie_samesite=SameSitePolicy.STRICT,
        session_cookie_path="/api",
        session_idle_timeout_seconds=60,
        session_refresh_interval_seconds=0,
        llm={
            "model": "test-model",
            "api_key": "test-key",
            "base_url": "https://llm.test/v1",
            "timeout_seconds": 12,
            "max_retries": 3,
            "health_timeout_seconds": 7,
            "health_ttl_seconds": 18,
        },
    )
    expected = {
        "RIVA_HOST": "0.0.0.0",
        "RIVA_PORT": "8000",
        "RIVA_LOG_LEVEL": "debug",
        "RIVA_LOG_FORMAT": "json",
        "RIVA_DATABASE_URL": "postgresql+asyncpg://riva:riva@db/riva",
        "RIVA_LLM_MODEL": "test-model",
        "RIVA_LLM_API_KEY": "test-key",
        "RIVA_LLM_BASE_URL": "https://llm.test/v1",
        "RIVA_LLM_TIMEOUT_SECONDS": "12.0",
        "RIVA_LLM_MAX_RETRIES": "3",
        "RIVA_LLM_HEALTH_TIMEOUT_SECONDS": "7.0",
        "RIVA_LLM_HEALTH_TTL_SECONDS": "18.0",
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
