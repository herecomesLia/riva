import asyncio
from pathlib import Path
from typing import Annotated

import typer
from rich import print as rprint

from riva.core.config import Settings
from riva.db import Database

app = typer.Typer(
    invoke_without_command=True,
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Manage database tables from SQLAlchemy models.",
)


@app.callback()
def db(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


@app.command()
def setup(
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            exists=True,
            dir_okay=False,
            readable=True,
            help="Load RIVA_DATABASE_URL from this file.",
        ),
    ] = None,
    yes: Annotated[
        bool,
        typer.Option(
            "-y", "--yes", help="Skip the warning prompt and run immediately."
        ),
    ] = False,
) -> None:
    """Create missing tables declared in SQLAlchemy metadata."""
    if not yes:
        rprint(
            "[bold yellow]Warning:[/bold yellow] [bold cyan]riva db setup[/bold cyan] "
            "creates missing tables from SQLAlchemy models."
        )
        if not typer.confirm("Continue?", default=False):
            raise typer.Exit(code=1)

    database_url = Settings(_env_file=env_file).database_url

    async def run() -> None:
        async with Database(database_url) as database:
            await database.create_tables()

    try:
        asyncio.run(run())
    except Exception as exc:
        typer.secho(
            f"Failed to create database tables: {exc}",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1) from exc

    typer.echo("Database tables created.")


@app.command()
def reset(
    env_file: Annotated[
        Path | None,
        typer.Option(
            "--env-file",
            exists=True,
            dir_okay=False,
            readable=True,
            help="Load RIVA_DATABASE_URL from this file.",
        ),
    ] = None,
    yes: Annotated[
        bool,
        typer.Option(
            "-y", "--yes", help="Skip the warning prompt and run immediately."
        ),
    ] = False,
) -> None:
    """Drop and recreate all tables declared in SQLAlchemy metadata."""
    if not yes:
        rprint(
            "[bold yellow]Warning:[/bold yellow] [bold cyan]riva db reset[/bold cyan] "
            "drops and recreates every table declared in SQLAlchemy models."
        )
        if not typer.confirm("Continue?", default=False):
            raise typer.Exit(code=1)

    database_url = Settings(_env_file=env_file).database_url

    async def run() -> None:
        async with Database(database_url) as database:
            await database.reset()

    try:
        asyncio.run(run())
    except Exception as exc:
        typer.secho(
            f"Failed to reset database tables: {exc}",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1) from exc

    typer.echo("Database tables reset.")
