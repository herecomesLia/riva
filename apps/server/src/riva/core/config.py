import os
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from riva.core.logging import LogFormat, LogLevel


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
