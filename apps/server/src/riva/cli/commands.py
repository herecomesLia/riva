import os
from pathlib import Path
from typing import Annotated

import typer
import uvicorn

from riva.core.config import Settings
from riva.core.logging import LogLevel


def start(
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            exists=True,
            dir_okay=False,
            readable=True,
            help="Load RIVA_* settings from this file. OS environment and CLI options still take priority.",
        ),
    ] = None,
    host: Annotated[
        str | None,
        typer.Option("--host", help="Host interface to bind. Overrides RIVA_HOST."),
    ] = None,
    port: Annotated[
        int | None,
        typer.Option("--port", min=1, max=65535, help="Port to listen on. Overrides RIVA_PORT."),
    ] = None,
    reload: Annotated[
        bool,
        typer.Option("--reload", help="Restart the server when source files change. CLI-only."),
    ] = False,
    log_level: Annotated[
        LogLevel | None,
        typer.Option("--log-level", help="Uvicorn log level. Overrides RIVA_LOG_LEVEL."),
    ] = None,
) -> None:
    """Start the FastAPI server."""
    overrides: dict[str, object] = {}
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
    os.environ["RIVA_DATABASE_URL"] = settings.database_url

    uvicorn.run(
        "riva.main:app",
        host=settings.host,
        port=settings.port,
        reload=reload,
        log_level=settings.log_level.value,
    )


def register_commands(app: typer.Typer) -> None:
    app.command()(start)
