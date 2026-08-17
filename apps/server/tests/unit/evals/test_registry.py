import pytest

from riva.evals.registry import (
    AgentEvalRegistration,
    AgentEvalRegistry,
    UnknownAgentError,
    build_default_registry,
)
from riva.prompts import INTERVIEW_TURN_PROMPT, QUESTION_GENERATION_PROMPT
from riva.schemas.interview_turn import InterviewTurnInput
from riva.schemas.question_generation import QuestionGenerationInput


def test_default_registry_contains_two_canonical_agents() -> None:
    registry = build_default_registry()

    assert registry.agent_ids == ("interview-turn", "question-generator")
    question = registry.get("question-generator")
    interview = registry.get("interview-turn")
    assert question.input_schema is QuestionGenerationInput
    assert question.prompt_id == QUESTION_GENERATION_PROMPT.prompt_id
    assert question.prompt_version == QUESTION_GENERATION_PROMPT.version
    assert interview.input_schema is InterviewTurnInput
    assert interview.prompt_id == INTERVIEW_TURN_PROMPT.prompt_id
    assert interview.prompt_version == INTERVIEW_TURN_PROMPT.version


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
