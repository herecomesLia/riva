import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from pydantic import BaseModel
import pytest

from riva.agents import AgentResult, PracticeEvaluationAgent
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMUsage,
    ProviderUnavailableError,
)
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.schemas.evaluation import (
    EvaluationInput,
    PracticeEvaluationOutput,
)
from riva.services.evaluation_generation import EvaluationGenerationStateError
from riva.workers import AgentExecutionError, PracticeEvaluationHandler
from riva.workers.practice_evaluation import EvaluationGenerationServiceFactory
from riva.workers.runtime import SessionFactory


NOW = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


class OtherOutput(BaseModel):
    value: str


def evaluation_input() -> EvaluationInput:
    return EvaluationInput.model_validate(
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
        }
    )


def evaluation_output(*, score: int = 80) -> PracticeEvaluationOutput:
    return PracticeEvaluationOutput.model_validate(
        {
            "overallScore": score,
            "dimensionScores": [
                {
                    "dimension": dimension,
                    "score": score,
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
        }
    )


def running_run() -> AgentRun:
    ids = [uuid4() for _ in range(5)]
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="practice-evaluator",
        prompt_id=PRACTICE_EVALUATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_EVALUATION_PROMPT.version,
        output_schema_id=PRACTICE_EVALUATION_PROMPT.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload={
            "attemptId": str(ids[0]),
            "questionCardId": str(ids[1]),
            "mainAnswerId": str(ids[2]),
            "interactionLanguage": "en",
            "followUpCompletionReason": "noFollowUpRequired",
            "terminalFollowUpDecisionId": str(ids[3]),
        },
        idempotency_key="practice-evaluation-worker-test",
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
        self.persisted: list[PracticeEvaluationOutput] = []
        self.canonical: PracticeEvaluationOutput | None = None


class FakeGenerationService:
    def __init__(self, state: State) -> None:
        self.state = state

    async def load_generation_input(self, run: AgentRun) -> EvaluationInput:
        if self.state.load_error is not None:
            raise self.state.load_error
        return evaluation_input()

    async def persist_success(
        self,
        run: AgentRun,
        value: PracticeEvaluationOutput,
    ) -> PracticeEvaluationOutput:
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted.append(value)
        return self.state.canonical or value


class FakeAgent:
    agent_id = "practice-evaluator"

    def __init__(self, sessions: FakeSessionFactory, response: object) -> None:
        self.sessions = sessions
        self.response = response
        self.inputs: list[EvaluationInput] = []

    async def run(
        self,
        value: EvaluationInput,
    ) -> AgentResult[PracticeEvaluationOutput]:
        assert self.sessions.active == 0
        self.inputs.append(value)
        if isinstance(self.response, Exception):
            raise self.response
        return cast(AgentResult[PracticeEvaluationOutput], self.response)


def result(
    *,
    output_value: object | None = None,
    agent_id: str = "practice-evaluator",
    prompt_id: str = PRACTICE_EVALUATION_PROMPT.prompt_id,
    prompt_version: str = PRACTICE_EVALUATION_PROMPT.version,
) -> AgentResult[PracticeEvaluationOutput]:
    return AgentResult(
        output=cast(
            PracticeEvaluationOutput,
            output_value if output_value is not None else evaluation_output(),
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
) -> PracticeEvaluationHandler:
    return PracticeEvaluationHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(PracticeEvaluationAgent, agent),
        generation_service_factory=cast(
            EvaluationGenerationServiceFactory,
            lambda _session: FakeGenerationService(state),
        ),
    )


def test_handler_persists_and_returns_canonical_output() -> None:
    sessions = FakeSessionFactory()
    state = State()
    canonical = evaluation_output(score=61)
    state.canonical = canonical
    agent_result = result(output_value=evaluation_output(score=82))
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

    assert exc_info.value.code == "invalid_practice_evaluation_run"
    assert exc_info.value.retryable is False
    assert sessions.created == 0


def test_handler_maps_state_errors_to_non_retryable_execution_error() -> None:
    sessions = FakeSessionFactory()
    state = State()
    state.load_error = EvaluationGenerationStateError(
        "practice_evaluation_main_answer_not_ready"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "practice_evaluation_main_answer_not_ready"
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


def test_handler_requires_the_practice_evaluation_agent_identity() -> None:
    class WrongAgent:
        agent_id = "follow-up-generator"

    with pytest.raises(ValueError, match="practice evaluation"):
        PracticeEvaluationHandler(
            session_factory=cast(SessionFactory, FakeSessionFactory()),
            agent=cast(PracticeEvaluationAgent, WrongAgent()),
        )


def test_handler_maps_persistence_state_errors_to_non_retryable_execution_error(
) -> None:
    sessions = FakeSessionFactory()
    state = State()
    state.persist_error = EvaluationGenerationStateError(
        "practice_evaluation_artifact_conflict"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "practice_evaluation_artifact_conflict"
    assert exc_info.value.retryable is False
