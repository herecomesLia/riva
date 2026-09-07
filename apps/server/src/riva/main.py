from riva.core.app import create_asgi_app
from riva.core.config import load_settings
from riva.core.logging import configure_logging

settings = load_settings()
configure_logging(settings.log_level, settings.log_format)
app = create_asgi_app(settings)
