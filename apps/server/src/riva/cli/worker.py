import asyncio
from pathlib import Path
from typing import Annotated

import typer
from pydantic import ValidationError

from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel, configure_logging
from riva.workers.bootstrap import run_worker


def worker(
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            exists=True,
            dir_okay=False,
            readable=True,
            help=(
                "Load RIVA_* settings from this file. OS environment and CLI "
                "options still take priority."
            ),
        ),
    ] = None,
    worker_id: Annotated[
        str | None,
        typer.Option(
            "--worker-id",
            help="Worker process identifier. Overrides RIVA_WORKER_ID.",
        ),
    ] = None,
    log_level: Annotated[
        LogLevel | None,
        typer.Option(
            "--log-level",
            help="Application log level. Overrides RIVA_LOG_LEVEL.",
        ),
    ] = None,
    log_format: Annotated[
        LogFormat | None,
        typer.Option(
            "--log-format",
            help="Log renderer: console for development, json for production.",
        ),
    ] = None,
) -> None:
    """Run the PostgreSQL-backed Agent queue Worker."""
    overrides: dict[str, object] = {}
    if worker_id is not None:
        overrides["worker_id"] = worker_id
    if log_level is not None:
        overrides["log_level"] = log_level
    if log_format is not None:
        overrides["log_format"] = log_format

    try:
        settings = Settings(_env_file=env_file, **overrides)
    except ValidationError:
        typer.secho(
            "Invalid worker configuration.",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=2) from None

    configure_logging(settings.log_level, settings.log_format)

    try:
        asyncio.run(run_worker(settings))
    except KeyboardInterrupt:
        return
    except Exception:
        typer.secho(
            "Worker failed. See logs for details.",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1) from None


def register_worker_command(app: typer.Typer) -> None:
    app.command()(worker)
