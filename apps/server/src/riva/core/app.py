from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from riva.api import router
from riva.core.config import Settings
from riva.core.errors import register_exception_handlers
from riva.core.logging import RequestLoggingMiddleware
from riva.db import Database
from riva.resumes import DefaultResumeTextExtractor
from riva.storage import LocalResumeObjectStorage
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


def register_middlewares(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CorrelationIdMiddleware,
        header_name="X-Request-ID",
        update_request_header=True,
        generator=lambda: str(uuid4()),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database = Database(settings.database_url)

    app = FastAPI(title="Riva API", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    app.state.resume_storage = LocalResumeObjectStorage(settings.resume_storage_dir)
    app.state.resume_text_extractor = DefaultResumeTextExtractor()
    register_exception_handlers(app)
    register_middlewares(app, settings)
    app.include_router(router, prefix="/api")
    return app
