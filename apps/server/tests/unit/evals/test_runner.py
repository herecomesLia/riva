import asyncio

from riva.evals.models import AgentEvalCase
from riva.evals.quality_judge import AgentEvalQualityJudge
from riva.evals.registry import build_default_registry
from riva.evals.runner import AgentEvalRunner
from riva.integrations import LLMUsage
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.question import valid_question_generation_input


def _question_case(
    case_id: str,
    *,
    prompt_version: str = "3",
    assertions: list[dict[str, object]] | None = None,
    input_value: object | None = None,
    rubrics: list[dict[str, object]] | None = None,
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
            "rubrics": rubrics or [],
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


def test_runner_calls_quality_judge_and_aggregates_judge_tokens() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider(
        [
            _question_output(input_model),
            {
                "scores": [
                    {
                        "rubricId": "relevance",
                        "score": 3,
                        "evidence": "The question matches the requested context.",
                    },
                    {
                        "rubricId": "grounding",
                        "score": 4,
                        "evidence": "The output uses supplied profile evidence.",
                    },
                ]
            },
        ],
        usage=LLMUsage(input_tokens=11, output_tokens=7),
    )
    case = _question_case(
        "with-rubrics",
        rubrics=[
            {"id": "relevance", "criteria": "Fits the role."},
            {"id": "grounding", "criteria": "Uses supplied evidence."},
        ],
    )

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "target-model",
            build_default_registry(),
            quality_judge=AgentEvalQualityJudge(provider, "judge-model"),
        ).run_case(case)
    )

    assert result.passed is True
    assert [item.rubric_id for item in result.rubric_results] == [
        "relevance",
        "grounding",
    ]
    assert result.average_rubric_score == 3.5
    assert result.input_tokens == 22
    assert result.output_tokens == 14
    assert provider.calls[0].model == "target-model"
    assert provider.calls[1].model == "judge-model"


def test_rubric_below_min_score_fails_case_but_keeps_result() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider(
        [
            _question_output(input_model),
            {
                "scores": [
                    {
                        "rubricId": "grounding",
                        "score": 2,
                        "evidence": "The output misses the supplied evidence.",
                    }
                ]
            },
        ]
    )
    case = _question_case(
        "rubric-fail",
        rubrics=[
            {
                "id": "grounding",
                "criteria": "Uses supplied evidence.",
                "minScore": 3,
            }
        ],
    )

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "target-model",
            build_default_registry(),
            quality_judge=AgentEvalQualityJudge(provider, "judge-model"),
        ).run_case(case)
    )

    assert result.passed is False
    assert result.rubric_results[0].passed is False
    assert any(
        failure.startswith("rubric[grounding] score=2/3")
        for failure in result.failed_assertions
    )


def test_rubric_case_without_judge_fails_without_extra_provider_call() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider([_question_output(input_model)])
    case = _question_case(
        "missing-judge",
        rubrics=[{"id": "quality", "criteria": "Is high quality."}],
    )

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "target-model",
            build_default_registry(),
        ).run_case(case)
    )

    assert result.passed is False
    assert result.rubric_results == []
    assert result.average_rubric_score is None
    assert provider.calls and len(provider.calls) == 1


def test_quality_judge_exception_isolated_from_remaining_cases() -> None:
    input_model = valid_question_generation_input()
    provider = FakeLLMProvider(
        [
            _question_output(input_model),
            RuntimeError("judge unavailable"),
            _question_output(input_model),
        ]
    )
    cases = [
        _question_case(
            "a-judge-failure",
            rubrics=[{"id": "quality", "criteria": "Is high quality."}],
        ),
        _question_case("b-no-rubric"),
    ]

    result = asyncio.run(
        AgentEvalRunner(
            provider,
            "target-model",
            build_default_registry(),
            quality_judge=AgentEvalQualityJudge(provider, "judge-model"),
        ).run_cases(cases)
    )

    assert result.failed == 1
    assert result.passed == 1
    assert [item.case_id for item in result.cases] == [
        "a-judge-failure",
        "b-no-rubric",
    ]
