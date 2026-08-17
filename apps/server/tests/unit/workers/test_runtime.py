import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel

from riva.agents import AgentResult
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMProviderConfigurationError,
    LLMUsage,
    ProviderRateLimitedError,
    ProviderUnavailableError,
    StructuredOutputDiagnostics,
    StructuredOutputValidationError,
)
from riva.models import AgentRun, AgentRunStatus
from riva.services.agent_runs import (
    AgentRunLeaseError,
    AgentRunResultMismatchError,
)
from riva.workers import AgentExecutionError, AgentHandlerRegistry, AgentWorker


NOW = datetime(2026, 7, 31, 8, tzinfo=UTC)


class Output(BaseModel):
    value: str


class FakeSessionContext:
    def __init__(self, factory: "FakeSessionFactory") -> None:
        self.factory = factory

    async def __aenter__(self) -> object:
        self.factory.active += 1
        self.factory.enter_count += 1
        return object()

    async def __aexit__(self, *args: object) -> None:
        self.factory.active -= 1
        self.factory.exit_count += 1


class FakeSessionFactory:
    def __init__(self) -> None:
        self.active = 0
        self.enter_count = 0
        self.exit_count = 0

    def __call__(self) -> FakeSessionContext:
        return FakeSessionContext(self)


class FakeAgentRunService:
    def __init__(self, claims: list[AgentRun | None] | None = None) -> None:
        self.claims = list(claims or [])
        self.claim_count = 0
        self.runs: dict[UUID, AgentRun] = {}
        self.renew_calls: list[tuple[UUID, UUID, timedelta]] = []
        self.renew_results: list[Exception | None] = []
        self.renewed = asyncio.Event()
        self.succeeded: list[tuple[UUID, UUID, AgentResult[BaseModel]]] = []
        self.succeed_error: Exception | None = None
        self.failures: list[dict[str, object]] = []
        self.requeue_count = 0
        self.requeue_results: list[int] = []
        self.requeue_batch_sizes: list[int] = []

    async def claim_next(
        self,
        *,
        lease_owner: str,
        lease_duration: timedelta,
    ) -> AgentRun | None:
        self.claim_count += 1
        run = self.claims.pop(0) if self.claims else None
        if run is not None:
            self.runs[run.id] = run
            run.lease_owner = lease_owner
        return run

    async def renew_lease(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        lease_duration: timedelta,
    ) -> AgentRun:
        self.renew_calls.append((run_id, lease_token, lease_duration))
        self.renewed.set()
        if self.renew_results:
            result = self.renew_results.pop(0)
            if result is not None:
                raise result
        return self.runs[run_id]

    async def mark_succeeded(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        result: AgentResult[BaseModel],
    ) -> AgentRun:
        self.succeeded.append((run_id, lease_token, result))
        if self.succeed_error is not None:
            raise self.succeed_error
        run = self.runs[run_id]
        run.status = AgentRunStatus.SUCCEEDED
        run.result = result.output.model_dump(mode="json")
        run.provider = result.provider
        run.model = result.model
        run.input_tokens = result.usage.input_tokens
        run.output_tokens = result.usage.output_tokens
        run.finished_at = NOW
        return run

    async def mark_failed(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        error_code: str,
        retryable: bool,
        retry_delay: timedelta,
    ) -> AgentRun:
        self.failures.append(
            {
                "run_id": run_id,
                "lease_token": lease_token,
                "error_code": error_code,
                "retryable": retryable,
                "retry_delay": retry_delay,
            }
        )
        run = self.runs[run_id]
        run.error_code = error_code
        run.status = (
            AgentRunStatus.QUEUED
            if retryable and run.attempt_count < run.max_attempts
            else AgentRunStatus.FAILED
        )
        if run.status == AgentRunStatus.QUEUED:
            run.available_at = NOW + retry_delay
            run.finished_at = None
        else:
            run.finished_at = NOW
        return run

    async def requeue_expired(self, *, batch_size: int) -> int:
        self.requeue_count += 1
        self.requeue_batch_sizes.append(batch_size)
        return self.requeue_results.pop(0) if self.requeue_results else 0


class FakeLogger:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, dict[str, object]]] = []

    def info(self, event: str, **fields: object) -> None:
        self.events.append(("info", event, fields))

    def warning(self, event: str, **fields: object) -> None:
        self.events.append(("warning", event, fields))


class FakeHandler:
    def __init__(
        self,
        response: AgentResult[Output] | Exception,
        session_factory: FakeSessionFactory,
        *,
        agent_id: str = "example-agent",
    ) -> None:
        self.agent_id = agent_id
        self.response = response
        self.session_factory = session_factory
        self.calls: list[AgentRun] = []

    async def execute(self, run: AgentRun) -> AgentResult[Output]:
        assert self.session_factory.active == 0
        self.calls.append(run)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class LongHandler:
    agent_id = "example-agent"

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def execute(self, run: AgentRun) -> AgentResult[Output]:
        self.started.set()
        try:
            await self.release.wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        return result(run, "long-complete")


def agent_run(*, max_attempts: int = 3) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="example-agent",
        prompt_id="example-prompt",
        prompt_version="1",
        output_schema_id="example-output-v1",
        status=AgentRunStatus.RUNNING,
        payload={"roleId": str(uuid4()), "profileVersion": 1},
        idempotency_key=str(uuid4()),
        attempt_count=1,
        max_attempts=max_attempts,
        available_at=NOW,
        lease_owner="test-worker",
        lease_token=uuid4(),
        lease_expires_at=NOW + timedelta(minutes=5),
        started_at=NOW,
        model="queued-model",
        created_at=NOW,
        updated_at=NOW,
    )


def result(run: AgentRun, value: str = "accepted") -> AgentResult[Output]:
    return AgentResult(
        output=Output(value=value),
        agent_id=run.agent_id,
        prompt_id=run.prompt_id,
        prompt_version=run.prompt_version,
        provider="fake-provider",
        model="fake-model",
        usage=LLMUsage(input_tokens=7, output_tokens=3),
    )


def worker(
    service: FakeAgentRunService,
    session_factory: FakeSessionFactory,
    registry: AgentHandlerRegistry | None = None,
    *,
    logger: FakeLogger | None = None,
    heartbeat_interval: timedelta = timedelta(hours=1),
    wait_for_event: Any | None = None,
) -> AgentWorker:
    kwargs: dict[str, object] = {}
    if wait_for_event is not None:
        kwargs["wait_for_event"] = wait_for_event
    return AgentWorker(
        worker_id="test-worker",
        session_factory=session_factory,  # type: ignore[arg-type]
        registry=registry or AgentHandlerRegistry(),
        lease_duration=timedelta(hours=2),
        heartbeat_interval=heartbeat_interval,
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(seconds=5),
        retry_base_delay=timedelta(seconds=10),
        retry_max_delay=timedelta(seconds=40),
        requeue_batch_size=7,
        service_factory=lambda _session: service,  # type: ignore[arg-type]
        logger=logger,
        **kwargs,  # type: ignore[arg-type]
    )


def test_process_one_returns_false_without_task() -> None:
    service = FakeAgentRunService()
    sessions = FakeSessionFactory()

    processed = asyncio.run(worker(service, sessions).process_one())

    assert processed is False
    assert sessions.enter_count == 1
    assert sessions.active == 0


def test_process_one_saves_success_metadata_outside_handler_transaction() -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()
    handler = FakeHandler(result(run), sessions)
    registry = AgentHandlerRegistry()
    registry.register(handler)

    processed = asyncio.run(worker(service, sessions, registry).process_one())

    assert processed is True
    assert handler.calls == [run]
    assert run.status == AgentRunStatus.SUCCEEDED
    assert run.result == {"value": "accepted"}
    assert run.provider == "fake-provider"
    assert run.model == "fake-model"
    assert run.input_tokens == 7
    assert run.output_tokens == 3
    assert sessions.enter_count == 2
    assert sessions.active == 0


def test_success_log_uses_canonical_run_metadata_and_safe_timing_fields() -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()
    logger = FakeLogger()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(result(run), sessions))

    assert asyncio.run(
        worker(service, sessions, registry, logger=logger).process_one()
    ) is True

    running_event = next(
        fields
        for _level, event, fields in logger.events
        if event == "agent.worker.run" and fields["status"] == "running"
    )
    assert running_event["first_queue_latency_ms"] == 0
    assert running_event["prompt_id"] == "example-prompt"
    assert running_event["prompt_version"] == "1"
    assert running_event["model"] == "queued-model"
    assert running_event["attempt_count"] == 1
    assert running_event["max_attempts"] == 3

    success_event = next(
        fields
        for _level, event, fields in logger.events
        if event == "agent.worker.run" and fields["status"] == "succeeded"
    )
    assert success_event["prompt_id"] == "example-prompt"
    assert success_event["prompt_version"] == "1"
    assert success_event["model"] == "fake-model"
    assert success_event["provider"] == "fake-provider"
    assert success_event["input_tokens"] == 7
    assert success_event["output_tokens"] == 3
    assert success_event["total_tokens"] == 10
    assert success_event["terminal_latency_ms"] == 0
    assert success_event["processing_span_ms"] == 0
    assert success_event["attempt_count"] == 1
    assert success_event["max_attempts"] == 3
    assert not {
        "payload",
        "result",
        "user_id",
        "idempotency_key",
    } & success_event.keys()


def test_retry_failure_log_contains_retry_metadata_and_next_available_at() -> None:
    run = agent_run(max_attempts=3)
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()
    logger = FakeLogger()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(ProviderUnavailableError(), sessions))

    assert asyncio.run(
        worker(service, sessions, registry, logger=logger).process_one()
    ) is True

    failure_event = next(
        fields
        for _level, event, fields in logger.events
        if event == "agent.worker.run" and fields["status"] == "queued"
    )
    assert failure_event["retryable"] is True
    assert failure_event["error_code"] == "provider_unavailable"
    assert failure_event["retry_delay_ms"] == 10_000
    assert failure_event["next_available_at"] == NOW + timedelta(seconds=10)
    assert failure_event["attempt_count"] == 1
    assert failure_event["max_attempts"] == 3
    assert not {
        "payload",
        "result",
        "user_id",
        "idempotency_key",
    } & failure_event.keys()


def test_terminal_failure_log_is_safe_and_marks_retryable_exhaustion() -> None:
    run = agent_run(max_attempts=1)
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()
    logger = FakeLogger()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(RuntimeError("PRIVATE_EXCEPTION_MESSAGE"), sessions))

    assert asyncio.run(
        worker(service, sessions, registry, logger=logger).process_one()
    ) is True

    failure_event = next(
        fields
        for _level, event, fields in logger.events
        if event == "agent.worker.run" and fields["status"] == "failed"
    )
    assert failure_event["retryable"] is True
    assert failure_event["error_code"] == "agent_execution_error"
    assert failure_event["retry_delay_ms"] == 10_000
    assert "next_available_at" not in failure_event
    assert "PRIVATE_EXCEPTION_MESSAGE" not in repr(logger.events)
    assert not {
        "payload",
        "result",
        "user_id",
        "idempotency_key",
    } & failure_event.keys()


def test_missing_handler_marks_run_as_permanent_failure() -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()

    assert asyncio.run(worker(service, sessions).process_one()) is True

    assert service.failures[0]["error_code"] == "agent_handler_not_found"
    assert service.failures[0]["retryable"] is False
    assert run.status == AgentRunStatus.FAILED


@pytest.mark.parametrize(
    ("error", "code", "retryable"),
    [
        (
            AgentExecutionError("invalid_agent_payload", retryable=False),
            "invalid_agent_payload",
            False,
        ),
        (
            AgentExecutionError("temporary_business_error", retryable=True),
            "temporary_business_error",
            True,
        ),
        (ProviderUnavailableError(), "provider_unavailable", True),
        (ProviderRateLimitedError(), "provider_rate_limited", True),
        (InvalidStructuredOutputError(), "invalid_structured_output", True),
        (
            LLMProviderConfigurationError(),
            "provider_configuration_error",
            False,
        ),
        (RuntimeError("private resume contents"), "agent_execution_error", True),
    ],
)
def test_process_one_maps_safe_failure(
    error: Exception,
    code: str,
    retryable: bool,
) -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    sessions = FakeSessionFactory()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(error, sessions))
    logger = FakeLogger()

    processed = asyncio.run(
        worker(service, sessions, registry, logger=logger).process_one()
    )

    assert processed is True
    assert service.failures[0]["error_code"] == code
    assert service.failures[0]["retryable"] is retryable
    assert service.failures[0]["retry_delay"] == (
        timedelta(seconds=10) if retryable else timedelta(0)
    )
    assert "private resume contents" not in repr(logger.events)


def test_invalid_structured_output_retries_and_logs_safe_diagnostics() -> None:
    runs = [agent_run(max_attempts=3) for _ in range(3)]
    for attempt, run in enumerate(runs, start=1):
        run.attempt_count = attempt
    service = FakeAgentRunService(runs)
    sessions = FakeSessionFactory()
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema="ResumeParsingOutput",
        validation_errors=(
            StructuredOutputValidationError(
                location="work_experiences.0.is_current",
                type="bool_parsing",
            ),
        ),
    )
    registry = AgentHandlerRegistry()
    registry.register(
        FakeHandler(
            InvalidStructuredOutputError(diagnostics),
            sessions,
        )
    )
    logger = FakeLogger()
    runtime = worker(service, sessions, registry, logger=logger)

    for _ in runs:
        assert asyncio.run(runtime.process_one()) is True

    assert [run.status for run in runs] == [
        AgentRunStatus.QUEUED,
        AgentRunStatus.QUEUED,
        AgentRunStatus.FAILED,
    ]
    assert [failure["error_code"] for failure in service.failures] == [
        "invalid_structured_output",
        "invalid_structured_output",
        "invalid_structured_output",
    ]
    final_failure_event = [
        event
        for event in logger.events
        if event[2].get("error_code") == "invalid_structured_output"
    ][-1][2]
    assert final_failure_event["run_id"] == str(runs[-1].id)
    assert final_failure_event["agent_id"] == runs[-1].agent_id
    assert final_failure_event["attempt_count"] == 3
    assert final_failure_event["error_code"] == "invalid_structured_output"
    assert final_failure_event["structured_output_stage"] == (
        "schema_validation"
    )
    assert final_failure_event["output_schema"] == "ResumeParsingOutput"
    assert final_failure_event["validation_error_count"] == 1
    assert final_failure_event["validation_errors"] == [
        {
            "location": "work_experiences.0.is_current",
            "type": "bool_parsing",
        }
    ]
    assert "PRIVATE_RESUME_CONTENT" not in repr(logger.events)


def test_result_mismatch_becomes_permanent_failure() -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    service.succeed_error = AgentRunResultMismatchError()
    sessions = FakeSessionFactory()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(result(run), sessions))

    assert asyncio.run(worker(service, sessions, registry).process_one()) is True

    assert service.failures[0]["error_code"] == "agent_run_result_mismatch"
    assert service.failures[0]["retryable"] is False


def test_lost_lease_during_final_commit_discards_result() -> None:
    run = agent_run()
    service = FakeAgentRunService([run])
    service.succeed_error = AgentRunLeaseError()
    sessions = FakeSessionFactory()
    registry = AgentHandlerRegistry()
    registry.register(FakeHandler(result(run), sessions))

    assert asyncio.run(worker(service, sessions, registry).process_one()) is True

    assert service.failures == []
    assert run.status == AgentRunStatus.RUNNING


def test_retry_delay_is_deterministic_exponential_and_capped() -> None:
    runtime = worker(FakeAgentRunService(), FakeSessionFactory())

    assert runtime.retry_delay(1) == timedelta(seconds=10)
    assert runtime.retry_delay(2) == timedelta(seconds=20)
    assert runtime.retry_delay(3) == timedelta(seconds=40)
    assert runtime.retry_delay(100) == timedelta(seconds=40)


def test_heartbeat_interval_must_be_shorter_than_lease() -> None:
    with pytest.raises(ValueError, match="less than lease_duration"):
        worker(
            FakeAgentRunService(),
            FakeSessionFactory(),
            heartbeat_interval=timedelta(hours=2),
        )


def test_heartbeat_renews_long_task_and_stops_after_completion() -> None:
    async def run_test() -> None:
        run = agent_run()
        service = FakeAgentRunService([run])
        sessions = FakeSessionFactory()
        handler = LongHandler()
        registry = AgentHandlerRegistry()
        registry.register(handler)
        runtime = worker(
            service,
            sessions,
            registry,
            heartbeat_interval=timedelta(milliseconds=5),
        )

        process_task = asyncio.create_task(runtime.process_one())
        await asyncio.wait_for(service.renewed.wait(), timeout=1)
        handler.release.set()
        assert await asyncio.wait_for(process_task, timeout=1) is True
        renew_count = len(service.renew_calls)
        await asyncio.sleep(0.02)

        assert renew_count >= 1
        assert len(service.renew_calls) == renew_count
        assert not _worker_tasks()

    asyncio.run(run_test())


def test_heartbeat_failure_cancels_handler_without_submitting_result() -> None:
    async def run_test() -> None:
        run = agent_run()
        service = FakeAgentRunService([run])
        service.renew_results = [AgentRunLeaseError()]
        sessions = FakeSessionFactory()
        handler = LongHandler()
        logger = FakeLogger()
        registry = AgentHandlerRegistry()
        registry.register(handler)
        runtime = worker(
            service,
            sessions,
            registry,
            heartbeat_interval=timedelta(milliseconds=5),
            logger=logger,
        )

        assert await asyncio.wait_for(runtime.process_one(), timeout=1) is True

        assert handler.cancelled.is_set()
        assert service.succeeded == []
        assert service.failures == []
        abandoned_event = next(
            fields
            for _level, event, fields in logger.events
            if event == "agent.worker.run" and fields["status"] == "abandoned"
        )
        assert abandoned_event["prompt_id"] == "example-prompt"
        assert abandoned_event["prompt_version"] == "1"
        assert abandoned_event["model"] == "queued-model"
        assert not {
            "payload",
            "result",
            "user_id",
            "idempotency_key",
        } & abandoned_event.keys()
        assert not _worker_tasks()

    asyncio.run(run_test())


def test_run_waits_when_idle_and_periodically_recovers_expired_runs() -> None:
    async def run_test() -> None:
        service = FakeAgentRunService([None])
        sessions = FakeSessionFactory()
        stop_event = asyncio.Event()
        poll_waits: list[timedelta] = []
        recovery_waits = 0

        async def wait(event: asyncio.Event, delay: timedelta) -> bool:
            nonlocal recovery_waits
            if delay == timedelta(seconds=5):
                recovery_waits += 1
                if recovery_waits == 1:
                    await asyncio.sleep(0)
                    return False
                event.set()
                return True
            poll_waits.append(delay)
            await event.wait()
            return True

        await worker(
            service,
            sessions,
            wait_for_event=wait,
        ).run(stop_event)

        assert service.claim_count == 1
        assert service.requeue_count == 2
        assert service.requeue_batch_sizes == [7, 7]
        assert poll_waits == [timedelta(seconds=1)]

    asyncio.run(run_test())


def test_run_finishes_current_task_after_stop_without_new_claim() -> None:
    async def run_test() -> None:
        run = agent_run()
        service = FakeAgentRunService([run])
        sessions = FakeSessionFactory()
        handler = LongHandler()
        registry = AgentHandlerRegistry()
        registry.register(handler)
        stop_event = asyncio.Event()
        runtime = worker(service, sessions, registry)

        worker_task = asyncio.create_task(runtime.run(stop_event))
        await asyncio.wait_for(handler.started.wait(), timeout=1)
        stop_event.set()
        handler.release.set()
        await asyncio.wait_for(worker_task, timeout=1)

        assert service.claim_count == 1
        assert run.status == AgentRunStatus.SUCCEEDED
        assert not _worker_tasks()

    asyncio.run(run_test())


def test_run_recovers_expired_tasks_while_handler_is_running() -> None:
    async def run_test() -> None:
        run = agent_run()
        service = FakeAgentRunService([run])
        sessions = FakeSessionFactory()
        handler = LongHandler()
        registry = AgentHandlerRegistry()
        registry.register(handler)
        stop_event = asyncio.Event()
        recovered_while_running = asyncio.Event()
        recovery_waits = 0

        async def wait(event: asyncio.Event, delay: timedelta) -> bool:
            nonlocal recovery_waits
            if delay == timedelta(seconds=5):
                recovery_waits += 1
                if recovery_waits == 1:
                    await handler.started.wait()
                    return False
                recovered_while_running.set()
                await event.wait()
                return True
            await event.wait()
            return True

        runtime = worker(
            service,
            sessions,
            registry,
            wait_for_event=wait,
        )
        worker_task = asyncio.create_task(runtime.run(stop_event))

        await asyncio.wait_for(recovered_while_running.wait(), timeout=1)
        assert handler.release.is_set() is False
        assert service.requeue_count == 2
        stop_event.set()
        handler.release.set()
        await asyncio.wait_for(worker_task, timeout=1)

        assert run.status == AgentRunStatus.SUCCEEDED
        assert not _worker_tasks()

    asyncio.run(run_test())


def _worker_tasks() -> list[asyncio.Task[Any]]:
    return [
        task
        for task in asyncio.all_tasks()
        if not task.done()
        and task.get_name().startswith(
            (
                "agent-handler:",
                "agent-heartbeat:",
                "agent-process:",
                "agent-recovery:",
            )
        )
    ]
