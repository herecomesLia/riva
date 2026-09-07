from riva.core.config import (
    CORSSettings,
    HealthSettings,
    LLMSettings,
    SessionSettings,
    Settings,
    TaskSettings,
)
from riva.core.logging import LogFormat, LogLevel

# Settings requires a URL even when a unit test never opens a database connection.
PLACEHOLDER_DATABASE_URL = "postgresql+psycopg://unused:unused@invalid/unused"
TEST_ORIGIN = "https://testserver"
TEST_SESSION_DIGEST_KEY = "riva-test-session-digest-key"


def make_test_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "host": "127.0.0.1",
        "port": 7482,
        "log_level": LogLevel.INFO,
        "log_format": LogFormat.CONSOLE,
        "database_url": PLACEHOLDER_DATABASE_URL,
        "cors": CORSSettings(allowed_origins=[TEST_ORIGIN]),
        "session": SessionSettings(digest_key=TEST_SESSION_DIGEST_KEY),
        "llm": LLMSettings(),
        "health": HealthSettings(),
        "tasks": TaskSettings(),
    }
    values.update(overrides)
    return Settings(**values)
