import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from pydantic import BaseModel

from riva.agents import AgentResult, PracticeReviewAgent
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMUsage,
    ProviderUnavailableError,
)
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import PRACTICE_REVIEW_PROMPT
from riva.schemas.practice_review import PracticeReviewInput, PracticeReviewOutput
from riva.services.review_generation import ReviewGenerationStateError
from riva.workers import AgentExecutionError, PracticeReviewHandler
from riva.workers.practice_review import ReviewGenerationServiceFactory
from riva.workers.runtime import SessionFactory

NOW = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


class OtherOutput(BaseModel):
    value: str


def review_input() -> PracticeReviewInput:
    return PracticeReviewInput.model_validate(
        {
            "interactionLanguage": "en",
            "question": {
                "prompt": "Tell me about the result.",
                "questionType": "behavioral",
                "difficulty": "basic",
                "assessedCapabilities": ["Ownership"],
                "scoringFocus": [],
            },
            "mainAnswer": {"content": "I owned the rollout."},
            "followUpExchanges": [],
            "followUpCompletionReason": "noFollowUpRequired",
            "evaluation": {
                "overallScore": 80,
                "dimensionScores": [
                    {
                        "dimension": dimension,
                        "score": 80,
                        "explanation": f"The answer supports {dimension}.",
                    }
                    for dimension in (
                        "relevance",
                        "structure",
                        "specificity",
                        "communication",
                    )
                ],
                "focusAssessments": [],
            },
        }
    )


def review_output(*, overall: str = "Canonical review") -> PracticeReviewOutput:
    return PracticeReviewOutput.model_validate(
        {
            "overallPerformance": overall,
            "highlights": ["Clear ownership"],
            "mainIssues": [],
            "improvementSuggestions": [],
            "reusableAnswerStructure": [],
            "exposedWeaknesses": [],
        }
    )


def running_run() -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="practice-reviewer",
        prompt_id=PRACTICE_REVIEW_PROMPT.prompt_id,
        prompt_version=PRACTICE_REVIEW_PROMPT.version,
        output_schema_id=PRACTICE_REVIEW_PROMPT.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload={
            "attemptId": str(uuid4()),
            "evaluationId": str(uuid4()),
            "interactionLanguage": "en",
        },
        idempotency_key="practice-review-worker-test",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=NOW,
        started_at=NOW,
        model="test-model",
    )


class FakeSession:
    pass


class FakeSessionContext:
    def __init__(self, factory: "FakeSessionFactory") -> None:
        self.factory = factory
        self.session = FakeSession()

    async def __aenter__(self) -> FakeSession:
        self.factory.active += 1
        return self.session

    async def __aexit__(self, *args: object) -> None:
        self.factory.active -= 1


class FakeSessionFactory:
    def __init__(self) -> None:
        self.active = 0
        self.created = 0

    def __call__(self) -> FakeSessionContext:
        self.created += 1
        return FakeSessionContext(self)


class State:
    def __init__(self) -> None:
        self.load_error: Exception | None = None
        self.persist_error: Exception | None = None
        self.persisted: list[PracticeReviewOutput] = []
        self.canonical: PracticeReviewOutput | None = None


class FakeGenerationService:
    def __init__(self, state: State) -> None:
        self.state = state

    async def load_generation_input(self, run: AgentRun) -> PracticeReviewInput:
        if self.state.load_error is not None:
            raise self.state.load_error
        return review_input()

    async def persist_success(
        self,
        run: AgentRun,
        value: PracticeReviewOutput,
    ) -> PracticeReviewOutput:
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted.append(value)
        return self.state.canonical or value


class FakeAgent:
    agent_id = "practice-reviewer"

    def __init__(self, sessions: FakeSessionFactory, response: object) -> None:
        self.sessions = sessions
        self.response = response
        self.inputs: list[PracticeReviewInput] = []

    async def run(
        self,
        value: PracticeReviewInput,
    ) -> AgentResult[PracticeReviewOutput]:
        assert self.sessions.active == 0
        self.inputs.append(value)
        if isinstance(self.response, Exception):
            raise self.response
        return cast(AgentResult[PracticeReviewOutput], self.response)


def result(
    *,
    output_value: object | None = None,
    agent_id: str = "practice-reviewer",
    prompt_id: str = PRACTICE_REVIEW_PROMPT.prompt_id,
    prompt_version: str = PRACTICE_REVIEW_PROMPT.version,
) -> AgentResult[PracticeReviewOutput]:
    return AgentResult(
        output=cast(
            PracticeReviewOutput,
            output_value if output_value is not None else review_output(),
        ),
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        provider="fake",
        model="test-model",
        usage=LLMUsage(input_tokens=4, output_tokens=3),
    )


def make_handler(
    sessions: FakeSessionFactory,
    state: State,
    agent: FakeAgent,
) -> PracticeReviewHandler:
    return PracticeReviewHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(PracticeReviewAgent, agent),
        generation_service_factory=cast(
            ReviewGenerationServiceFactory,
            lambda _session: FakeGenerationService(state),
        ),
    )


def test_handler_persists_and_returns_canonical_review() -> None:
    sessions = FakeSessionFactory()
    state = State()
    canonical = review_output(overall="FIRST")
    state.canonical = canonical
    agent_result = result(output_value=review_output(overall="SECOND"))
    agent = FakeAgent(sessions, agent_result)

    returned = asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert returned.output == canonical
    assert returned.provider == "fake"
    assert state.persisted == [agent_result.output]
    assert len(agent.inputs) == 1
    assert sessions.active == 0


@pytest.mark.parametrize("error_field", ["status", "lease_token", "agent_id"])
def test_handler_rejects_invalid_run_before_opening_session(error_field: str) -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, result())
    run = running_run()
    if error_field == "status":
        run.status = AgentRunStatus.QUEUED
    elif error_field == "lease_token":
        run.lease_token = None
    else:
        run.agent_id = "other-agent"

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert exc_info.value.code == "invalid_practice_review_run"
    assert exc_info.value.retryable is False
    assert sessions.created == 0


def test_handler_maps_state_errors_to_non_retryable_execution_error() -> None:
    sessions = FakeSessionFactory()
    state = State()
    state.load_error = ReviewGenerationStateError(
        "practice_review_evaluation_not_ready"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "practice_review_evaluation_not_ready"
    assert exc_info.value.retryable is False
    assert exc_info.value.__cause__ is None


@pytest.mark.parametrize(
    "provider_error",
    [ProviderUnavailableError(), InvalidStructuredOutputError()],
)
def test_handler_preserves_provider_errors_for_runtime_retry_policy(
    provider_error: Exception,
) -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, provider_error)

    with pytest.raises(type(provider_error)):
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))


@pytest.mark.parametrize(
    "result_kwargs",
    [
        {"agent_id": "other-agent"},
        {"prompt_id": "other-prompt"},
        {"prompt_version": "other-version"},
        {"output_value": OtherOutput(value="wrong schema")},
    ],
)
def test_handler_rejects_result_metadata_or_schema_mismatch(
    result_kwargs: dict[str, object],
) -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, result(**result_kwargs))  # type: ignore[arg-type]

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "agent_run_result_mismatch"
    assert exc_info.value.retryable is False
    assert state.persisted == []


def test_handler_requires_the_practice_review_agent_identity() -> None:
    class WrongAgent:
        agent_id = "practice-evaluator"

    with pytest.raises(ValueError, match="practice review"):
        PracticeReviewHandler(
            session_factory=cast(SessionFactory, FakeSessionFactory()),
            agent=cast(PracticeReviewAgent, WrongAgent()),
        )


def test_handler_maps_persistence_state_errors_to_non_retryable_execution_error() -> (
    None
):
    sessions = FakeSessionFactory()
    state = State()
    state.persist_error = ReviewGenerationStateError(
        "practice_review_artifact_conflict"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "practice_review_artifact_conflict"
    assert exc_info.value.retryable is False
