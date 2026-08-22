from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import Request, status

from riva.core.errors import APIError
from riva.integrations import LLMProviderConfigurationError, build_llm_provider
from riva.models import AgentRun, AgentRunStatus

if TYPE_CHECKING:
    from riva.workers.runtime import AgentWorker

AgentExecutor = Callable[[UUID], Awaitable[AgentRun]]


def get_agent_executor(request: Request) -> AgentExecutor | None:
    """Return the in-process executor used while API calls are synchronous."""

    database = request.app.state.database
    if not hasattr(database, "sessionmaker"):
        return None

    async def execute(run_id: UUID) -> AgentRun:
        worker = _get_worker(request)
        if worker is None:
            raise APIError(status.HTTP_503_SERVICE_UNAVAILABLE, "llm_unavailable")
        run = await worker.process_run(run_id)
        if run is None:
            raise APIError(status.HTTP_409_CONFLICT, "agent_run_not_found")
        if run.status is AgentRunStatus.FAILED:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                run.error_code or "agent_execution_error",
            )
        if run.status is not AgentRunStatus.SUCCEEDED:
            raise APIError(status.HTTP_409_CONFLICT, "agent_run_not_finished")
        return run

    return execute


def _get_worker(request: Request) -> AgentWorker | None:
    from riva.workers.bootstrap import (
        build_agent_handler_registry,
        build_agent_worker,
        resolve_worker_id,
    )

    worker = getattr(request.app.state, "synchronous_agent_worker", None)
    if worker is not None:
        return worker

    settings = request.app.state.settings
    if not (settings.llm_provider and settings.llm_model):
        return None

    try:
        provider = build_llm_provider(settings)
    except LLMProviderConfigurationError:
        raise APIError(status.HTTP_503_SERVICE_UNAVAILABLE, "llm_unavailable") from None
    if provider is None:
        return None

    database = request.app.state.database
    registry = build_agent_handler_registry(
        settings,
        database.sessionmaker,
        provider_factory=lambda _: provider,
    )
    worker = build_agent_worker(
        settings,
        database,
        registry,
        resolve_worker_id(
            f"api-{id(request.app)}",
        ),
    )
    request.app.state.synchronous_agent_worker = worker
    return worker


__all__ = ["AgentExecutor", "get_agent_executor"]
