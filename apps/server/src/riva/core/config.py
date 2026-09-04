import os
from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from riva.core.logging import LogFormat, LogLevel


class SameSitePolicy(StrEnum):
    LAX = "lax"
    STRICT = "strict"
    NONE = "none"


class LLMSettings(BaseModel):
    model: str | None = None
    api_key: SecretStr | None = None
    base_url: AnyHttpUrl | None = None
    timeout_seconds: float = Field(default=60, gt=0)
    max_retries: int = Field(default=2, ge=0)
    health_timeout_seconds: float = Field(default=5, gt=0)
    health_ttl_seconds: float = Field(default=30, ge=0)

    @field_validator("base_url", mode="before")
    @classmethod
    def parse_empty_base_url(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def validate_configured_fields(self) -> Self:
        if not self.configured:
            return self
        if self.model is None or not self.model.strip():
            raise ValueError(
                "RIVA_LLM_MODEL must be set when RIVA_LLM_BASE_URL is configured."
            )
        if self.api_key is None or not self.api_key.get_secret_value().strip():
            raise ValueError(
                "RIVA_LLM_API_KEY must be set when RIVA_LLM_BASE_URL is configured."
            )
        return self

    @property
    def configured(self) -> bool:
        return self.base_url is not None


class TaskSettings(BaseModel):
    concurrency: int = Field(default=4, gt=0)
    shutdown_timeout_seconds: float = Field(default=30, ge=0)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RIVA_",
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 7482
    log_level: LogLevel = LogLevel.INFO
    log_format: LogFormat = LogFormat.CONSOLE
    database_url: str
    llm: LLMSettings = Field(default_factory=LLMSettings)
    tasks: TaskSettings = Field(default_factory=TaskSettings)
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    cors_allow_credentials: bool = True
    session_digest_key: str
    session_cookie_name: str = "riva_session"
    session_cookie_secure: bool = True
    session_cookie_samesite: SameSitePolicy = SameSitePolicy.LAX
    session_cookie_path: str = "/"
    session_idle_timeout_seconds: int = Field(default=604800, gt=0)
    session_refresh_interval_seconds: int = Field(default=300, ge=0)

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def parse_cors_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_cors_credentials(self) -> Self:
        if self.cors_allow_credentials and "*" in self.cors_allowed_origins:
            raise ValueError(
                "RIVA_CORS_ALLOWED_ORIGINS cannot contain '*' when "
                "RIVA_CORS_ALLOW_CREDENTIALS is true."
            )
        if not self.session_digest_key.strip():
            raise ValueError("RIVA_SESSION_DIGEST_KEY must not be empty.")
        if self.session_cookie_name.startswith("__Host-"):
            if not self.session_cookie_secure:
                raise ValueError("__Host- cookies require RIVA_SESSION_COOKIE_SECURE.")
            if self.session_cookie_path != "/":
                raise ValueError("__Host- cookies require RIVA_SESSION_COOKIE_PATH=/.")
        if (
            self.session_cookie_samesite == SameSitePolicy.NONE
            and not self.session_cookie_secure
        ):
            raise ValueError(
                "SameSite=None cookies require RIVA_SESSION_COOKIE_SECURE."
            )
        return self

    def write_environ(self) -> None:
        os.environ["RIVA_HOST"] = self.host
        os.environ["RIVA_PORT"] = str(self.port)
        os.environ["RIVA_LOG_LEVEL"] = self.log_level.value
        os.environ["RIVA_LOG_FORMAT"] = self.log_format.value
        os.environ["RIVA_DATABASE_URL"] = self.database_url
        _write_optional_environ("RIVA_LLM_MODEL", self.llm.model)
        _write_optional_environ(
            "RIVA_LLM_API_KEY",
            self.llm.api_key.get_secret_value() if self.llm.api_key else None,
        )
        _write_optional_environ(
            "RIVA_LLM_BASE_URL",
            str(self.llm.base_url) if self.llm.base_url else None,
        )
        os.environ["RIVA_LLM_TIMEOUT_SECONDS"] = str(self.llm.timeout_seconds)
        os.environ["RIVA_LLM_MAX_RETRIES"] = str(self.llm.max_retries)
        os.environ["RIVA_LLM_HEALTH_TIMEOUT_SECONDS"] = str(
            self.llm.health_timeout_seconds
        )
        os.environ["RIVA_LLM_HEALTH_TTL_SECONDS"] = str(self.llm.health_ttl_seconds)
        os.environ["RIVA_TASKS_CONCURRENCY"] = str(self.tasks.concurrency)
        os.environ["RIVA_TASKS_SHUTDOWN_TIMEOUT_SECONDS"] = str(
            self.tasks.shutdown_timeout_seconds
        )
        os.environ["RIVA_CORS_ALLOWED_ORIGINS"] = ",".join(self.cors_allowed_origins)
        os.environ["RIVA_CORS_ALLOW_CREDENTIALS"] = str(
            self.cors_allow_credentials
        ).lower()
        os.environ["RIVA_SESSION_DIGEST_KEY"] = self.session_digest_key
        os.environ["RIVA_SESSION_COOKIE_NAME"] = self.session_cookie_name
        os.environ["RIVA_SESSION_COOKIE_SECURE"] = str(
            self.session_cookie_secure
        ).lower()
        os.environ["RIVA_SESSION_COOKIE_SAMESITE"] = self.session_cookie_samesite.value
        os.environ["RIVA_SESSION_COOKIE_PATH"] = self.session_cookie_path
        os.environ["RIVA_SESSION_IDLE_TIMEOUT_SECONDS"] = str(
            self.session_idle_timeout_seconds
        )
        os.environ["RIVA_SESSION_REFRESH_INTERVAL_SECONDS"] = str(
            self.session_refresh_interval_seconds
        )


def _write_optional_environ(name: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value
