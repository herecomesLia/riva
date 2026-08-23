import asyncio
import json

import pytest

from riva.agents.training.planning import TrainingPlanningAgent
from riva.agents.training.planning_types import (
    TrainingPlanningInput,
    TrainingPlanningMockInterviewOutput,
    TrainingPlanningTargetedPracticeOutput,
)
from riva.integrations import InvalidStructuredOutputError, MessageRole
from tests.helpers.llm import FakeLLMProvider


def planning_input(
    *,
    targeted_constraints: dict[str, object] | None = None,
    mock_constraints: dict[str, object] | None = None,
) -> TrainingPlanningInput:
    targeted_constraints = targeted_constraints or {
        "questionTypes": ["projectDeepDive"],
        "difficulties": ["basic"],
        "canPrioritizeWeaknesses": True,
    }
    mock_constraints = mock_constraints or {
        "rounds": ["technical"],
        "difficulties": ["basic"],
        "durationMinutes": [15],
    }
    return TrainingPlanningInput.model_validate(
        {
            "interactionLanguage": "en",
            "targetRole": {
                "id": "00000000-0000-0000-0000-000000000301",
                "title": "Backend Engineer",
                "company": "Example Labs",
                "recruitmentType": "experienced",
                "location": "Remote",
            },
            "matchingAnalysis": {
                "overallMatchScore": 64,
                "matchedCapabilities": ["API design"],
                "missingCapabilities": ["project results"],
                "underrepresentedCapabilities": ["evidence"],
                "resumeGaps": ["missing outcome detail"],
                "highRiskQuestions": ["What was the result?"],
                "preparationRecommendations": ["explain result evidence"],
            },
            "trainingMemory": {
                "focusCompetencies": [],
                "establishedCompetencies": [],
            },
            "recentTraining": [],
            "constraints": {
                "targetedPractice": targeted_constraints,
                "mockInterview": mock_constraints,
            },
        }
    )


def targeted_output(**overrides: object) -> dict[str, object]:
    output: dict[str, object] = {
        "action": "targetedPractice",
        "reason": "Practice project results evidence from the current gap.",
        "focusAreas": ["project results"],
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "prioritizeWeaknesses": True,
    }
    output.update(overrides)
    return output


def mock_output(**overrides: object) -> dict[str, object]:
    output: dict[str, object] = {
        "action": "mockInterview",
        "reason": "Combine role capabilities and pressure response.",
        "focusAreas": ["risk control", "pressure response"],
        "round": "technical",
        "difficulty": "basic",
        "durationMinutes": 15,
    }
    output.update(overrides)
    return output


def test_prompt_marks_all_context_blocks_untrusted() -> None:
    input = planning_input()
    agent = TrainingPlanningAgent(
        FakeLLMProvider([targeted_output()]),
        model="test-training-planner-model",
    )

    asyncio.run(agent.run(input))
    request = agent.provider.calls[0]
    assert [message.role for message in request.messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]
    user_prompt = request.messages[1].content
    for block in (
        "TARGET_ROLE",
        "MATCHING_ANALYSIS",
        "TRAINING_MEMORY",
        "RECENT_TRAINING",
    ):
        assert f"BEGIN_UNTRUSTED_{block}" in user_prompt
        assert f"END_UNTRUSTED_{block}" in user_prompt
    assert "Allowed training constraints" in user_prompt
    assert "BEGIN_UNTRUSTED_CONSTRAINTS" not in user_prompt
    assert request.output_schema is not None

    values = agent.prompt_values(input)
    assert values["matching_analysis"] == json.dumps(
        input.matching_analysis.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def test_valid_targeted_practice_passes_contract_and_uses_canonical_metadata() -> None:
    provider = FakeLLMProvider([targeted_output()])
    agent = TrainingPlanningAgent(provider, model="test-training-planner-model")

    result = asyncio.run(agent.run(planning_input()))

    assert isinstance(result.output, TrainingPlanningTargetedPracticeOutput)
    assert result.agent_id == "training-planner"
    assert result.prompt_id == "training-planner"
    assert result.prompt_version == "1"
    assert result.output.question_type.value == "projectDeepDive"


def test_valid_mock_interview_passes_contract() -> None:
    provider = FakeLLMProvider([mock_output()])
    agent = TrainingPlanningAgent(provider, model="test-training-planner-model")

    result = asyncio.run(agent.run(planning_input()))

    assert isinstance(result.output, TrainingPlanningMockInterviewOutput)
    assert result.output.round.value == "technical"
    assert result.output.duration_minutes == 15


def test_unsupported_targeted_question_type_is_invalid_structured_output() -> None:
    provider = FakeLLMProvider([targeted_output(questionType="behavioral")])
    agent = TrainingPlanningAgent(provider, model="test-training-planner-model")

    with pytest.raises(InvalidStructuredOutputError) as raised:
        asyncio.run(agent.run(planning_input()))

    assert raised.value.diagnostics is not None
    assert raised.value.diagnostics.validation_errors[0].location == "question_type"


@pytest.mark.parametrize(
    ("field", "value", "constraints"),
    [
        (
            "round",
            "final",
            {
                "rounds": ["technical"],
                "difficulties": ["basic"],
                "durationMinutes": [15],
            },
        ),
        (
            "difficulty",
            "pressure",
            {
                "rounds": ["technical"],
                "difficulties": ["basic"],
                "durationMinutes": [15],
            },
        ),
        (
            "durationMinutes",
            30,
            {
                "rounds": ["technical"],
                "difficulties": ["basic"],
                "durationMinutes": [15],
            },
        ),
    ],
)
def test_unsupported_mock_interview_configuration_is_rejected(
    field: str,
    value: object,
    constraints: dict[str, object],
) -> None:
    provider = FakeLLMProvider([mock_output(**{field: value})])
    agent = TrainingPlanningAgent(
        provider,
        model="test-training-planner-model",
    )

    with pytest.raises(InvalidStructuredOutputError):
        asyncio.run(
            agent.run(
                planning_input(mock_constraints=constraints),
            )
        )


def test_weakness_prioritization_is_rejected_when_disabled() -> None:
    provider = FakeLLMProvider([targeted_output(prioritizeWeaknesses=True)])
    agent = TrainingPlanningAgent(provider, model="test-training-planner-model")
    input = planning_input(
        targeted_constraints={
            "questionTypes": ["projectDeepDive"],
            "difficulties": ["basic"],
            "canPrioritizeWeaknesses": False,
        }
    )

    with pytest.raises(InvalidStructuredOutputError) as raised:
        asyncio.run(agent.run(input))

    assert raised.value.diagnostics is not None
    assert raised.value.diagnostics.validation_errors[0].location == (
        "prioritize_weaknesses"
    )


def test_unavailable_training_mode_is_rejected_as_invalid_structured_output() -> None:
    provider = FakeLLMProvider([targeted_output()])
    agent = TrainingPlanningAgent(provider, model="test-training-planner-model")
    input = planning_input()
    input.constraints.targeted_practice = None

    with pytest.raises(InvalidStructuredOutputError) as raised:
        asyncio.run(agent.run(input))

    assert raised.value.diagnostics is not None
    assert raised.value.diagnostics.validation_errors[0].location == ("action")
