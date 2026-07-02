from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from riva.api import router
from riva.core.config import Settings
from riva.db import Database


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database = Database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.database = database
        async with database:
            yield

    app = FastAPI(title="RIVA Server", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    app.include_router(router, prefix="/api")
    return app
