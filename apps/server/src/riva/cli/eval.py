from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Annotated, NoReturn

import typer
from pydantic import ValidationError

from riva.core.config import Settings
from riva.evals.quality_judge import AgentEvalQualityJudge
from riva.evals.registry import build_default_registry
from riva.evals.runner import AgentEvalRunner, load_eval_cases
from riva.integrations import build_llm_provider

app = typer.Typer(
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Run offline Agent evaluations.",
)


@app.command("run")
def run(
    agent: Annotated[
        str | None,
        typer.Option("--agent", help="Run cases for one registered agent."),
    ] = None,
    judge_model: Annotated[
        str | None,
        typer.Option(
            "--judge-model",
            help="Optional model used for semantic rubric judging.",
        ),
    ] = None,
    cases_dir: Annotated[
        Path,
        typer.Option(
            "--cases-dir",
            exists=True,
            file_okay=False,
            dir_okay=True,
            readable=True,
            help="Directory or path containing JSON eval cases.",
        ),
    ] = Path("apps/server/evals/cases"),
    json_output: Annotated[
        Path | None,
        typer.Option(
            "--json-output",
            help="Write the stable JSON run result to this path.",
        ),
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
    except ValidationError as error:
        _fail(f"Invalid eval configuration: {error}", code=2)

    provider_name = (settings.llm_provider or "").strip()
    model = (settings.llm_model or "").strip()
    if not provider_name:
        _fail(
            "LLM provider is not configured. Set RIVA_LLM_PROVIDER or use --env-file.",
            code=2,
        )
    if not model:
        _fail(
            "LLM model is not configured. Set RIVA_LLM_MODEL or use --env-file.",
            code=2,
        )

    try:
        provider = build_llm_provider(settings)
    except Exception as error:
        _fail(f"Unable to configure LLM provider: {error}", code=2)
    if provider is None:
        _fail(
            "LLM provider is not configured. Set RIVA_LLM_PROVIDER or use --env-file.",
            code=2,
        )

    registry = build_default_registry()
    if agent is not None:
        try:
            registry.get(agent)
        except ValueError as error:
            _fail(str(error), code=2)

    quality_judge = AgentEvalQualityJudge(
        provider,
        (judge_model or "").strip() or model,
    )

    try:
        cases = load_eval_cases(cases_dir)
        result = asyncio.run(
            AgentEvalRunner(
                provider,
                model,
                registry,
                quality_judge=quality_judge,
            ).run_cases(
                cases,
                agent_id=agent,
            )
        )
    except Exception as error:
        _fail(f"Unable to run eval cases: {error}", code=2)

    for case in result.cases:
        status = "PASS" if case.passed else "FAIL"
        quality = (
            f" quality={case.average_rubric_score:.2f}/4"
            if case.average_rubric_score is not None
            else ""
        )
        typer.echo(f"{status} {case.case_id}{quality}")
        if not case.passed:
            for failure in case.failed_assertions:
                typer.echo(f"  {failure}")

    average_quality = (
        f"{result.average_rubric_score:.2f}/4"
        if result.average_rubric_score is not None
        else "n/a"
    )
    typer.echo(
        "Summary: "
        f"{result.passed}/{result.total} passed "
        f"(pass rate {result.pass_rate:.2%}); "
        f"average quality={average_quality}; "
        f"input tokens={result.input_tokens}, "
        f"output tokens={result.output_tokens}"
    )

    if json_output is not None:
        try:
            payload = result.model_dump(mode="json", by_alias=True)
            json_output.write_text(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    indent=2,
                )
                + "\n"
            )
        except OSError as error:
            _fail(f"Unable to write eval JSON output: {error}", code=2)

    if result.failed:
        raise typer.Exit(code=1)


def register_eval_command(root_app: typer.Typer) -> None:
    root_app.add_typer(app, name="eval")


def _fail(message: str, *, code: int) -> NoReturn:
    typer.secho(message, fg=typer.colors.RED, err=True)
    raise typer.Exit(code=code)
