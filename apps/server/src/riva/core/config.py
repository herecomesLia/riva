from pydantic_settings import BaseSettings, SettingsConfigDict

from riva.core.logging import LogLevel


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RIVA_",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 7482
    log_level: LogLevel = LogLevel.info
    database_url: str
