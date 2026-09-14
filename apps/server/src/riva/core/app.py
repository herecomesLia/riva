from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from riva.api.errors.handlers import register_exception_handlers
from riva.api.routes import router
from riva.core.config import Settings, load_settings
from riva.core.logging import RequestLoggingMiddleware
from riva.db import Database
from riva.llm import LLMClient
from riva.schemas.health import HealthStatus
from riva.tasks.core.runtime import TaskSupervisor
from riva.utils import seconds_to_ms


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    settings: Settings | None = app.state.settings
    if settings is None:
        settings = load_settings()
        app.state.settings = settings

    database: Database | None = app.state.database
    if database is None:
        database = Database(settings.database)
        app.state.database = database

    llm: LLMClient | None = app.state.llm
    if llm is None:
        llm = LLMClient(settings.llm)
        app.state.llm = llm

    logger = structlog.get_logger("riva.app")
    lifecycle_fields = {
        "log_level": settings.log_level.value,
    }
    logger.info("app.start", status="in_progress", **lifecycle_fields)
    startup_started_at = perf_counter()
    startup_succeeded = False
    shutdown_started_at: float | None = None

    try:
        async with database, llm:
            await database.ping()
            startup_succeeded = True

            if not settings.llm.configured:
                logger.warning("llm.not_configured")
            else:
                llm_status = await llm.check_health()
                models = {
                    "default": settings.llm.models.default.id,
                    "reasoning": settings.llm.models.reasoning.id,
                }
                if llm_status == HealthStatus.ok:
                    logger.info("llm.available", models=models)
                else:
                    logger.warning(f"llm.{llm_status.value}", models=models)

            logger.info(
                "app.start",
                status="succeeded",
                **lifecycle_fields,
                duration_ms=seconds_to_ms(perf_counter() - startup_started_at),
            )

            try:
                async with TaskSupervisor(database, settings.tasks).run():
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
    app.add_middleware(
        CorrelationIdMiddleware,
        header_name="X-Request-ID",
        update_request_header=True,
        generator=lambda: str(uuid4()),
    )


def wrap_cors(app: ASGIApp, settings: Settings) -> ASGIApp:
    return CORSMiddleware(
        app,
        allow_origins=settings.cors.allowed_origins,
        allow_credentials=settings.cors.allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def create_asgi_app(settings: Settings | None = None) -> ASGIApp:
    settings = settings or load_settings()
    return wrap_cors(create_app(settings), settings)


def create_app(settings: Settings | None = None) -> FastAPI:
    database = Database(settings.database) if settings is not None else None

    app = FastAPI(title="Riva API", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    app.state.llm = None
    register_exception_handlers(app)
    register_middlewares(app)
    app.include_router(router, prefix="/api")
    return app
