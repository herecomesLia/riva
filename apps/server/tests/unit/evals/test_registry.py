import pytest

from riva.evals.registry import (
    AgentEvalRegistration,
    AgentEvalRegistry,
    UnknownAgentError,
    build_default_registry,
)
from riva.prompts import (
    INTERVIEW_PLANNING_PROMPT,
    INTERVIEW_REVIEW_PROMPT,
    INTERVIEW_TURN_PROMPT,
    PRACTICE_EVALUATION_PROMPT,
    PRACTICE_RECOMMENDATION_PROMPT,
    PRACTICE_REVIEW_PROMPT,
    QUESTION_GENERATION_PROMPT,
)
from riva.schemas.evaluation import EvaluationInput
from riva.schemas.interview_planning import InterviewPlanningInput
from riva.schemas.interview_review import InterviewReviewInput
from riva.schemas.interview_turn import InterviewTurnInput
from riva.schemas.practice_recommendation import PracticeRecommendationInput
from riva.schemas.practice_review import PracticeReviewInput
from riva.schemas.question_generation import QuestionGenerationInput


def test_default_registry_contains_all_canonical_agents() -> None:
    registry = build_default_registry()

    expected = {
        "question-generator": (QuestionGenerationInput, QUESTION_GENERATION_PROMPT),
        "interview-turn": (InterviewTurnInput, INTERVIEW_TURN_PROMPT),
        "practice-evaluator": (EvaluationInput, PRACTICE_EVALUATION_PROMPT),
        "practice-reviewer": (PracticeReviewInput, PRACTICE_REVIEW_PROMPT),
        "practice-recommender": (
            PracticeRecommendationInput,
            PRACTICE_RECOMMENDATION_PROMPT,
        ),
        "interview-planner": (InterviewPlanningInput, INTERVIEW_PLANNING_PROMPT),
        "interview-review": (InterviewReviewInput, INTERVIEW_REVIEW_PROMPT),
    }

    assert registry.agent_ids == tuple(sorted(expected))
    for agent_id, (input_schema, prompt) in expected.items():
        registration = registry.get(agent_id)
        assert registration.agent_id == agent_id
        assert registration.input_schema is input_schema
        assert registration.prompt_id == prompt.prompt_id
        assert registration.prompt_version == prompt.version


def test_registry_rejects_duplicate_and_unknown_agents() -> None:
    registration = AgentEvalRegistration(
        agent_id="custom",
        input_schema=QuestionGenerationInput,
        agent_factory=lambda _provider, _model: None,  # type: ignore[return-value]
        prompt_id="custom",
        prompt_version="1",
    )
    registry = AgentEvalRegistry([registration])

    with pytest.raises(ValueError, match="already exists"):
        registry.register(registration)
    with pytest.raises(UnknownAgentError, match="Unknown eval agent"):
        registry.get("missing")
