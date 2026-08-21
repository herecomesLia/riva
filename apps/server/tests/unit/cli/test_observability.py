import json
from datetime import datetime, timedelta

import pytest
from typer.testing import CliRunner

import riva.cli.observability as observability_module
from riva.cli.main import app
from riva.schemas.agent_observability import (
    AgentLatencySummary,
    AgentObservabilityReport,
    AgentRunStatusCounts,
    AgentTokenSummary,
)


def _configure_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://operator:test@localhost/riva",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "operator-session-key")


def _empty_report(
    window_from: datetime,
    window_to: datetime,
) -> AgentObservabilityReport:
    latency = AgentLatencySummary(count=0, averageMs=0, p50Ms=0, p95Ms=0)
    return AgentObservabilityReport(
        windowFrom=window_from,
        windowTo=window_to,
        totalRuns=0,
        statusCounts=AgentRunStatusCounts(
            queued=0,
            running=0,
            succeeded=0,
            failed=0,
        ),
        terminalRuns=0,
        terminalSuccessRate=None,
        startedRuns=0,
        retriedRuns=0,
        retryRate=None,
        pendingRetryRuns=0,
        exhaustedFailureRuns=0,
        firstQueueLatency=latency,
        terminalLatency=latency,
        processingSpan=latency,
        tokens=AgentTokenSummary(
            succeededRunCount=0,
            inputTokens=0,
            outputTokens=0,
            totalTokens=0,
            averageTotalTokens=0,
        ),
        terminalErrors=[],
        byAgent=[],
    )


def test_cli_defaults_to_24_hours_and_empty_report_exits_zero(
    monkeypatch,
) -> None:
    _configure_env(monkeypatch)
    seen: dict[str, object] = {}

    async def fake_get_report(
        database_url: str,
        *,
        window_from: datetime,
        window_to: datetime,
        agent_id: str | None,
    ) -> AgentObservabilityReport:
        seen.update(
            database_url=database_url,
            window_from=window_from,
            window_to=window_to,
            agent_id=agent_id,
        )
        return _empty_report(window_from, window_to)

    monkeypatch.setattr(observability_module, "_get_report", fake_get_report)

    result = CliRunner().invoke(app, ["observability", "agent-runs"])

    assert result.exit_code == 0, result.output
    assert seen["database_url"] == "postgresql+asyncpg://operator:test@localhost/riva"
    assert seen["agent_id"] is None
    assert seen["window_to"] - seen["window_from"] == timedelta(hours=24)
    assert "Total runs: 0" in result.output
    assert "Terminal success rate: n/a" in result.output
    assert "Retry rate: n/a" in result.output


def test_cli_accepts_hours_and_exact_agent_filter(monkeypatch) -> None:
    _configure_env(monkeypatch)
    seen: dict[str, object] = {}

    async def fake_get_report(
        _database_url: str,
        *,
        window_from: datetime,
        window_to: datetime,
        agent_id: str | None,
    ) -> AgentObservabilityReport:
        seen.update(
            window_from=window_from,
            window_to=window_to,
            agent_id=agent_id,
        )
        return _empty_report(window_from, window_to)

    monkeypatch.setattr(observability_module, "_get_report", fake_get_report)

    result = CliRunner().invoke(
        app,
        [
            "observability",
            "agent-runs",
            "--hours",
            "3",
            "--agent",
            "practice-evaluator",
        ],
    )

    assert result.exit_code == 0, result.output
    assert seen["agent_id"] == "practice-evaluator"
    assert seen["window_to"] - seen["window_from"] == timedelta(hours=3)


def test_cli_prints_summary_and_writes_stable_json(monkeypatch, tmp_path) -> None:
    _configure_env(monkeypatch)
    output_path = tmp_path / "observability.json"

    async def fake_get_report(
        _database_url: str,
        *,
        window_from: datetime,
        window_to: datetime,
        agent_id: str | None,
    ) -> AgentObservabilityReport:
        return _empty_report(window_from, window_to)

    monkeypatch.setattr(observability_module, "_get_report", fake_get_report)

    result = CliRunner().invoke(
        app,
        [
            "observability",
            "agent-runs",
            "--json-output",
            str(output_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "Status counts:" in result.output
    assert "Latency:" in result.output
    assert "Tokens:" in result.output
    assert "Terminal errors: none" in result.output
    assert "Per-agent summary: none" in result.output
    content = output_path.read_text()
    assert content.endswith("\n")
    assert (
        content
        == json.dumps(
            json.loads(content),
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
        )
        + "\n"
    )


@pytest.mark.parametrize(
    "args",
    [
        ["--hours", "0"],
        ["--hours", "721"],
    ],
)
def test_cli_rejects_invalid_hours(monkeypatch, args) -> None:
    _configure_env(monkeypatch)

    result = CliRunner().invoke(
        app,
        ["observability", "agent-runs", *args],
    )

    assert result.exit_code == 2


def test_cli_invalid_configuration_exits_two(monkeypatch) -> None:
    monkeypatch.delenv("RIVA_DATABASE_URL", raising=False)
    monkeypatch.delenv("RIVA_SESSION_DIGEST_KEY", raising=False)

    result = CliRunner().invoke(app, ["observability", "agent-runs"])

    assert result.exit_code == 2
    assert "Invalid observability configuration." in result.output


def test_cli_database_failure_exits_two(monkeypatch) -> None:
    _configure_env(monkeypatch)

    async def failing_get_report(*_args, **_kwargs):
        raise RuntimeError("private database details")

    monkeypatch.setattr(observability_module, "_get_report", failing_get_report)

    result = CliRunner().invoke(app, ["observability", "agent-runs"])

    assert result.exit_code == 2
    assert "Unable to generate observability report." in result.output
    assert "private database details" not in result.output
