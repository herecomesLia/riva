from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import AgentRun, AgentRunStatus
from riva.schemas.agent_observability import (
    AgentErrorCount,
    AgentLatencySummary,
    AgentObservabilityReport,
    AgentRunStatusCounts,
    AgentRuntimeSummary,
    AgentTokenSummary,
)


@dataclass(frozen=True, slots=True)
class AgentRunObservation:
    id: UUID
    agent_id: str
    prompt_id: str
    prompt_version: str
    model: str
    status: AgentRunStatus | str
    attempt_count: int
    max_attempts: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    provider: str | None
    input_tokens: int | None
    output_tokens: int | None
    error_code: str | None


_OBSERVATION_COLUMNS = (
    AgentRun.id,
    AgentRun.agent_id,
    AgentRun.prompt_id,
    AgentRun.prompt_version,
    AgentRun.model,
    AgentRun.status,
    AgentRun.attempt_count,
    AgentRun.max_attempts,
    AgentRun.created_at,
    AgentRun.started_at,
    AgentRun.finished_at,
    AgentRun.provider,
    AgentRun.input_tokens,
    AgentRun.output_tokens,
    AgentRun.error_code,
)


class AgentObservabilityService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_report(
        self,
        *,
        window_from: datetime,
        window_to: datetime,
        agent_id: str | None = None,
    ) -> AgentObservabilityReport:
        _validate_window(window_from, window_to)

        statement = (
            select(*_OBSERVATION_COLUMNS)
            .where(
                AgentRun.created_at >= window_from,
                AgentRun.created_at <= window_to,
            )
            .order_by(AgentRun.created_at.asc(), AgentRun.id.asc())
            .execution_options(autoflush=False)
        )
        if agent_id is not None:
            statement = statement.where(AgentRun.agent_id == agent_id)

        result = await self.session.execute(statement)
        observations = [_observation_from_row(row._mapping) for row in result.all()]
        return aggregate_agent_run_observations(
            observations,
            window_from=window_from,
            window_to=window_to,
            agent_id=agent_id,
        )


def aggregate_agent_run_observations(
    runs: Iterable[AgentRunObservation],
    *,
    window_from: datetime,
    window_to: datetime,
    agent_id: str | None = None,
) -> AgentObservabilityReport:
    """Aggregate an already selected, non-sensitive AgentRun observation set."""

    _validate_window(window_from, window_to)
    cohort = []
    for run in runs:
        _validate_run_timestamps(run)
        if not window_from <= run.created_at <= window_to:
            continue
        if agent_id is not None and run.agent_id != agent_id:
            continue
        cohort.append(run)

    aggregate = _aggregate_scope(cohort)
    by_agent = [
        _runtime_summary(current_agent_id, _aggregate_scope(agent_runs))
        for current_agent_id, agent_runs in sorted(
            _group_by_agent(cohort).items(),
            key=lambda item: item[0],
        )
    ]
    return AgentObservabilityReport(
        window_from=window_from,
        window_to=window_to,
        total_runs=aggregate.total_runs,
        status_counts=aggregate.status_counts,
        terminal_runs=aggregate.terminal_runs,
        terminal_success_rate=aggregate.terminal_success_rate,
        started_runs=aggregate.started_runs,
        retried_runs=aggregate.retried_runs,
        retry_rate=aggregate.retry_rate,
        pending_retry_runs=aggregate.pending_retry_runs,
        exhausted_failure_runs=aggregate.exhausted_failure_runs,
        first_queue_latency=aggregate.first_queue_latency,
        terminal_latency=aggregate.terminal_latency,
        processing_span=aggregate.processing_span,
        tokens=aggregate.tokens,
        terminal_errors=aggregate.terminal_errors,
        by_agent=by_agent,
    )


@dataclass(frozen=True, slots=True)
class _ScopeAggregate:
    total_runs: int
    status_counts: AgentRunStatusCounts
    terminal_runs: int
    terminal_success_rate: float | None
    started_runs: int
    retried_runs: int
    retry_rate: float | None
    pending_retry_runs: int
    exhausted_failure_runs: int
    first_queue_latency: AgentLatencySummary
    terminal_latency: AgentLatencySummary
    processing_span: AgentLatencySummary
    tokens: AgentTokenSummary
    terminal_errors: list[AgentErrorCount]
    prompt_versions: dict[str, int]
    models: dict[str, int]
    providers: dict[str, int]


def _aggregate_scope(runs: list[AgentRunObservation]) -> _ScopeAggregate:
    statuses = Counter(_status_value(run.status) for run in runs)
    succeeded_runs = [
        run
        for run in runs
        if _status_value(run.status) == AgentRunStatus.SUCCEEDED.value
    ]
    failed_runs = [
        run for run in runs if _status_value(run.status) == AgentRunStatus.FAILED.value
    ]
    terminal_runs = len(succeeded_runs) + len(failed_runs)
    started_runs = sum(run.attempt_count > 0 for run in runs)
    retried_runs = sum(run.attempt_count > 1 for run in runs)

    return _ScopeAggregate(
        total_runs=len(runs),
        status_counts=AgentRunStatusCounts(
            queued=statuses[AgentRunStatus.QUEUED.value],
            running=statuses[AgentRunStatus.RUNNING.value],
            succeeded=statuses[AgentRunStatus.SUCCEEDED.value],
            failed=statuses[AgentRunStatus.FAILED.value],
        ),
        terminal_runs=terminal_runs,
        terminal_success_rate=(
            len(succeeded_runs) / terminal_runs if terminal_runs else None
        ),
        started_runs=started_runs,
        retried_runs=retried_runs,
        retry_rate=retried_runs / started_runs if started_runs else None,
        pending_retry_runs=sum(
            _status_value(run.status) == AgentRunStatus.QUEUED.value
            and run.attempt_count > 0
            for run in runs
        ),
        exhausted_failure_runs=sum(
            _status_value(run.status) == AgentRunStatus.FAILED.value
            and run.attempt_count >= run.max_attempts
            for run in runs
        ),
        first_queue_latency=_latency_summary(
            _duration_ms(run.created_at, run.started_at)
            for run in runs
            if run.started_at is not None
        ),
        terminal_latency=_latency_summary(
            _duration_ms(run.created_at, run.finished_at)
            for run in runs
            if _status_value(run.status) in _TERMINAL_STATUSES
            and run.finished_at is not None
        ),
        processing_span=_latency_summary(
            _duration_ms(run.started_at, run.finished_at)
            for run in runs
            if _status_value(run.status) in _TERMINAL_STATUSES
            and run.started_at is not None
            and run.finished_at is not None
        ),
        tokens=_token_summary(succeeded_runs),
        terminal_errors=_error_counts(failed_runs),
        prompt_versions=_distribution(run.prompt_version for run in runs),
        models=_distribution(run.model for run in runs),
        providers=_distribution(
            run.provider for run in runs if run.provider is not None
        ),
    )


def _runtime_summary(agent_id: str, aggregate: _ScopeAggregate) -> AgentRuntimeSummary:
    return AgentRuntimeSummary(
        agent_id=agent_id,
        total_runs=aggregate.total_runs,
        status_counts=aggregate.status_counts,
        terminal_runs=aggregate.terminal_runs,
        terminal_success_rate=aggregate.terminal_success_rate,
        started_runs=aggregate.started_runs,
        retried_runs=aggregate.retried_runs,
        retry_rate=aggregate.retry_rate,
        pending_retry_runs=aggregate.pending_retry_runs,
        exhausted_failure_runs=aggregate.exhausted_failure_runs,
        first_queue_latency=aggregate.first_queue_latency,
        terminal_latency=aggregate.terminal_latency,
        processing_span=aggregate.processing_span,
        tokens=aggregate.tokens,
        terminal_errors=aggregate.terminal_errors,
        prompt_versions=aggregate.prompt_versions,
        models=aggregate.models,
        providers=aggregate.providers,
    )


def _observation_from_row(row: Any) -> AgentRunObservation:
    return AgentRunObservation(
        id=row["id"],
        agent_id=row["agent_id"],
        prompt_id=row["prompt_id"],
        prompt_version=row["prompt_version"],
        model=row["model"],
        status=row["status"],
        attempt_count=row["attempt_count"],
        max_attempts=row["max_attempts"],
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        provider=row["provider"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        error_code=row["error_code"],
    )


def _group_by_agent(
    runs: Iterable[AgentRunObservation],
) -> dict[str, list[AgentRunObservation]]:
    grouped: dict[str, list[AgentRunObservation]] = {}
    for run in runs:
        grouped.setdefault(run.agent_id, []).append(run)
    return grouped


def _token_summary(runs: list[AgentRunObservation]) -> AgentTokenSummary:
    input_tokens = sum(run.input_tokens or 0 for run in runs)
    output_tokens = sum(run.output_tokens or 0 for run in runs)
    total_tokens = input_tokens + output_tokens
    return AgentTokenSummary(
        succeeded_run_count=len(runs),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        average_total_tokens=_round_half_up_average(
            total_tokens,
            len(runs),
        ),
    )


def _error_counts(runs: list[AgentRunObservation]) -> list[AgentErrorCount]:
    counts = Counter(run.error_code for run in runs if run.error_code is not None)
    return [
        AgentErrorCount(error_code=error_code, count=count)
        for error_code, count in sorted(
            counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _distribution(values: Iterable[str]) -> dict[str, int]:
    return dict(sorted(Counter(values).items()))


def _latency_summary(values: Iterable[int]) -> AgentLatencySummary:
    ordered = sorted(values)
    count = len(ordered)
    return AgentLatencySummary(
        count=count,
        average_ms=_round_half_up_average(sum(ordered), count),
        p50_ms=_nearest_rank(ordered, 50, 100),
        p95_ms=_nearest_rank(ordered, 95, 100),
    )


def _nearest_rank(values: list[int], numerator: int, denominator: int) -> int:
    if not values:
        return 0
    rank = (len(values) * numerator + denominator - 1) // denominator
    return values[rank - 1]


def _round_half_up_average(total: int, count: int) -> int:
    if count == 0:
        return 0
    return (2 * total + count) // (2 * count)


def _duration_ms(
    start: datetime,
    end: datetime | None,
) -> int:
    if end is None:
        return 0
    delta = end - start
    if delta <= timedelta(0):
        return 0
    microseconds = (
        delta.days * 86_400 * 1_000_000 + delta.seconds * 1_000_000 + delta.microseconds
    )
    return (microseconds + 500) // 1_000


def _status_value(status: AgentRunStatus | str) -> str:
    return status.value if isinstance(status, AgentRunStatus) else str(status)


def _validate_window(window_from: datetime, window_to: datetime) -> None:
    _require_aware_datetime("window_from", window_from)
    _require_aware_datetime("window_to", window_to)
    if window_from >= window_to:
        raise ValueError("window_from must be before window_to")


def _validate_run_timestamps(run: AgentRunObservation) -> None:
    _require_aware_datetime("created_at", run.created_at)
    if run.started_at is not None:
        _require_aware_datetime("started_at", run.started_at)
    if run.finished_at is not None:
        _require_aware_datetime("finished_at", run.finished_at)


def _require_aware_datetime(name: str, value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


_TERMINAL_STATUSES = {
    AgentRunStatus.SUCCEEDED.value,
    AgentRunStatus.FAILED.value,
}


__all__ = [
    "AgentObservabilityService",
    "AgentRunObservation",
    "aggregate_agent_run_observations",
]
