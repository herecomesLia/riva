import os
from pathlib import Path
from typing import Annotated

import typer
import uvicorn

from riva.core.config import Settings
from riva.core.logging import LogLevel

app = typer.Typer(
    add_completion=False,
    invoke_without_command=True,
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Riva server CLI.",
)


@app.callback()
def cli(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


@app.command()
def start(
    host: Annotated[
        str | None,
        typer.Option("--host", help="Host interface to bind the server to."),
    ] = None,
    port: Annotated[
        int | None,
        typer.Option("--port", help="Port to listen on."),
    ] = None,
    reload: Annotated[
        bool,
        typer.Option("--reload", help="Enable auto-reload for development."),
    ] = False,
    log_level: Annotated[
        LogLevel | None,
        typer.Option("--log-level", help="Uvicorn log level."),
    ] = None,
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            dir_okay=False,
            exists=True,
            readable=True,
            resolve_path=True,
            help="Environment file to load.",
        ),
    ] = None,
) -> None:
    """Start the server."""
    overrides: dict[str, str | int | LogLevel] = {}
    if host is not None:
        overrides["host"] = host
    if port is not None:
        overrides["port"] = port
    if log_level is not None:
        overrides["log_level"] = log_level

    settings = Settings(_env_file=env_file, **overrides)
    os.environ["RIVA_HOST"] = settings.host
    os.environ["RIVA_PORT"] = str(settings.port)
    os.environ["RIVA_LOG_LEVEL"] = settings.log_level.value

    uvicorn.run(
        "riva.main:app",
        host=settings.host,
        port=settings.port,
        reload=reload,
        log_level=settings.log_level.value,
    )


def main() -> None:
    app()
