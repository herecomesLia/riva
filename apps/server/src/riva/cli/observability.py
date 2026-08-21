import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, NoReturn

import typer
from pydantic import ValidationError

from riva.core.config import Settings
from riva.db.database import Database
from riva.schemas.agent_observability import AgentObservabilityReport
from riva.services.agent_observability import AgentObservabilityService
from riva.utils import utc_now

app = typer.Typer(
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Inspect runtime AgentRun observability.",
)


@app.command("agent-runs")
def agent_runs(
    hours: Annotated[
        int,
        typer.Option(
            "--hours",
            min=1,
            max=720,
            help="Length of the inclusive created_at window in hours.",
        ),
    ] = 24,
    agent: Annotated[
        str | None,
        typer.Option("--agent", help="Filter to one exact agent id."),
    ] = None,
    json_output: Annotated[
        Path | None,
        typer.Option("--json-output", help="Write the report as stable JSON."),
    ] = None,
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            exists=True,
            dir_okay=False,
            readable=True,
            help="Load RIVA_* settings from this file.",
        ),
    ] = None,
) -> None:
    try:
        settings = Settings(_env_file=env_file)
    except ValidationError:
        _fail("Invalid observability configuration.", code=2)

    window_to = utc_now()
    window_from = window_to - timedelta(hours=hours)

    try:
        report = asyncio.run(
            _get_report(
                settings.database_url,
                window_from=window_from,
                window_to=window_to,
                agent_id=agent,
            )
        )
    except Exception:
        _fail("Unable to generate observability report.", code=2)

    _print_report(report)

    if json_output is not None:
        try:
            json_output.write_text(
                json.dumps(
                    report.model_dump(mode="json", by_alias=True),
                    ensure_ascii=False,
                    sort_keys=True,
                    indent=2,
                )
                + "\n"
            )
        except OSError:
            _fail("Unable to write observability JSON output.", code=2)


async def _get_report(
    database_url: str,
    *,
    window_from: datetime,
    window_to: datetime,
    agent_id: str | None,
) -> AgentObservabilityReport:
    async with Database(database_url) as database:
        async with database.sessionmaker() as session:
            return await AgentObservabilityService(session).get_report(
                window_from=window_from,
                window_to=window_to,
                agent_id=agent_id,
            )


def _print_report(report: AgentObservabilityReport) -> None:
    status = report.status_counts
    typer.echo(
        f"Window: from={report.window_from.isoformat()} "
        f"to={report.window_to.isoformat()}"
    )
    typer.echo(f"Total runs: {report.total_runs}")
    typer.echo(
        "Status counts: "
        f"queued={status.queued}, running={status.running}, "
        f"succeeded={status.succeeded}, failed={status.failed}"
    )
    typer.echo(f"Terminal success rate: {_format_rate(report.terminal_success_rate)}")
    typer.echo(f"Retry rate: {_format_rate(report.retry_rate)}")
    typer.echo(
        "Latency: "
        f"first_queue_p50={report.first_queue_latency.p50_ms}ms, "
        f"first_queue_p95={report.first_queue_latency.p95_ms}ms; "
        f"terminal_p50={report.terminal_latency.p50_ms}ms, "
        f"terminal_p95={report.terminal_latency.p95_ms}ms; "
        f"processing_p50={report.processing_span.p50_ms}ms, "
        f"processing_p95={report.processing_span.p95_ms}ms"
    )
    typer.echo(
        "Tokens: "
        f"input={report.tokens.input_tokens}, "
        f"output={report.tokens.output_tokens}, "
        f"total={report.tokens.total_tokens}, "
        f"average_total={report.tokens.average_total_tokens}"
    )

    if report.terminal_errors:
        typer.echo("Terminal errors:")
        for error in report.terminal_errors:
            typer.echo(f"  {error.error_code}: {error.count}")
    else:
        typer.echo("Terminal errors: none")

    if report.by_agent:
        typer.echo("Per-agent summary:")
        for summary in report.by_agent:
            typer.echo(
                f"  {summary.agent_id}: total={summary.total_runs}, "
                f"terminal={summary.terminal_runs}, "
                f"success_rate={_format_rate(summary.terminal_success_rate)}, "
                f"retry_rate={_format_rate(summary.retry_rate)}"
            )
    else:
        typer.echo("Per-agent summary: none")


def _format_rate(rate: float | int | None) -> str:
    return "n/a" if rate is None else f"{rate:.2%}"


def _fail(message: str, *, code: int) -> NoReturn:
    typer.secho(message, fg=typer.colors.RED, err=True)
    raise typer.Exit(code=code)


def register_observability_command(root_app: typer.Typer) -> None:
    root_app.add_typer(app, name="observability")


__all__ = ["app", "agent_runs", "register_observability_command"]
