import asyncio
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMProviderConfigurationError,
    ProviderRateLimitedError,
    ProviderUnavailableError,
    StructuredOutputDiagnostics,
)
from riva.models import AgentRun
from riva.services.agent_runs import (
    AgentRunLeaseError,
    AgentRunResultMismatchError,
    AgentRunService,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.handlers import AgentHandlerRegistry


SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]
ServiceFactory = Callable[[AsyncSession], AgentRunService]
WaitForEvent = Callable[[asyncio.Event, timedelta], Awaitable[bool]]


@dataclass(frozen=True)
class _Failure:
    code: str
    retryable: bool
    diagnostics: StructuredOutputDiagnostics | None = None


@dataclass(frozen=True)
class _ExecutionOutcome:
    result: AgentResult[BaseModel] | None = None
    error: Exception | None = None
    lease_lost_code: str | None = None


class AgentWorker:
    def __init__(
        self,
        *,
        worker_id: str,
        session_factory: SessionFactory,
        registry: AgentHandlerRegistry,
        lease_duration: timedelta,
        heartbeat_interval: timedelta,
        poll_interval: timedelta,
        requeue_interval: timedelta,
        retry_base_delay: timedelta,
        retry_max_delay: timedelta,
        requeue_batch_size: int = 100,
        service_factory: ServiceFactory = AgentRunService,
        wait_for_event: WaitForEvent | None = None,
        logger: Any | None = None,
    ) -> None:
        self.worker_id = _worker_id(worker_id)
        if lease_duration <= timedelta(0):
            raise ValueError("lease_duration must be positive")
        if heartbeat_interval <= timedelta(0):
            raise ValueError("heartbeat_interval must be positive")
        if heartbeat_interval >= lease_duration:
            raise ValueError("heartbeat_interval must be less than lease_duration")
        if poll_interval <= timedelta(0):
            raise ValueError("poll_interval must be positive")
        if requeue_interval <= timedelta(0):
            raise ValueError("requeue_interval must be positive")
        if retry_base_delay <= timedelta(0):
            raise ValueError("retry_base_delay must be positive")
        if retry_max_delay < retry_base_delay:
            raise ValueError("retry_max_delay must be at least retry_base_delay")
        if requeue_batch_size <= 0:
            raise ValueError("requeue_batch_size must be positive")

        self.session_factory = session_factory
        self.registry = registry
        self.lease_duration = lease_duration
        self.heartbeat_interval = heartbeat_interval
        self.poll_interval = poll_interval
        self.requeue_interval = requeue_interval
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.requeue_batch_size = requeue_batch_size
        self.service_factory = service_factory
        self.wait_for_event = wait_for_event or _wait_for_event
        self.logger = logger or structlog.get_logger("riva.agent_worker")

    async def process_one(self) -> bool:
        run = await self._claim_next()
        if run is None:
            return False
        if run.lease_token is None:
            raise RuntimeError("Claimed agent run is missing its lease token.")

        fields = _log_fields(self.worker_id, run)
        self.logger.info(
            "agent.worker.run",
            status="running",
            first_queue_latency_ms=_duration_ms(run.created_at, run.started_at),
            **fields,
        )

        try:
            handler = self.registry.get(run.agent_id)
        except Exception as exc:
            await self._record_failure(run, run.lease_token, _failure_for(exc))
            return True

        outcome = await self._execute_with_heartbeat(
            handler.execute(run),
            run.id,
            run.lease_token,
        )
        if outcome.lease_lost_code is not None:
            self.logger.warning(
                "agent.worker.run",
                status="abandoned",
                error_code=outcome.lease_lost_code,
                **fields,
            )
            return True
        if outcome.error is not None:
            await self._record_failure(
                run,
                run.lease_token,
                _failure_for(outcome.error),
            )
            return True

        if outcome.result is None:
            raise RuntimeError("Agent handler completed without a result.")

        try:
            canonical_run = await self._mark_succeeded(
                run.id,
                run.lease_token,
                outcome.result,
            )
        except AgentRunResultMismatchError:
            await self._record_failure(
                run,
                run.lease_token,
                _Failure("agent_run_result_mismatch", retryable=False),
            )
        except AgentRunLeaseError:
            self.logger.warning(
                "agent.worker.run",
                status="abandoned",
                error_code=AgentRunLeaseError.code,
                **fields,
            )
        else:
            self.logger.info(
                "agent.worker.run",
                status="succeeded",
                provider=canonical_run.provider,
                input_tokens=canonical_run.input_tokens,
                output_tokens=canonical_run.output_tokens,
                total_tokens=(
                    (canonical_run.input_tokens or 0)
                    + (canonical_run.output_tokens or 0)
                ),
                terminal_latency_ms=_duration_ms(
                    canonical_run.created_at,
                    canonical_run.finished_at,
                ),
                processing_span_ms=_duration_ms(
                    canonical_run.started_at,
                    canonical_run.finished_at,
                ),
                **_log_fields(self.worker_id, canonical_run),
            )
        return True

    async def run(self, stop_event: asyncio.Event) -> None:
        process_task = asyncio.create_task(
            self._process_loop(stop_event),
            name=f"agent-process:{self.worker_id}",
        )
        recovery_task = asyncio.create_task(
            self._requeue_loop(stop_event),
            name=f"agent-recovery:{self.worker_id}",
        )
        try:
            await asyncio.gather(process_task, recovery_task)
        finally:
            for task in (process_task, recovery_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(
                process_task,
                recovery_task,
                return_exceptions=True,
            )

    async def _execute_with_heartbeat(
        self,
        execution: Awaitable[AgentResult[BaseModel]],
        run_id: UUID,
        lease_token: UUID,
    ) -> _ExecutionOutcome:
        heartbeat_stop = asyncio.Event()
        handler_task = asyncio.create_task(
            execution,
            name=f"agent-handler:{run_id}",
        )
        heartbeat_task = asyncio.create_task(
            self._heartbeat(run_id, lease_token, heartbeat_stop),
            name=f"agent-heartbeat:{run_id}",
        )

        try:
            done, _ = await asyncio.wait(
                {handler_task, heartbeat_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if handler_task in done:
                heartbeat_stop.set()
                lease_lost_code = await _heartbeat_result(heartbeat_task)
                if lease_lost_code is not None:
                    return _ExecutionOutcome(lease_lost_code=lease_lost_code)
                try:
                    return _ExecutionOutcome(result=handler_task.result())
                except Exception as exc:
                    return _ExecutionOutcome(error=exc)

            lease_lost_code = await _heartbeat_result(heartbeat_task)
            handler_task.cancel()
            await asyncio.gather(handler_task, return_exceptions=True)
            return _ExecutionOutcome(
                lease_lost_code=lease_lost_code or "agent_lease_heartbeat_error"
            )
        finally:
            heartbeat_stop.set()
            for task in (handler_task, heartbeat_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(
                handler_task,
                heartbeat_task,
                return_exceptions=True,
            )

    async def _heartbeat(
        self,
        run_id: UUID,
        lease_token: UUID,
        stop_event: asyncio.Event,
    ) -> None:
        while not await self.wait_for_event(
            stop_event,
            self.heartbeat_interval,
        ):
            async with self.session_factory() as session:
                await self.service_factory(session).renew_lease(
                    run_id=run_id,
                    lease_token=lease_token,
                    lease_duration=self.lease_duration,
                )

    async def _claim_next(self) -> AgentRun | None:
        async with self.session_factory() as session:
            return await self.service_factory(session).claim_next(
                lease_owner=self.worker_id,
                lease_duration=self.lease_duration,
            )

    async def _mark_succeeded(
        self,
        run_id: UUID,
        lease_token: UUID,
        result: AgentResult[BaseModel],
    ) -> AgentRun:
        async with self.session_factory() as session:
            return await self.service_factory(session).mark_succeeded(
                run_id=run_id,
                lease_token=lease_token,
                result=result,
            )

    async def _record_failure(
        self,
        run: AgentRun,
        lease_token: UUID,
        failure: _Failure,
    ) -> None:
        delay = (
            self.retry_delay(run.attempt_count)
            if failure.retryable
            else timedelta(0)
        )
        try:
            async with self.session_factory() as session:
                failed = await self.service_factory(session).mark_failed(
                    run_id=run.id,
                    lease_token=lease_token,
                    error_code=failure.code,
                    retryable=failure.retryable,
                    retry_delay=delay,
                )
        except AgentRunLeaseError:
            self.logger.warning(
                "agent.worker.run",
                status="abandoned",
                error_code=AgentRunLeaseError.code,
                **_log_fields(self.worker_id, run),
            )
            return

        self.logger.info(
            "agent.worker.run",
            status=failed.status.value,
            error_code=failure.code,
            retryable=failure.retryable,
            retry_delay_ms=_timedelta_ms(delay),
            **(
                {"next_available_at": failed.available_at}
                if failed.status.value == "queued"
                else {}
            ),
            **(
                failure.diagnostics.as_log_fields()
                if failure.diagnostics is not None
                else {}
            ),
            **_log_fields(self.worker_id, failed),
        )

    async def _requeue_expired(self) -> int:
        async with self.session_factory() as session:
            return await self.service_factory(session).requeue_expired(
                batch_size=self.requeue_batch_size
            )

    async def _process_loop(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            processed = await self.process_one()
            if not processed:
                await self.wait_for_event(stop_event, self.poll_interval)

    async def _requeue_loop(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            recovered = await self._requeue_expired()
            self.logger.info(
                "agent.worker.requeue",
                worker_id=self.worker_id,
                status="succeeded",
                recovered_count=recovered,
            )
            if await self.wait_for_event(stop_event, self.requeue_interval):
                return

    def retry_delay(self, attempt_count: int) -> timedelta:
        if attempt_count < 1:
            raise ValueError("attempt_count must be at least 1")
        delay = self.retry_base_delay
        for _ in range(attempt_count - 1):
            if delay >= self.retry_max_delay / 2:
                return self.retry_max_delay
            delay *= 2
        return min(delay, self.retry_max_delay)


async def _heartbeat_result(task: asyncio.Task[None]) -> str | None:
    try:
        await task
    except AgentRunLeaseError:
        return AgentRunLeaseError.code
    except Exception:
        return "agent_lease_heartbeat_error"
    return None


async def _wait_for_event(
    event: asyncio.Event,
    delay: timedelta,
) -> bool:
    try:
        await asyncio.wait_for(event.wait(), timeout=delay.total_seconds())
    except TimeoutError:
        return False
    return True


def _failure_for(exc: Exception) -> _Failure:
    if isinstance(exc, AgentExecutionError):
        return _Failure(exc.code, exc.retryable)
    if isinstance(exc, ProviderUnavailableError):
        return _Failure(exc.code, retryable=True)
    if isinstance(exc, ProviderRateLimitedError):
        return _Failure(exc.code, retryable=True)
    if isinstance(exc, InvalidStructuredOutputError):
        return _Failure(
            exc.code,
            retryable=exc.retryable,
            diagnostics=exc.diagnostics,
        )
    if isinstance(exc, LLMProviderConfigurationError):
        return _Failure(exc.code, retryable=False)
    return _Failure("agent_execution_error", retryable=True)


def _worker_id(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("worker_id must not be empty")
    if len(normalized) > 255:
        raise ValueError("worker_id must not exceed 255 characters")
    return normalized


def _log_fields(worker_id: str, run: AgentRun) -> dict[str, object]:
    return {
        "worker_id": worker_id,
        "run_id": str(run.id),
        "agent_id": run.agent_id,
        "prompt_id": run.prompt_id,
        "prompt_version": run.prompt_version,
        "model": run.model,
        "attempt_count": run.attempt_count,
        "max_attempts": run.max_attempts,
    }


def _duration_ms(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    delta = end - start
    if delta <= timedelta(0):
        return 0
    microseconds = (
        delta.days * 86_400 * 1_000_000
        + delta.seconds * 1_000_000
        + delta.microseconds
    )
    return (microseconds + 500) // 1_000


def _timedelta_ms(value: timedelta) -> int:
    microseconds = (
        value.days * 86_400 * 1_000_000
        + value.seconds * 1_000_000
        + value.microseconds
    )
    return max(0, microseconds // 1_000)
