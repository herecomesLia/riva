import json
from importlib.util import find_spec
from pathlib import Path
from typing import Annotated

import typer
from rich import print_json

from riva.core.app import create_app
from riva.core.config import Settings
from riva.core.logging import LogFormat, LogLevel, configure_logging


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
        typer.Option(
            "--port", min=1, max=65535, help="Port to listen on. Overrides RIVA_PORT."
        ),
    ] = None,
    reload: Annotated[
        bool,
        typer.Option(
            "--reload", help="Restart the server when source files change. CLI-only."
        ),
    ] = False,
    log_level: Annotated[
        LogLevel | None,
        typer.Option(
            "--log-level", help="Application log level. Overrides RIVA_LOG_LEVEL."
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
    """Start the FastAPI server."""
    overrides: dict[str, object] = {}
    if host is not None:
        overrides["host"] = host
    if port is not None:
        overrides["port"] = port
    if log_level is not None:
        overrides["log_level"] = log_level
    if log_format is not None:
        overrides["log_format"] = log_format

    settings = Settings(_env_file=env_file, **overrides)
    settings.write_environ()
    configure_logging(settings.log_level, settings.log_format)

    import uvicorn

    uvicorn_options: dict[str, object] = {
        "host": settings.host,
        "port": settings.port,
        "reload": reload,
        "log_level": settings.log_level.value,
        "log_config": None,
        "access_log": False,
    }
    if reload:
        uvicorn_options["reload_dirs"] = [str(_source_root_dir())]

    uvicorn.run("riva.main:app", **uvicorn_options)


def _source_root_dir() -> Path:
    spec = find_spec("riva")
    if spec is None:
        raise RuntimeError("Cannot resolve the riva package location.")

    package_locations = spec.submodule_search_locations
    if not package_locations:
        raise RuntimeError("Cannot resolve the riva package directory.")

    locations = list(package_locations)
    if len(locations) != 1:
        raise RuntimeError(
            f"Expected exactly one riva package location, got: {locations}"
        )

    package_dir = Path(locations[0]).resolve()

    if not package_dir.is_dir():
        raise RuntimeError(f"Resolved riva path is not a directory: {package_dir}")

    return package_dir.parent


def openapi(
    pretty: Annotated[
        bool,
        typer.Option("--pretty", help="Pretty-print the OpenAPI document."),
    ] = False,
) -> None:
    """Print the OpenAPI document as JSON."""
    document = create_app().openapi()
    if pretty:
        print_json(data=document, ensure_ascii=False)
        return

    typer.echo(json.dumps(document, ensure_ascii=False))


def register_commands(app: typer.Typer) -> None:
    app.command()(start)
    app.command()(openapi)
