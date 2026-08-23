import json

import pytest
from typer.testing import CliRunner

import riva.cli.eval as eval_module
from riva.cli.main import app
from riva.integrations import LLMUsage
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.question import valid_question_generation_input


def _configure_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://eval:test@localhost/riva",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "eval-session-key")
    monkeypatch.setenv("RIVA_LLM_PROVIDER", "qwen")
    monkeypatch.setenv("RIVA_LLM_MODEL", "eval-model")
    monkeypatch.setenv("RIVA_LLM_API_KEY", "eval-api-key")
    monkeypatch.setenv("RIVA_LLM_BASE_URL", "https://example.invalid/v1")


def _write_case(
    path,
    *,
    expected: str = "projectDeepDive",
    with_rubric: bool = False,
):
    input_model = valid_question_generation_input()
    payload = {
        "id": "cli.question",
        "agentId": "question-generator",
        "promptVersion": "3",
        "input": input_model.model_dump(mode="json"),
        "assertions": [
            {
                "operator": "exact",
                "path": "/question_type",
                "expected": expected,
            }
        ],
    }
    if with_rubric:
        payload["rubrics"] = [
            {
                "id": "quality",
                "criteria": "The question fits the requested context.",
            }
        ]
    path.write_text(json.dumps(payload))
    return input_model


def _provider(
    input_model,
    output_type: str = "projectDeepDive",
    *,
    include_judge: bool = False,
) -> FakeLLMProvider:
    responses: list[object] = [
        {
            "prompt": "Describe the payment decision?",
            "question_type": output_type,
            "difficulty": input_model.difficulty.value,
            "assessed_capabilities": ["Ownership"],
            "recommended_materials": [],
            "answer_hints": ["Use evidence."],
            "answer_framework": ["Context", "Action"],
            "follow_up_directions": ["Probe details."],
            "scoring_focus": ["Evidence"],
        }
    ]
    if include_judge:
        responses.append(
            {
                "scores": [
                    {
                        "rubricId": "quality",
                        "score": 4,
                        "evidence": "The question fits the supplied context.",
                    }
                ]
            }
        )
    return FakeLLMProvider(
        responses,
        usage=LLMUsage(input_tokens=4, output_tokens=6),
    )


def test_cli_agent_filter_and_success_exit_zero(monkeypatch, tmp_path) -> None:
    _configure_env(monkeypatch)
    input_model = _write_case(tmp_path / "case.json")
    monkeypatch.setattr(
        eval_module,
        "build_llm_provider",
        lambda _settings: _provider(input_model),
    )

    result = CliRunner().invoke(
        app,
        [
            "eval",
            "run",
            "--agent",
            "question-generator",
            "--cases-dir",
            str(tmp_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "PASS cli.question" in result.output
    assert "Summary: 1/1 passed" in result.output


def test_cli_failed_case_exits_one(monkeypatch, tmp_path) -> None:
    _configure_env(monkeypatch)
    input_model = _write_case(tmp_path / "case.json", expected="wrong")
    monkeypatch.setattr(
        eval_module,
        "build_llm_provider",
        lambda _settings: _provider(input_model),
    )

    result = CliRunner().invoke(app, ["eval", "run", "--cases-dir", str(tmp_path)])

    assert result.exit_code == 1
    assert "FAIL cli.question" in result.output
    assert "Summary: 0/1 passed" in result.output


def test_cli_writes_stable_json_output(monkeypatch, tmp_path) -> None:
    _configure_env(monkeypatch)
    input_model = _write_case(tmp_path / "case.json")
    output_path = tmp_path / "result.json"
    monkeypatch.setattr(
        eval_module,
        "build_llm_provider",
        lambda _settings: _provider(input_model),
    )

    result = CliRunner().invoke(
        app,
        [
            "eval",
            "run",
            "--cases-dir",
            str(tmp_path),
            "--json-output",
            str(output_path),
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(output_path.read_text())
    assert payload["agentId"] == "all"
    assert payload["inputTokens"] == 4
    assert payload["outputTokens"] == 6
    assert payload["cases"][0]["caseId"] == "cli.question"


def test_cli_uses_optional_judge_model_and_prints_quality(
    monkeypatch, tmp_path
) -> None:
    _configure_env(monkeypatch)
    input_model = _write_case(tmp_path / "case.json", with_rubric=True)
    provider = _provider(input_model, include_judge=True)
    monkeypatch.setattr(
        eval_module,
        "build_llm_provider",
        lambda _settings: provider,
    )

    result = CliRunner().invoke(
        app,
        [
            "eval",
            "run",
            "--cases-dir",
            str(tmp_path),
            "--judge-model",
            "judge-model",
        ],
    )

    assert result.exit_code == 0, result.output
    assert "PASS cli.question quality=4.00/4" in result.output
    assert "average quality=4.00/4" in result.output
    assert provider.calls[0].model == "eval-model"
    assert provider.calls[1].model == "judge-model"


@pytest.mark.parametrize("missing", ["RIVA_LLM_PROVIDER", "RIVA_LLM_MODEL"])
def test_cli_missing_provider_or_model_is_clear(monkeypatch, tmp_path, missing) -> None:
    _configure_env(monkeypatch)
    monkeypatch.delenv(missing)

    result = CliRunner().invoke(app, ["eval", "run", "--cases-dir", str(tmp_path)])

    assert result.exit_code == 2
    assert "not configured" in result.output


def test_cli_rejects_invalid_cases_directory(monkeypatch, tmp_path) -> None:
    _configure_env(monkeypatch)
    missing_path = tmp_path / "missing"

    result = CliRunner().invoke(
        app,
        ["eval", "run", "--cases-dir", str(missing_path)],
    )

    assert result.exit_code != 0
    assert "does not exist" in result.output or "Invalid value" in result.output
