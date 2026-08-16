from pathlib import Path
from typing import Annotated, Callable

import typer
from rich import print as rprint

from riva.core.config import Settings
from riva.db import migrations


app = typer.Typer(
    invoke_without_command=True,
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Manage database schema migrations.",
)


@app.callback()
def db(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


def _database_url(env_file: Path | None) -> str:
    return Settings(_env_file=env_file).database_url


def _run_migration(action: str, operation: Callable[[], None]) -> None:
    try:
        operation()
    except Exception as exc:
        typer.secho(
            f"Failed to {action} database migrations: {exc}",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(code=1) from exc


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
    """Upgrade the database to the migration head."""
    if not yes:
        rprint(
            "[bold yellow]Warning:[/bold yellow] Production environments should "
            "use migrations explicitly; [bold cyan]riva db setup[/bold cyan] "
            "will upgrade the database to head."
        )
        if not typer.confirm("Continue?", default=False):
            raise typer.Exit(code=1)

    database_url = _database_url(env_file)
    _run_migration("upgrade", lambda: migrations.upgrade(database_url, "head"))
    typer.echo("Database upgraded to head.")


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
    """Downgrade to base and upgrade to the migration head."""
    if not yes:
        rprint(
            "[bold yellow]Warning:[/bold yellow] [bold cyan]riva db reset[/bold cyan] "
            "downgrades the database to base and recreates every table from "
            "migrations."
        )
        if not typer.confirm("Continue?", default=False):
            raise typer.Exit(code=1)

    database_url = _database_url(env_file)

    def reset_database() -> None:
        migrations.downgrade(database_url, "base")
        migrations.upgrade(database_url, "head")

    _run_migration("reset", reset_database)
    typer.echo("Database reset through migrations.")


@app.command()
def upgrade(
    revision: Annotated[
        str,
        typer.Option("--revision", help="Revision target, defaulting to head."),
    ] = "head",
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
) -> None:
    """Apply migrations up to a revision."""
    database_url = _database_url(env_file)
    _run_migration(
        "upgrade",
        lambda: migrations.upgrade(database_url, revision),
    )
    typer.echo(f"Database upgraded to {revision}.")


@app.command()
def downgrade(
    revision: Annotated[
        str,
        typer.Option("--revision", help="Revision target, defaulting to -1."),
    ] = "-1",
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
) -> None:
    """Revert migrations to a revision."""
    database_url = _database_url(env_file)
    _run_migration(
        "downgrade",
        lambda: migrations.downgrade(database_url, revision),
    )
    typer.echo(f"Database downgraded to {revision}.")


@app.command()
def revision(
    message: Annotated[str, typer.Argument(help="Migration message.")],
    empty: Annotated[
        bool,
        typer.Option(
            "--empty",
            help="Create an empty revision instead of autogenerating from models.",
        ),
    ] = False,
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
) -> None:
    """Create a new migration revision."""
    database_url = _database_url(env_file)
    _run_migration(
        "create revision",
        lambda: migrations.revision(
            database_url,
            message,
            autogenerate=not empty,
        ),
    )
    typer.echo("Migration revision created.")


@app.command()
def current(
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
) -> None:
    """Show the database migration revision."""
    database_url = _database_url(env_file)
    _run_migration("show current revision", lambda: migrations.current(database_url))


@app.command()
def check(
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
) -> None:
    """Check for model changes that are not represented by migrations."""
    database_url = _database_url(env_file)
    _run_migration("check migrations", lambda: migrations.check(database_url))
    typer.echo("Database migrations are up to date.")


@app.command()
def stamp(
    revision: Annotated[
        str,
        typer.Option("--revision", help="Revision to stamp, defaulting to head."),
    ] = "head",
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
            "-y",
            "--yes",
            help="Acknowledge that stamp does not execute DDL.",
        ),
    ] = False,
) -> None:
    """Mark a confirmed existing schema at a revision without executing DDL."""
    rprint(
        "[bold yellow]Danger:[/bold yellow] [bold cyan]stamp[/bold cyan] "
        "only changes the Alembic migration version; it does not execute "
        "DDL. Use it only after confirming the existing database schema "
        "matches the selected revision."
    )
    if not yes:
        if not typer.confirm("Continue?", default=False):
            raise typer.Exit(code=1)

    database_url = _database_url(env_file)
    _run_migration(
        "stamp database",
        lambda: migrations.stamp(database_url, revision),
    )
    typer.echo(f"Database stamped at {revision}.")
