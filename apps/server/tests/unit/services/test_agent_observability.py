import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from riva.models import AgentRunStatus
from riva.services.agent_observability import (
    AgentObservabilityService,
    AgentRunObservation,
    aggregate_agent_run_observations,
)


START = datetime(2026, 8, 17, 0, tzinfo=UTC)
END = START + timedelta(days=2)


def _run(
    offset_ms: int,
    *,
    agent_id: str = "agent-a",
    status: AgentRunStatus = AgentRunStatus.SUCCEEDED,
    attempt_count: int = 1,
    max_attempts: int = 3,
    queue_ms: int | None = 10,
    terminal_ms: int | None = 100,
    processing_ms: int | None = 90,
    provider: str | None = "provider-a",
    input_tokens: int | None = 2,
    output_tokens: int | None = 3,
    error_code: str | None = None,
) -> AgentRunObservation:
    created_at = START + timedelta(milliseconds=offset_ms)
    started_at = (
        created_at + timedelta(milliseconds=queue_ms)
        if queue_ms is not None
        else None
    )
    finished_at = (
        created_at + timedelta(milliseconds=terminal_ms)
        if terminal_ms is not None
        else None
    )
    if processing_ms is not None and started_at is not None:
        finished_at = started_at + timedelta(milliseconds=processing_ms)

    if status in {AgentRunStatus.QUEUED, AgentRunStatus.RUNNING}:
        finished_at = None
    if status in {AgentRunStatus.QUEUED, AgentRunStatus.RUNNING}:
        provider = None
        input_tokens = None
        output_tokens = None
    if status == AgentRunStatus.FAILED:
        provider = None
        input_tokens = None
        output_tokens = None
        error_code = error_code or "agent_failure"

    return AgentRunObservation(
        id=uuid4(),
        agent_id=agent_id,
        prompt_id="prompt-a",
        prompt_version="1",
        model="model-a",
        status=status,
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        created_at=created_at,
        started_at=started_at,
        finished_at=finished_at,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        error_code=error_code,
    )


def _report(runs: list[AgentRunObservation]):
    return aggregate_agent_run_observations(
        runs,
        window_from=START,
        window_to=END,
    )


def test_status_retry_and_terminal_aggregation() -> None:
    runs = [
        _run(0, status=AgentRunStatus.QUEUED, attempt_count=0, queue_ms=None, terminal_ms=None, processing_ms=None),
        _run(1, status=AgentRunStatus.QUEUED, attempt_count=1, queue_ms=20, terminal_ms=None, processing_ms=None),
        _run(2, status=AgentRunStatus.RUNNING, attempt_count=2, queue_ms=20, terminal_ms=None, processing_ms=None),
        _run(3, status=AgentRunStatus.SUCCEEDED),
        _run(4, status=AgentRunStatus.FAILED, attempt_count=1, max_attempts=3, error_code="z_error"),
        _run(5, status=AgentRunStatus.FAILED, attempt_count=3, max_attempts=3, error_code="a_error"),
        _run(6, status=AgentRunStatus.FAILED, attempt_count=1, max_attempts=3, error_code="z_error"),
    ]

    report = _report(runs)

    assert report.total_runs == 7
    assert report.status_counts.model_dump() == {
        "queued": 2,
        "running": 1,
        "succeeded": 1,
        "failed": 3,
    }
    assert report.terminal_runs == 4
    assert report.terminal_success_rate == pytest.approx(1 / 4)
    assert report.started_runs == 6
    assert report.retried_runs == 2
    assert report.retry_rate == pytest.approx(2 / 6)
    assert report.pending_retry_runs == 1
    assert report.exhausted_failure_runs == 1
    assert [item.error_code for item in report.terminal_errors] == [
        "z_error",
        "a_error",
    ]


def test_empty_and_no_terminal_reports_use_null_rates() -> None:
    empty = _report([])
    assert empty.total_runs == 0
    assert empty.terminal_success_rate is None
    assert empty.retry_rate is None
    assert empty.by_agent == []
    assert empty.tokens.total_tokens == 0

    no_terminal = _report(
        [
            _run(0, status=AgentRunStatus.QUEUED, attempt_count=0, queue_ms=None, terminal_ms=None, processing_ms=None),
            _run(1, status=AgentRunStatus.RUNNING, queue_ms=10, terminal_ms=None, processing_ms=None),
        ]
    )
    assert no_terminal.terminal_success_rate is None


def test_latency_uses_nearest_rank_and_half_up_average() -> None:
    runs = [
        _run(
            index,
            queue_ms=index,
            terminal_ms=300 + 2 * index,
            processing_ms=None,
        )
        for index in range(1, 21)
    ]

    report = _report(runs)

    assert report.first_queue_latency.count == 20
    assert report.first_queue_latency.average_ms == 11
    assert report.first_queue_latency.p50_ms == 10
    assert report.first_queue_latency.p95_ms == 19
    assert report.terminal_latency.p50_ms == 320
    assert report.terminal_latency.p95_ms == 338
    assert report.processing_span.p50_ms == 310
    assert report.processing_span.p95_ms == 319


def test_processing_span_is_first_start_to_final_finish() -> None:
    run = _run(
        0,
        attempt_count=2,
        queue_ms=1_000,
        terminal_ms=11_000,
        processing_ms=10_000,
    )

    report = _report([run])

    assert report.processing_span.average_ms == 10_000
    assert report.terminal_latency.average_ms == 11_000


def test_tokens_are_succeeded_only_and_average_is_half_up() -> None:
    succeeded_a = _run(0, input_tokens=2, output_tokens=3)
    succeeded_b = _run(1, input_tokens=3, output_tokens=3)
    failed = _run(
        2,
        status=AgentRunStatus.FAILED,
        input_tokens=999,
        output_tokens=999,
    )

    tokens = _report([succeeded_a, succeeded_b, failed]).tokens

    assert tokens.succeeded_run_count == 2
    assert tokens.input_tokens == 5
    assert tokens.output_tokens == 6
    assert tokens.total_tokens == 11
    assert tokens.average_total_tokens == 6


def test_distributions_and_by_agent_sorting_are_stable() -> None:
    first = _run(0, agent_id="z-agent", provider="z-provider")
    second = _run(1, agent_id="a-agent", provider="a-provider")
    third = _run(2, agent_id="a-agent", provider=None)

    report = _report([first, second, third])

    assert [summary.agent_id for summary in report.by_agent] == [
        "a-agent",
        "z-agent",
    ]
    assert report.by_agent[0].providers == {"a-provider": 1}
    assert report.by_agent[1].prompt_versions == {"1": 1}
    assert report.by_agent[1].models == {"model-a": 1}
    assert report.by_agent[1].providers == {"z-provider": 1}


class _Row:
    def __init__(self, values: dict[str, object]) -> None:
        self._mapping = values


class _Result:
    def __init__(self, rows: list[_Row]) -> None:
        self.rows = rows

    def all(self) -> list[_Row]:
        return self.rows


class _Session:
    def __init__(self, rows: list[_Row]) -> None:
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result(self.rows)


def test_service_selects_only_safe_observation_columns() -> None:
    run = _run(0)
    row = _Row(
        {
            "id": run.id,
            "agent_id": run.agent_id,
            "prompt_id": run.prompt_id,
            "prompt_version": run.prompt_version,
            "model": run.model,
            "status": run.status,
            "attempt_count": run.attempt_count,
            "max_attempts": run.max_attempts,
            "created_at": run.created_at,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "provider": run.provider,
            "input_tokens": run.input_tokens,
            "output_tokens": run.output_tokens,
            "error_code": run.error_code,
        }
    )
    session = _Session([row])

    report = asyncio.run(
        AgentObservabilityService(session).get_report(
            window_from=START,
            window_to=END,
        )
    )

    assert report.total_runs == 1
    selected = set(session.statement.selected_columns.keys())
    assert {
        "id",
        "agent_id",
        "prompt_id",
        "prompt_version",
        "model",
        "status",
        "attempt_count",
        "max_attempts",
        "created_at",
        "started_at",
        "finished_at",
        "provider",
        "input_tokens",
        "output_tokens",
        "error_code",
    } == selected
    assert not {"payload", "result", "idempotency_key", "user_id"} & selected
