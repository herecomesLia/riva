from typing import Annotated

import typer
import uvicorn

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
        str,
        typer.Option("--host", help="Host interface to bind the server to."),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", help="Port to listen on."),
    ] = 8000,
    reload: Annotated[
        bool,
        typer.Option("--reload", help="Enable auto-reload for development."),
    ] = False,
) -> None:
    """Start the server."""
    uvicorn.run("riva.main:app", host=host, port=port, reload=reload)


def main() -> None:
    app()
