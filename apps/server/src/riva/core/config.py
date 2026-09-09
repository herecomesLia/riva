import os
from enum import StrEnum
from pathlib import Path
from typing import Self

import typed_settings
from pydantic import (
    AnyHttpUrl,
    BaseModel,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from typed_settings import default_converter, register_strlist_hook
from typed_settings.loaders import DictLoader, DotEnvLoader, EnvLoader, Loader

from riva.core.logging import LogFormat, LogLevel


class SameSitePolicy(StrEnum):
    LAX = "lax"
    STRICT = "strict"
    NONE = "none"


class CORSSettings(BaseModel):
    allowed_origins: list[str] = []
    allow_credentials: bool = True

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if value == [""]:
            return []
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_credentials(self) -> Self:
        if self.allow_credentials and "*" in self.allowed_origins:
            raise ValueError(
                "RIVA_CORS_ALLOWED_ORIGINS cannot contain '*' when "
                "RIVA_CORS_ALLOW_CREDENTIALS is true."
            )
        return self

    def write_environ(self) -> None:
        os.environ["RIVA_CORS_ALLOWED_ORIGINS"] = ",".join(self.allowed_origins)
        os.environ["RIVA_CORS_ALLOW_CREDENTIALS"] = str(self.allow_credentials).lower()


class SessionSettings(BaseModel):
    digest_key: str
    cookie_name: str = "riva_session"
    cookie_secure: bool = True
    cookie_samesite: SameSitePolicy = SameSitePolicy.LAX
    cookie_path: str = "/"
    idle_timeout_seconds: int = Field(default=604800, gt=0)
    refresh_interval_seconds: int = Field(default=300, ge=0)

    @model_validator(mode="after")
    def validate_policy(self) -> Self:
        if not self.digest_key.strip():
            raise ValueError("RIVA_SESSION_DIGEST_KEY must not be empty.")
        if self.cookie_name.startswith("__Host-"):
            if not self.cookie_secure:
                raise ValueError("__Host- cookies require RIVA_SESSION_COOKIE_SECURE.")
            if self.cookie_path != "/":
                raise ValueError("__Host- cookies require RIVA_SESSION_COOKIE_PATH=/.")
        if self.cookie_samesite == SameSitePolicy.NONE and not self.cookie_secure:
            raise ValueError(
                "SameSite=None cookies require RIVA_SESSION_COOKIE_SECURE."
            )
        return self

    def write_environ(self) -> None:
        os.environ["RIVA_SESSION_DIGEST_KEY"] = self.digest_key
        os.environ["RIVA_SESSION_COOKIE_NAME"] = self.cookie_name
        os.environ["RIVA_SESSION_COOKIE_SECURE"] = str(self.cookie_secure).lower()
        os.environ["RIVA_SESSION_COOKIE_SAMESITE"] = self.cookie_samesite.value
        os.environ["RIVA_SESSION_COOKIE_PATH"] = self.cookie_path
        os.environ["RIVA_SESSION_IDLE_TIMEOUT_SECONDS"] = str(self.idle_timeout_seconds)
        os.environ["RIVA_SESSION_REFRESH_INTERVAL_SECONDS"] = str(
            self.refresh_interval_seconds
        )


class HealthCheckSettings(BaseModel):
    timeout_seconds: float = Field(gt=0)
    ttl_seconds: float = Field(ge=0)


class DatabaseSettings(BaseModel):
    url: str
    health: HealthCheckSettings = Field(
        default_factory=lambda: HealthCheckSettings(timeout_seconds=2, ttl_seconds=5)
    )

    def write_environ(self) -> None:
        os.environ["RIVA_DATABASE_URL"] = self.url
        os.environ["RIVA_DATABASE_HEALTH_TIMEOUT_SECONDS"] = str(
            self.health.timeout_seconds
        )
        os.environ["RIVA_DATABASE_HEALTH_TTL_SECONDS"] = str(self.health.ttl_seconds)


class LLMModelSettings(BaseModel):
    id: str | None = None
    use_responses_api: bool = False

    @field_validator("id", mode="before")
    @classmethod
    def parse_empty_id(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class LLMModelsSettings(BaseModel):
    default: LLMModelSettings = Field(default_factory=LLMModelSettings)
    reasoning: LLMModelSettings = Field(default_factory=LLMModelSettings)

    @model_validator(mode="after")
    def resolve_reasoning(self) -> Self:
        if self.reasoning.id is None:
            self.reasoning = self.default
        return self


class LLMSettings(BaseModel):
    models: LLMModelsSettings = Field(default_factory=LLMModelsSettings)
    api_key: SecretStr | None = None
    base_url: AnyHttpUrl | None = None
    health: HealthCheckSettings = Field(
        default_factory=lambda: HealthCheckSettings(timeout_seconds=5, ttl_seconds=30)
    )

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
        if self.models.default.id is None:
            raise ValueError(
                "RIVA_LLM_MODELS_DEFAULT_ID must be set when RIVA_LLM_BASE_URL is configured."
            )
        if self.api_key is None or not self.api_key.get_secret_value().strip():
            raise ValueError(
                "RIVA_LLM_API_KEY must be set when RIVA_LLM_BASE_URL is configured."
            )
        return self

    @property
    def configured(self) -> bool:
        return self.base_url is not None

    def write_environ(self) -> None:
        for slot in LLMModelsSettings.model_fields:
            model = getattr(self.models, slot)
            prefix = f"RIVA_LLM_MODELS_{slot.upper()}"
            _write_optional_environ(f"{prefix}_ID", model.id)
            os.environ[f"{prefix}_USE_RESPONSES_API"] = str(
                model.use_responses_api
            ).lower()
        _write_optional_environ(
            "RIVA_LLM_API_KEY",
            self.api_key.get_secret_value() if self.api_key else None,
        )
        _write_optional_environ(
            "RIVA_LLM_BASE_URL",
            str(self.base_url) if self.base_url else None,
        )
        os.environ["RIVA_LLM_HEALTH_TIMEOUT_SECONDS"] = str(self.health.timeout_seconds)
        os.environ["RIVA_LLM_HEALTH_TTL_SECONDS"] = str(self.health.ttl_seconds)


class TaskSettings(BaseModel):
    concurrency: int = Field(default=4, gt=0)
    shutdown_timeout_seconds: float = Field(default=30, ge=0)

    def write_environ(self) -> None:
        os.environ["RIVA_TASKS_CONCURRENCY"] = str(self.concurrency)
        os.environ["RIVA_TASKS_SHUTDOWN_TIMEOUT_SECONDS"] = str(
            self.shutdown_timeout_seconds
        )


class Settings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7482
    log_level: LogLevel = LogLevel.INFO
    log_format: LogFormat = LogFormat.CONSOLE
    database: DatabaseSettings
    cors: CORSSettings = Field(default_factory=CORSSettings)
    session: SessionSettings
    llm: LLMSettings = Field(default_factory=LLMSettings)
    tasks: TaskSettings = Field(default_factory=TaskSettings)

    def write_environ(self) -> None:
        os.environ["RIVA_HOST"] = self.host
        os.environ["RIVA_PORT"] = str(self.port)
        os.environ["RIVA_LOG_LEVEL"] = self.log_level.value
        os.environ["RIVA_LOG_FORMAT"] = self.log_format.value
        self.database.write_environ()
        self.cors.write_environ()
        self.session.write_environ()
        self.llm.write_environ()
        self.tasks.write_environ()


def load_settings(
    *,
    env_file: Path | None = None,
    overrides: dict[str, object] | None = None,
) -> Settings:
    converter = default_converter()
    register_strlist_hook(converter, sep=",")
    # Let Pydantic validate URLs after the existing empty-string validator.
    converter.register_structure_hook(AnyHttpUrl | None, lambda value, _: value)

    # typed-settings reads leaf defaults, not nested Pydantic default factories.
    loaders: list[Loader] = [
        DictLoader(
            {
                "database": {
                    "health": DatabaseSettings.model_fields["health"]
                    .get_default(call_default_factory=True)
                    .model_dump()
                },
                "llm": LLMSettings().model_dump(),
            }
        )
    ]
    if env_file is not None:
        loaders.append(DotEnvLoader(prefix="RIVA_", dotenv_path=env_file))
    loaders.append(EnvLoader(prefix="RIVA_"))
    if overrides:
        loaders.append(DictLoader(overrides))

    return typed_settings.load_settings(Settings, loaders, converter=converter)


def _write_optional_environ(name: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value
