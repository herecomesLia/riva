import os
from enum import StrEnum
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from riva.core.logging import LogFormat, LogLevel


class SameSitePolicy(StrEnum):
    LAX = "lax"
    STRICT = "strict"
    NONE = "none"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RIVA_",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 7482
    log_level: LogLevel = LogLevel.INFO
    log_format: LogFormat = LogFormat.CONSOLE
    database_url: str
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: SecretStr | None = None
    llm_base_url: str | None = None
    llm_timeout_seconds: float = Field(default=60, gt=0)
    llm_enable_thinking: bool = False
    worker_id: str | None = None
    worker_lease_seconds: float = Field(default=300, gt=0)
    worker_heartbeat_seconds: float = Field(default=60, gt=0)
    worker_poll_seconds: float = Field(default=1, gt=0)
    worker_requeue_seconds: float = Field(default=60, gt=0)
    worker_retry_base_seconds: float = Field(default=10, gt=0)
    worker_retry_max_seconds: float = Field(default=300, gt=0)
    worker_requeue_batch_size: int = Field(default=100, gt=0)
    resume_storage_dir: Path = Path(".riva/resumes")
    resume_max_upload_bytes: int = Field(
        default=10 * 1024 * 1024,
        gt=0,
        le=50 * 1024 * 1024,
    )
    resume_max_extracted_characters: int = Field(
        default=100_000,
        gt=0,
        le=1_000_000,
    )
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
    def validate_settings(self) -> "Settings":
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
        if self.worker_heartbeat_seconds >= self.worker_lease_seconds:
            raise ValueError(
                "RIVA_WORKER_HEARTBEAT_SECONDS must be less than "
                "RIVA_WORKER_LEASE_SECONDS."
            )
        if self.worker_retry_max_seconds < self.worker_retry_base_seconds:
            raise ValueError(
                "RIVA_WORKER_RETRY_MAX_SECONDS must be greater than or equal to "
                "RIVA_WORKER_RETRY_BASE_SECONDS."
            )
        if self.worker_id and len(self.worker_id.strip()) > 255:
            raise ValueError("RIVA_WORKER_ID must not exceed 255 characters.")
        return self

    def write_environ(self) -> None:
        os.environ["RIVA_HOST"] = self.host
        os.environ["RIVA_PORT"] = str(self.port)
        os.environ["RIVA_LOG_LEVEL"] = self.log_level.value
        os.environ["RIVA_LOG_FORMAT"] = self.log_format.value
        os.environ["RIVA_DATABASE_URL"] = self.database_url
        _write_optional_environ("RIVA_LLM_PROVIDER", self.llm_provider)
        _write_optional_environ("RIVA_LLM_MODEL", self.llm_model)
        _write_optional_secret_environ("RIVA_LLM_API_KEY", self.llm_api_key)
        _write_optional_environ("RIVA_LLM_BASE_URL", self.llm_base_url)
        os.environ["RIVA_LLM_TIMEOUT_SECONDS"] = str(self.llm_timeout_seconds)
        os.environ["RIVA_LLM_ENABLE_THINKING"] = str(self.llm_enable_thinking).lower()
        _write_optional_environ("RIVA_WORKER_ID", self.worker_id)
        os.environ["RIVA_WORKER_LEASE_SECONDS"] = str(self.worker_lease_seconds)
        os.environ["RIVA_WORKER_HEARTBEAT_SECONDS"] = str(self.worker_heartbeat_seconds)
        os.environ["RIVA_WORKER_POLL_SECONDS"] = str(self.worker_poll_seconds)
        os.environ["RIVA_WORKER_REQUEUE_SECONDS"] = str(self.worker_requeue_seconds)
        os.environ["RIVA_WORKER_RETRY_BASE_SECONDS"] = str(
            self.worker_retry_base_seconds
        )
        os.environ["RIVA_WORKER_RETRY_MAX_SECONDS"] = str(self.worker_retry_max_seconds)
        os.environ["RIVA_WORKER_REQUEUE_BATCH_SIZE"] = str(
            self.worker_requeue_batch_size
        )
        os.environ["RIVA_RESUME_STORAGE_DIR"] = str(self.resume_storage_dir)
        os.environ["RIVA_RESUME_MAX_UPLOAD_BYTES"] = str(self.resume_max_upload_bytes)
        os.environ["RIVA_RESUME_MAX_EXTRACTED_CHARACTERS"] = str(
            self.resume_max_extracted_characters
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


def _write_optional_secret_environ(name: str, value: SecretStr | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value.get_secret_value()
