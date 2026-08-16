import pytest
from pydantic import ValidationError

from riva.schemas.interview_planning import (
    InterviewPlanningOutput,
    validate_interview_plan_for_duration,
)


def question(order: int, question_type: str = "projectDeepDive") -> dict[str, object]:
    return {
        "order": order,
        "questionType": question_type,
        "prompt": f"请介绍第 {order} 个真实项目中的一次关键决策。",
        "assessedCapabilities": [f"能力 {order}"],
        "objective": "确认候选人的真实贡献和结果证据。",
        "followUpDirections": ["后续可核实个人贡献和结果证据"],
        "scoringFocus": ["个人贡献", "结果证据"],
    }


def output(count: int) -> InterviewPlanningOutput:
    return InterviewPlanningOutput(
        totalMainQuestions=count,
        questions=[question(order) for order in range(1, count + 1)],
    )


@pytest.mark.parametrize(
    ("duration", "counts"),
    [(15, (2, 3)), (30, (3, 5)), (45, (5, 7))],
)
def test_duration_question_count_ranges(duration: int, counts: tuple[int, int]) -> None:
    for count in range(counts[0], counts[1] + 1):
        assert validate_interview_plan_for_duration(output(count), duration).total_main_questions == count


@pytest.mark.parametrize(
    ("duration", "count"),
    [(15, 4), (30, 2), (45, 4), (45, 8)],
)
def test_duration_question_count_is_enforced(duration: int, count: int) -> None:
    with pytest.raises(ValueError):
        validate_interview_plan_for_duration(output(count), duration)


def test_question_order_is_continuous_and_type_is_closed() -> None:
    invalid_order = [question(1), question(3)]
    with pytest.raises(ValidationError):
        InterviewPlanningOutput(totalMainQuestions=2, questions=invalid_order)

    with pytest.raises(ValidationError):
        InterviewPlanningOutput(
            totalMainQuestions=2,
            questions=[question(1, "questionCard"), question(2)],
        )


def test_plan_serializes_the_structured_contract_in_camel_case() -> None:
    payload = output(3).model_dump(mode="json", by_alias=True)

    assert payload["totalMainQuestions"] == 3
    assert payload["questions"][0]["questionType"] == "projectDeepDive"
    assert "followUpDirections" in payload["questions"][0]
