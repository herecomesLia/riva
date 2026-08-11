import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from pydantic import BaseModel
import pytest

from riva.agents import AgentResult, FollowUpAgent
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMUsage,
    ProviderUnavailableError,
)
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import FOLLOW_UP_PROMPT
from riva.schemas.follow_up import (
    FollowUpCompleteOutput,
    FollowUpGenerationOutput,
    FollowUpInput,
    FollowUpQuestionOutput,
)
from riva.services.follow_up_generation import FollowUpGenerationStateError
from riva.workers import AgentExecutionError, FollowUpHandler
from riva.workers.follow_up import FollowUpGenerationServiceFactory
from riva.workers.runtime import SessionFactory


NOW = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


class OtherOutput(BaseModel):
    value: str


def follow_up_input() -> FollowUpInput:
    return FollowUpInput(
        interaction_language="en",
        question={
            "prompt": "Tell me about the result.",
            "question_type": "behavioral",
            "difficulty": "basic",
            "assessed_capabilities": ["Ownership"],
            "follow_up_directions": ["Attribution"],
            "scoring_focus": ["Evidence"],
        },
        main_answer={"content": "I reduced failures.", "order": 1},
        previous_follow_ups=[],
        next_follow_up_order=1,
    )


def output(*, prompt: str = "What metric improved?") -> FollowUpQuestionOutput:
    return FollowUpQuestionOutput(
        action="askFollowUp",
        prompt=prompt,
        focus="Attribution",
        answer_hints=["Name the metric."],
        answer_framework=["Baseline", "Result"],
    )


def result(
    *,
    output_value: object | None = None,
    agent_id: str = "follow-up-generator",
    prompt_id: str = "follow-up-generator",
    prompt_version: str = "1",
) -> AgentResult[FollowUpGenerationOutput]:
    return AgentResult(
        output=cast(
            FollowUpGenerationOutput,
            output_value if output_value is not None else output(),
        ),
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        provider="fake",
        model="test-model",
        usage=LLMUsage(input_tokens=4, output_tokens=3),
    )


def running_run() -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="follow-up-generator",
        prompt_id=FOLLOW_UP_PROMPT.prompt_id,
        prompt_version=FOLLOW_UP_PROMPT.version,
        output_schema_id=FOLLOW_UP_PROMPT.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload={
            "attemptId": str(uuid4()),
            "questionCardId": str(uuid4()),
            "mainAnswerId": str(uuid4()),
            "interactionLanguage": "en",
            "nextFollowUpOrder": 1,
            "previousFollowUpQuestionId": None,
            "previousFollowUpAnswerId": None,
        },
        idempotency_key="follow-up-worker-test",
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
        self.persisted: list[FollowUpGenerationOutput] = []
        self.canonical: FollowUpGenerationOutput | None = None


class FakeGenerationService:
    def __init__(self, state: State) -> None:
        self.state = state

    async def load_generation_input(self, run: AgentRun) -> FollowUpInput:
        if self.state.load_error is not None:
            raise self.state.load_error
        return follow_up_input()

    async def persist_success(
        self,
        run: AgentRun,
        value: FollowUpGenerationOutput,
    ) -> FollowUpGenerationOutput:
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted.append(value)
        return self.state.canonical or value


class FakeAgent:
    agent_id = "follow-up-generator"

    def __init__(self, sessions: FakeSessionFactory, response: object) -> None:
        self.sessions = sessions
        self.response = response
        self.inputs: list[FollowUpInput] = []

    async def run(
        self,
        value: FollowUpInput,
    ) -> AgentResult[FollowUpGenerationOutput]:
        assert self.sessions.active == 0
        self.inputs.append(value)
        if isinstance(self.response, Exception):
            raise self.response
        return cast(AgentResult[FollowUpGenerationOutput], self.response)


def make_handler(
    sessions: FakeSessionFactory,
    state: State,
    agent: FakeAgent,
) -> FollowUpHandler:
    return FollowUpHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(FollowUpAgent, agent),
        generation_service_factory=cast(
            FollowUpGenerationServiceFactory,
            lambda _session: FakeGenerationService(state),
        ),
    )


def test_handler_persists_and_returns_canonical_output() -> None:
    sessions = FakeSessionFactory()
    state = State()
    first = output(prompt="Canonical question")
    state.canonical = first
    later = output(prompt="Different retry question")
    agent_result = result(output_value=later)
    agent = FakeAgent(sessions, agent_result)

    returned = asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert returned.output == first
    assert returned.provider == agent_result.provider
    assert state.persisted == [later]
    assert sessions.active == 0


def test_handler_accepts_complete_output() -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(
        sessions,
        result(output_value=FollowUpCompleteOutput(action="complete")),
    )

    returned = asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert returned.output == FollowUpCompleteOutput(action="complete")


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

    assert exc_info.value.code == "invalid_follow_up_generation_run"
    assert exc_info.value.retryable is False
    assert sessions.created == 0


def test_handler_maps_context_errors_to_non_retryable_execution_error() -> None:
    sessions = FakeSessionFactory()
    state = State()
    state.load_error = FollowUpGenerationStateError(
        "follow_up_main_answer_not_ready"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "follow_up_main_answer_not_ready"
    assert exc_info.value.retryable is False
    assert exc_info.value.__cause__ is None


@pytest.mark.parametrize(
    "provider_error",
    [ProviderUnavailableError(), InvalidStructuredOutputError()],
)
def test_handler_preserves_provider_retry_errors(provider_error: Exception) -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, provider_error)

    with pytest.raises(type(provider_error)) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value is provider_error
    assert state.persisted == []


@pytest.mark.parametrize(
    "bad_result",
    [
        result(agent_id="other-agent"),
        result(prompt_id="other-prompt"),
        result(prompt_version="2"),
        result(output_value=OtherOutput(value="wrong schema")),
    ],
)
def test_handler_rejects_result_metadata_or_schema_mismatch(
    bad_result: AgentResult[FollowUpGenerationOutput],
) -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, bad_result)

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(make_handler(sessions, state, agent).execute(running_run()))

    assert exc_info.value.code == "agent_run_result_mismatch"
    assert exc_info.value.retryable is False
    assert state.persisted == []


def test_handler_requires_follow_up_agent_identity() -> None:
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, result())
    agent.agent_id = "other-agent"

    with pytest.raises(ValueError, match="follow-up generation agent"):
        make_handler(sessions, state, agent)
