from enum import StrEnum
import os
from typing import Annotated

from pydantic import Field, field_validator, model_validator
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
    def validate_cors_credentials(self) -> "Settings":
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
            raise ValueError("SameSite=None cookies require RIVA_SESSION_COOKIE_SECURE.")
        return self

    def write_environ(self) -> None:
        os.environ["RIVA_HOST"] = self.host
        os.environ["RIVA_PORT"] = str(self.port)
        os.environ["RIVA_LOG_LEVEL"] = self.log_level.value
        os.environ["RIVA_LOG_FORMAT"] = self.log_format.value
        os.environ["RIVA_DATABASE_URL"] = self.database_url
        os.environ["RIVA_CORS_ALLOWED_ORIGINS"] = ",".join(
            self.cors_allowed_origins
        )
        os.environ["RIVA_CORS_ALLOW_CREDENTIALS"] = str(
            self.cors_allow_credentials
        ).lower()
        os.environ["RIVA_SESSION_DIGEST_KEY"] = self.session_digest_key
        os.environ["RIVA_SESSION_COOKIE_NAME"] = self.session_cookie_name
        os.environ["RIVA_SESSION_COOKIE_SECURE"] = str(
            self.session_cookie_secure
        ).lower()
        os.environ["RIVA_SESSION_COOKIE_SAMESITE"] = (
            self.session_cookie_samesite.value
        )
        os.environ["RIVA_SESSION_COOKIE_PATH"] = self.session_cookie_path
        os.environ["RIVA_SESSION_IDLE_TIMEOUT_SECONDS"] = str(
            self.session_idle_timeout_seconds
        )
        os.environ["RIVA_SESSION_REFRESH_INTERVAL_SECONDS"] = str(
            self.session_refresh_interval_seconds
        )
