import os

from pydantic_settings import BaseSettings, SettingsConfigDict

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

    def write_environ(self) -> None:
        os.environ["RIVA_HOST"] = self.host
        os.environ["RIVA_PORT"] = str(self.port)
        os.environ["RIVA_LOG_LEVEL"] = self.log_level.value
        os.environ["RIVA_LOG_FORMAT"] = self.log_format.value
        os.environ["RIVA_DATABASE_URL"] = self.database_url
