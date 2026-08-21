from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from riva.schemas.agent_observability import AgentObservabilityReport

WINDOW_FROM = datetime(2026, 8, 17, 0, tzinfo=UTC)
WINDOW_TO = WINDOW_FROM + timedelta(hours=1)


def _report(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "windowFrom": WINDOW_FROM,
        "windowTo": WINDOW_TO,
        "totalRuns": 0,
        "statusCounts": {
            "queued": 0,
            "running": 0,
            "succeeded": 0,
            "failed": 0,
        },
        "terminalRuns": 0,
        "terminalSuccessRate": None,
        "startedRuns": 0,
        "retriedRuns": 0,
        "retryRate": None,
        "pendingRetryRuns": 0,
        "exhaustedFailureRuns": 0,
        "firstQueueLatency": {
            "count": 0,
            "averageMs": 0,
            "p50Ms": 0,
            "p95Ms": 0,
        },
        "terminalLatency": {
            "count": 0,
            "averageMs": 0,
            "p50Ms": 0,
            "p95Ms": 0,
        },
        "processingSpan": {
            "count": 0,
            "averageMs": 0,
            "p50Ms": 0,
            "p95Ms": 0,
        },
        "tokens": {
            "succeededRunCount": 0,
            "inputTokens": 0,
            "outputTokens": 0,
            "totalTokens": 0,
            "averageTotalTokens": 0,
        },
        "terminalErrors": [],
        "byAgent": [],
    }
    value.update(overrides)
    return value


def test_observability_schema_is_strict_and_aliases_are_stable() -> None:
    report = AgentObservabilityReport.model_validate(_report())

    assert report.terminal_success_rate is None
    assert report.retry_rate is None
    assert report.model_dump(mode="json", by_alias=True)["windowFrom"] == (
        "2026-08-17T00:00:00Z"
    )

    with pytest.raises(ValidationError):
        AgentObservabilityReport.model_validate(_report(unexpected="not allowed"))


@pytest.mark.parametrize(
    "change",
    [
        {"totalRuns": -1},
        {"statusCounts": {"queued": -1, "running": 0, "succeeded": 0, "failed": 0}},
        {"firstQueueLatency": {"count": 1, "averageMs": -1, "p50Ms": 0, "p95Ms": 0}},
        {
            "tokens": {
                "succeededRunCount": 1,
                "inputTokens": -1,
                "outputTokens": 0,
                "totalTokens": 0,
                "averageTotalTokens": 0,
            }
        },
        {"terminalSuccessRate": 2.0},
        {"retryRate": -0.1},
    ],
)
def test_counts_rates_latencies_and_tokens_are_bounded(change) -> None:
    payload = _report()
    for key, value in change.items():
        payload[key] = value

    with pytest.raises(ValidationError):
        AgentObservabilityReport.model_validate(payload)


def test_window_must_be_timezone_aware_and_ordered() -> None:
    with pytest.raises(ValidationError, match="timezone-aware"):
        AgentObservabilityReport.model_validate(
            _report(windowFrom=datetime(2026, 8, 17))
        )

    with pytest.raises(ValidationError, match="before"):
        AgentObservabilityReport.model_validate(
            _report(windowFrom=WINDOW_TO, windowTo=WINDOW_FROM)
        )
