from riva.core.config import SameSitePolicy, Settings
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
        "cors_allowed_origins": [TEST_ORIGIN],
        "cors_allow_credentials": True,
        "session_digest_key": TEST_SESSION_DIGEST_KEY,
        "session_cookie_name": "riva_session",
        "session_cookie_secure": True,
        "session_cookie_samesite": SameSitePolicy.LAX,
        "session_cookie_path": "/",
        "session_idle_timeout_seconds": 604800,
        "session_refresh_interval_seconds": 300,
    }
    values.update(overrides)
    return Settings(**values)
