import asyncio

from riva.evals.models import AgentEvalCase
from riva.evals.registry import build_default_registry
from riva.evals.runner import AgentEvalRunner
from riva.integrations import LLMUsage
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.question_generation import valid_question_generation_input


def _question_case(
    case_id: str,
    *,
    prompt_version: str = "2",
    assertions: list[dict[str, object]] | None = None,
    input_value: object | None = None,
) -> AgentEvalCase:
    input_model = valid_question_generation_input()
    return AgentEvalCase.model_validate(
        {
            "id": case_id,
            "agentId": "question-generator",
            "promptVersion": prompt_version,
            "input": input_value
            if input_value is not None
            else input_model.model_dump(mode="json"),
            "assertions": assertions
            or [
                {
                    "operator": "exact",
                    "path": "/question_type",
                    "expected": "projectDeepDive",
                }
            ],
        }
    )


def _question_output(input_model) -> dict[str, object]:
    return {
        "prompt": "Describe the payment decision?",
        "question_type": input_model.question_type.value,
        "difficulty": input_model.difficulty.value,
        "assessed_capabilities": ["Ownership"],
        "recommended_materials": [],
        "answer_hints": ["Use evidence."],
        "answer_framework": ["Context", "Action"],
        "follow_up_directions": ["Probe details."],
        "scoring_focus": ["Evidence"],
    }


def test_runner_uses_real_agent_and_evaluates_assertions() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider(
        [_question_output(input_model)],
        usage=LLMUsage(input_tokens=11, output_tokens=7),
    )
    case = _question_case(
        "pass",
        assertions=[
            {
                "operator": "exact",
                "path": "/question_type",
                "expected": "projectDeepDive",
            },
            {
                "operator": "itemCount",
                "path": "/answer_framework",
                "min": 1,
            },
        ],
    )

    result = asyncio.run(
        AgentEvalRunner(provider, "test-model", build_default_registry()).run_case(case)
    )

    assert result.passed is True
    assert result.failed_assertions == []
    assert result.input_tokens == 11
    assert result.output_tokens == 7
    assert len(provider.calls) == 1


def test_runner_records_assertion_failure_without_stopping_case() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider([_question_output(input_model)])
    case = _question_case(
        "fail",
        assertions=[
            {"operator": "exact", "path": "/question_type", "expected": "wrong"},
            {"operator": "itemCount", "path": "/answer_framework", "min": 1},
        ],
    )

    result = asyncio.run(
        AgentEvalRunner(provider, "test-model", build_default_registry()).run_case(case)
    )

    assert result.passed is False
    assert len(result.failed_assertions) == 1


def test_prompt_version_mismatch_is_a_case_failure_without_provider_call() -> None:
    provider = FakeLLMProvider([])
    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "test-model",
            build_default_registry(),
        ).run_case(_question_case("old", prompt_version="1"))
    )

    assert result.passed is False
    assert "promptVersion mismatch" in result.failed_assertions[0]
    assert provider.calls == []


def test_schema_and_provider_errors_do_not_abort_a_batch() -> None:
    input_model = valid_question_generation_input()
    valid_output = _question_output(input_model)
    provider = FakeLLMProvider([RuntimeError("provider failed"), valid_output])
    cases = [
        _question_case("a-provider-error"),
        _question_case("b-valid"),
        _question_case("c-schema-error", input_value={}),
    ]

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "test-model",
            build_default_registry(),
        ).run_cases(cases)
    )

    assert [case.case_id for case in result.cases] == [
        "a-provider-error",
        "b-valid",
        "c-schema-error",
    ]
    assert result.passed == 1
    assert result.failed == 2
    assert result.input_tokens == 0
    assert len(provider.calls) == 2


def test_batch_order_and_token_aggregation_are_deterministic() -> None:
    input_model = valid_question_generation_input()
    usage = LLMUsage(input_tokens=3, output_tokens=5)
    provider = FakeLLMProvider(
        [_question_output(input_model), _question_output(input_model)],
        usage=usage,
    )
    cases = [_question_case("z"), _question_case("a")]

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "test-model",
            build_default_registry(),
        ).run_cases(cases)
    )

    assert [case.case_id for case in result.cases] == ["a", "z"]
    assert result.total == 2
    assert result.passed == 2
    assert result.pass_rate == 1.0
    assert result.input_tokens == 6
    assert result.output_tokens == 10
