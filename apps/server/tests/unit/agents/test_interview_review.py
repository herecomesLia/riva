import asyncio
import json
from pathlib import Path

from riva.agents import InterviewReviewAgent
from riva.integrations import MessageRole
from riva.prompts import INTERVIEW_REVIEW_PROMPT
from riva.schemas.interview_review import InterviewReviewInput, InterviewReviewOutput
from riva.services.interview_review_prompt_versions import (
    get_interview_review_prompt,
)
from tests.helpers.llm import FakeLLMProvider

CASE_PATH = (
    Path(__file__).resolve().parents[3]
    / "evals"
    / "cases"
    / "interview-review"
    / "training_memory.json"
)


def review_input() -> InterviewReviewInput:
    case = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    return InterviewReviewInput.model_validate(case["input"])


def review_output() -> dict[str, object]:
    return {"overallPerformance": "The current artifacts are incomplete."}


def test_canonical_review_uses_training_memory_as_a_separate_v2_block() -> None:
    provider = FakeLLMProvider([review_output()])
    agent = InterviewReviewAgent(provider, model="test-interview-review-model")

    result = asyncio.run(agent.run(review_input()))

    assert result.agent_id == "interview-review"
    assert result.prompt_id == "interview-review"
    assert result.prompt_version == "2"
    assert isinstance(result.output, InterviewReviewOutput)
    assert provider.calls[0].output_schema is InterviewReviewOutput
    assert [message.role for message in provider.calls[0].messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]
    values = agent.prompt_values(review_input())
    assert "training_memory" in values
    assert "focusCompetencies" in str(values["training_memory"])
    rendered = agent.prompt.render(values)
    assert "<BEGIN_UNTRUSTED_TRAINING_MEMORY>" in rendered.user
    assert "level" in rendered.user


def test_v1_review_agent_keeps_the_legacy_prompt_shape() -> None:
    provider = FakeLLMProvider([review_output()])
    agent = InterviewReviewAgent(
        provider,
        model="test-interview-review-model",
        prompt=get_interview_review_prompt("1"),
    )

    result = asyncio.run(agent.run(review_input()))

    assert result.prompt_version == "1"
    values = agent.prompt_values(review_input())
    assert "training_memory" not in values
    rendered = agent.prompt.render(values)
    assert "<BEGIN_UNTRUSTED_TRAINING_MEMORY>" not in rendered.user
    assert agent.prompt is get_interview_review_prompt("1")


def test_review_prompt_identity_is_canonical() -> None:
    assert INTERVIEW_REVIEW_PROMPT.prompt_id == "interview-review"
    assert INTERVIEW_REVIEW_PROMPT.version == "2"
    assert INTERVIEW_REVIEW_PROMPT.output_schema_id == "interview-review-v1"
