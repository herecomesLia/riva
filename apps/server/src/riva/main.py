from riva.core.app import create_asgi_app
from riva.core.config import Settings
from riva.core.logging import configure_logging

settings = Settings()
configure_logging(settings.log_level, settings.log_format)
app = create_asgi_app(settings)
