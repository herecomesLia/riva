from fastapi import FastAPI

from riva.api import router
from riva.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="RIVA Server")
    app.state.settings = settings
    app.include_router(router, prefix="/api")
    return app
