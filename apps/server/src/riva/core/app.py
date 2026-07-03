from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter

import structlog
from fastapi import FastAPI

from riva.api import router
from riva.core.config import Settings
from riva.core.logging import RequestLoggingMiddleware
from riva.db import Database
from riva.utils import seconds_to_ms


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    database: Database = app.state.database
    logger = structlog.get_logger("riva.app")
    lifecycle_fields = {
        "log_level": settings.log_level.value,
    }
    logger.info("app.start", status="in_progress", **lifecycle_fields)
    startup_started_at = perf_counter()
    startup_succeeded = False
    shutdown_started_at: float | None = None

    try:
        async with database:
            await database.ping()
            startup_succeeded = True

            logger.info(
                "app.start",
                status="succeeded",
                **lifecycle_fields,
                duration_ms=seconds_to_ms(perf_counter() - startup_started_at),
            )

            try:
                yield
            finally:
                shutdown_started_at = perf_counter()
                logger.info(
                    "app.stop",
                    status="in_progress",
                    **lifecycle_fields,
                )
    except Exception:
        if startup_succeeded:
            if shutdown_started_at is not None:
                logger.exception(
                    "app.stop",
                    status="failed",
                    reason="shutdown_failed",
                    **lifecycle_fields,
                    duration_ms=seconds_to_ms(perf_counter() - shutdown_started_at),
                )
            raise

        logger.exception(
            "app.start",
            status="failed",
            reason="database_unavailable",
            **lifecycle_fields,
            duration_ms=seconds_to_ms(perf_counter() - startup_started_at),
        )
        raise

    if shutdown_started_at is not None:
        logger.info(
            "app.stop",
            status="succeeded",
            **lifecycle_fields,
            duration_ms=seconds_to_ms(perf_counter() - shutdown_started_at),
        )


def register_middlewares(app: FastAPI) -> None:
    app.add_middleware(RequestLoggingMiddleware)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database = Database(settings.database_url)

    app = FastAPI(title="Riva API", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    register_middlewares(app)
    app.include_router(router, prefix="/api")
    return app
