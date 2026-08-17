import pytest
from pydantic import ValidationError

from riva.evals.models import (
    AgentEvalCase,
    AgentEvalCaseResult,
    AgentEvalRubric,
)


def _case(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": "case-1",
        "agentId": "question-generator",
        "promptVersion": "3",
        "input": {"value": 3},
        "assertions": [
            {"operator": "exact", "path": "/value", "expected": 3},
            {"operator": "contains", "path": "/items", "expected": "x"},
            {
                "operator": "containsAll",
                "path": "/items",
                "expected": ["x", "y"],
            },
            {
                "operator": "notContains",
                "path": "/items",
                "forbidden": ["z"],
            },
            {"operator": "itemCount", "path": "/items", "min": 1, "max": 3},
            {"operator": "numberRange", "path": "/value", "min": 0, "max": 10},
        ],
    }
    value.update(overrides)
    return value


def test_case_and_assertions_use_strict_wire_schema() -> None:
    case = AgentEvalCase.model_validate(_case())

    assert case.agent_id == "question-generator"
    assert case.prompt_version == "3"
    assert case.tags == []
    assert [assertion.operator for assertion in case.assertions] == [
        "exact",
        "contains",
        "containsAll",
        "notContains",
        "itemCount",
        "numberRange",
    ]
    assert case.model_dump(mode="json", by_alias=True)["agentId"] == (
        "question-generator"
    )


def test_rubric_defaults_and_unique_ids() -> None:
    case = AgentEvalCase.model_validate(
        _case(
            rubrics=[
                {"id": "grounding", "criteria": "Uses supplied evidence."},
                {
                    "id": "fit",
                    "criteria": "Fits the requested task.",
                    "minScore": 4,
                },
            ]
        )
    )

    assert case.rubrics[0].min_score == 3
    assert case.rubrics[1].min_score == 4
    assert case.model_dump(mode="json", by_alias=True)["rubrics"][0] == {
        "id": "grounding",
        "criteria": "Uses supplied evidence.",
        "minScore": 3,
    }

    with pytest.raises(ValidationError, match="unique ids"):
        AgentEvalCase.model_validate(
            _case(
                rubrics=[
                    {"id": "same", "criteria": "A"},
                    {"id": "same", "criteria": "B"},
                ]
            )
        )


def test_rubric_result_and_average_are_strict_and_bounded() -> None:
    result = AgentEvalCaseResult.model_validate(
        {
            "caseId": "case-1",
            "agentId": "question-generator",
            "promptVersion": "2",
            "passed": True,
            "rubricResults": [
                {
                    "rubricId": "grounding",
                    "score": 4,
                    "passed": True,
                    "evidence": "Uses the supplied context.",
                }
            ],
            "averageRubricScore": 4.0,
        }
    )
    assert result.rubric_results[0].rubric_id == "grounding"

    with pytest.raises(ValidationError):
        AgentEvalRubric.model_validate(
            {"id": "", "criteria": "criterion"}
        )
    with pytest.raises(ValidationError):
        AgentEvalCaseResult.model_validate(
            {
                "caseId": "case-1",
                "agentId": "agent",
                "promptVersion": "1",
                "passed": True,
                "averageRubricScore": 5,
            }
        )


@pytest.mark.parametrize("path", ["value", "$.value", "/value~2"])
def test_assertion_path_must_be_a_simple_json_pointer(path: str) -> None:
    with pytest.raises(ValidationError):
        AgentEvalCase.model_validate(
            _case(assertions=[{"operator": "exact", "path": path, "expected": 3}])
        )


def test_unknown_operator_and_extra_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        AgentEvalCase.model_validate(
            _case(
                assertions=[
                    {"operator": "python", "path": "/value", "expected": 3}
                ]
            )
        )

    with pytest.raises(ValidationError):
        AgentEvalCase.model_validate(_case(unexpected=True))

    with pytest.raises(ValidationError):
        AgentEvalCase.model_validate(
            _case(
                assertions=[
                    {
                        "operator": "exact",
                        "path": "/value",
                        "expected": 3,
                        "expression": "value + 1",
                    }
                ]
            )
        )


def test_count_and_range_require_a_valid_bound() -> None:
    for assertion in (
        {"operator": "itemCount", "path": "/items"},
        {"operator": "itemCount", "path": "/items", "min": 3, "max": 1},
        {"operator": "numberRange", "path": "/value"},
        {"operator": "numberRange", "path": "/value", "min": 3, "max": 1},
    ):
        with pytest.raises(ValidationError):
            AgentEvalCase.model_validate(_case(assertions=[assertion]))
