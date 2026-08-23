import typer

from riva.cli.commands import register_commands
from riva.cli.db import app as db_app

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


register_commands(app)
app.add_typer(db_app, name="db")


def main() -> None:
    app()
