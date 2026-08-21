import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel

from riva.agents import AgentResult, QuestionGenerationAgent
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMProviderConfigurationError,
    LLMUsage,
    ProviderRateLimitedError,
    ProviderUnavailableError,
)
from riva.models import AgentRun, AgentRunStatus, QuestionCard
from riva.schemas.question_generation import (
    QuestionGenerationInput,
    QuestionGenerationOutput,
)
from riva.services.question_generation import QuestionGenerationStateError
from riva.services.question_generation_prompt_versions import (
    get_question_generation_prompt,
)
from riva.workers import AgentExecutionError, QuestionGenerationHandler
from riva.workers.question_generation import QuestionGenerationServiceFactory
from riva.workers.runtime import SessionFactory
from tests.helpers.question_generation import (
    valid_question_generation_input,
    valid_question_generation_output,
)


class OtherOutput(BaseModel):
    value: str


def output() -> QuestionGenerationOutput:
    input = valid_question_generation_input()
    return QuestionGenerationOutput.model_validate(
        valid_question_generation_output(input)
    )


def agent_result(
    *,
    agent_id: str = "question-generator",
    prompt_id: str = "question-generator",
    prompt_version: str = "1",
    result_output: BaseModel | None = None,
) -> AgentResult[BaseModel]:
    return AgentResult(
        output=result_output or output(),
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        provider="fake",
        model="test-model",
        usage=LLMUsage(input_tokens=10, output_tokens=5),
    )


def running_agent_run() -> AgentRun:
    now = datetime(2026, 8, 10, 8, tzinfo=UTC)
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="question-generator",
        prompt_id="question-generator",
        prompt_version="1",
        output_schema_id="question-generation-v1",
        status=AgentRunStatus.RUNNING,
        payload={
            "roleId": str(uuid4()),
            "profileId": str(uuid4()),
            "profileVersion": 1,
            "jobDescriptionVersion": 1,
            "jobDescriptionAnalysisVersion": 1,
            "matchingAnalysisRunId": str(uuid4()),
            "interactionLanguage": "zh-CN",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
        },
        idempotency_key="question-generation-test",
        attempt_count=1,
        max_attempts=3,
        available_at=now,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=now,
        started_at=now,
        model="test-model",
    )


def question_card_for(
    run: AgentRun,
    result_output: QuestionGenerationOutput,
) -> QuestionCard:
    values = result_output.model_dump(mode="json")
    payload = run.payload
    return QuestionCard(
        id=uuid4(),
        user_id=run.user_id,
        target_role_id=UUID(cast(str, payload["roleId"])),
        profile_id=UUID(cast(str, payload["profileId"])),
        source_agent_run_id=run.id,
        matching_analysis_run_id=UUID(cast(str, payload["matchingAnalysisRunId"])),
        language=cast(str, payload["interactionLanguage"]),
        question_type=cast(str, values["question_type"]),
        difficulty=cast(str, values["difficulty"]),
        prompt=cast(str, values["prompt"]),
        assessed_capabilities=cast(list[str], values["assessed_capabilities"]),
        recommended_materials=cast(
            list[dict[str, object]], values["recommended_materials"]
        ),
        answer_hints=cast(list[str], values["answer_hints"]),
        answer_framework=cast(list[str], values["answer_framework"]),
        follow_up_directions=cast(list[str], values["follow_up_directions"]),
        scoring_focus=cast(list[str], values["scoring_focus"]),
        profile_version=cast(int, payload["profileVersion"]),
        job_description_version=cast(int, payload["jobDescriptionVersion"]),
        job_description_analysis_version=cast(
            int, payload["jobDescriptionAnalysisVersion"]
        ),
        is_saved=False,
        is_marked_weak=False,
    )


class FakeSession:
    def __init__(self, identifier: int) -> None:
        self.identifier = identifier


class FakeSessionContext:
    def __init__(self, factory: "FakeSessionFactory", session: FakeSession) -> None:
        self.factory = factory
        self.session = session

    async def __aenter__(self) -> FakeSession:
        self.factory.active += 1
        self.factory.entered.append(self.session.identifier)
        return self.session

    async def __aexit__(self, *args: object) -> None:
        self.factory.active -= 1
        self.factory.exited.append(self.session.identifier)


class FakeSessionFactory:
    def __init__(self) -> None:
        self.active = 0
        self.created = 0
        self.entered: list[int] = []
        self.exited: list[int] = []

    def __call__(self) -> FakeSessionContext:
        self.created += 1
        return FakeSessionContext(self, FakeSession(self.created))


class GenerationState:
    def __init__(self, sessions: FakeSessionFactory) -> None:
        self.sessions = sessions
        self.load_error: Exception | None = None
        self.persist_error: Exception | None = None
        self.load_sessions: list[int] = []
        self.persist_sessions: list[int] = []
        self.persisted_outputs: list[QuestionGenerationOutput] = []
        self.persisted_card: QuestionCard | None = None


class FakeGenerationService:
    def __init__(self, session: FakeSession, state: GenerationState) -> None:
        self.session = session
        self.state = state

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> QuestionGenerationInput:
        assert self.state.sessions.active == 1
        self.state.load_sessions.append(self.session.identifier)
        if self.state.load_error is not None:
            raise self.state.load_error
        return valid_question_generation_input()

    async def persist_success(
        self,
        run: AgentRun,
        result_output: QuestionGenerationOutput,
    ) -> QuestionCard:
        assert self.state.sessions.active == 1
        self.state.persist_sessions.append(self.session.identifier)
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted_outputs.append(result_output)
        if self.state.persisted_card is None:
            self.state.persisted_card = question_card_for(run, result_output)
        return self.state.persisted_card


class FakeAgent:
    agent_id = "question-generator"

    def __init__(
        self,
        sessions: FakeSessionFactory,
        response: AgentResult[BaseModel] | Exception,
        *,
        prompt_version: str = "1",
    ) -> None:
        self.sessions = sessions
        self.response = response
        self.prompt_id = "question-generator"
        self.prompt_version = prompt_version
        self.prompt = get_question_generation_prompt(prompt_version)
        self.inputs: list[QuestionGenerationInput] = []

    async def run(
        self,
        value: QuestionGenerationInput,
    ) -> AgentResult[BaseModel]:
        assert self.sessions.active == 0
        self.inputs.append(value)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def handler(
    sessions: FakeSessionFactory,
    state: GenerationState,
    agent: FakeAgent,
    *,
    legacy_agent: FakeAgent | None = None,
) -> QuestionGenerationHandler:
    return QuestionGenerationHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(QuestionGenerationAgent, agent),
        legacy_agent=cast(QuestionGenerationAgent | None, legacy_agent),
        generation_service_factory=cast(
            QuestionGenerationServiceFactory,
            lambda session: FakeGenerationService(
                cast(FakeSession, session),
                state,
            ),
        ),
    )


def test_handler_routes_v1_and_v2_runs_to_matching_agents() -> None:
    async def run_test() -> None:
        sessions = FakeSessionFactory()
        state = GenerationState(sessions)
        legacy = FakeAgent(
            sessions,
            agent_result(prompt_version="1"),
            prompt_version="1",
        )
        current = FakeAgent(
            sessions,
            agent_result(prompt_version="2"),
            prompt_version="2",
        )
        current_run = running_agent_run()
        current_run.prompt_version = "2"

        await handler(
            sessions,
            state,
            current,
            legacy_agent=legacy,
        ).execute(running_agent_run())
        await handler(
            sessions,
            state,
            current,
            legacy_agent=legacy,
        ).execute(current_run)

        assert len(legacy.inputs) == 1
        assert len(current.inputs) == 1

    asyncio.run(run_test())


def test_handler_routes_v3_run_to_current_agent() -> None:
    async def run_test() -> None:
        sessions = FakeSessionFactory()
        state = GenerationState(sessions)
        current = FakeAgent(
            sessions,
            agent_result(prompt_version="3"),
            prompt_version="3",
        )
        run = running_agent_run()
        run.prompt_version = "3"

        await handler(sessions, state, current).execute(run)

        assert len(current.inputs) == 1

    asyncio.run(run_test())


def test_handler_rejects_unsupported_prompt_version_as_non_retryable() -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    run = running_agent_run()
    run.prompt_version = "99"
    current = FakeAgent(
        sessions,
        agent_result(prompt_version="2"),
        prompt_version="2",
    )

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(handler(sessions, state, current).execute(run))

    assert error.value.retryable is False
    assert sessions.created == 0


def test_handler_does_not_use_v2_agent_for_v1_run() -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    current = FakeAgent(
        sessions,
        agent_result(prompt_version="2"),
        prompt_version="2",
    )

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(handler(sessions, state, current).execute(running_agent_run()))

    assert error.value.retryable is False
    assert sessions.created == 0


def test_handler_loads_generates_persists_and_returns_result() -> None:
    async def run_test() -> None:
        sessions = FakeSessionFactory()
        state = GenerationState(sessions)
        expected = agent_result()
        agent = FakeAgent(sessions, expected)
        run = running_agent_run()

        result = await handler(sessions, state, agent).execute(run)

        assert result is expected
        assert len(agent.inputs) == 1
        assert agent.inputs[0].interaction_language == "zh-CN"
        assert agent.inputs[0].question_type.value == "projectDeepDive"
        assert agent.inputs[0].difficulty.value == "basic"
        assert state.load_sessions == [1]
        assert state.persist_sessions == [2]
        assert state.persisted_outputs == [expected.output]
        assert sessions.entered == [1, 2]
        assert sessions.exited == [1, 2]
        assert sessions.active == 0

    asyncio.run(run_test())


def test_handler_returns_existing_card_output_and_keeps_retry_metadata() -> None:
    async def run_test() -> None:
        sessions = FakeSessionFactory()
        state = GenerationState(sessions)
        run = running_agent_run()
        output_a = output()
        output_b = output().model_copy(
            update={"prompt": "Describe a completely different retry question."}
        )
        state.persisted_card = question_card_for(run, output_a)
        retry_result = agent_result(
            result_output=output_b,
        )
        retry_result = replace(
            retry_result,
            provider="retry-provider",
            model="retry-model",
            usage=LLMUsage(input_tokens=20, output_tokens=8),
        )

        result = await handler(
            sessions,
            state,
            FakeAgent(sessions, retry_result),
        ).execute(run)

        assert result.output == output_a
        assert result.output != output_b
        assert result.agent_id == retry_result.agent_id
        assert result.prompt_id == retry_result.prompt_id
        assert result.prompt_version == retry_result.prompt_version
        assert result.provider == retry_result.provider
        assert result.model == retry_result.model
        assert result.usage == retry_result.usage
        assert state.persisted_outputs == [output_b]

    asyncio.run(run_test())


def test_handler_requires_question_generation_agent_identity() -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    agent = FakeAgent(sessions, agent_result())
    agent.agent_id = "other-agent"

    with pytest.raises(ValueError, match="question generation agent"):
        handler(sessions, state, agent)


@pytest.mark.parametrize("invalid_field", ["status", "lease_token", "agent_id"])
def test_handler_rejects_invalid_run_before_opening_session(
    invalid_field: str,
) -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    agent = FakeAgent(sessions, agent_result())
    run = running_agent_run()
    if invalid_field == "status":
        run.status = AgentRunStatus.QUEUED
    elif invalid_field == "lease_token":
        run.lease_token = None
    else:
        run.agent_id = "other-agent"

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(run))

    assert exc_info.value.code == "invalid_question_generation_run"
    assert exc_info.value.retryable is False
    assert sessions.created == 0


@pytest.mark.parametrize("phase", ["load", "persist"])
def test_handler_maps_state_error_without_exception_chain(phase: str) -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    error = QuestionGenerationStateError("question_generation_matching_analysis_stale")
    if phase == "load":
        state.load_error = error
    else:
        state.persist_error = error
    agent = FakeAgent(sessions, agent_result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value.code == error.code
    assert exc_info.value.retryable is False
    assert exc_info.value.__cause__ is None


@pytest.mark.parametrize(
    "provider_error",
    [
        ProviderUnavailableError(),
        ProviderRateLimitedError(),
        InvalidStructuredOutputError(),
        LLMProviderConfigurationError(),
    ],
)
def test_handler_preserves_provider_errors(provider_error: Exception) -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    agent = FakeAgent(sessions, provider_error)

    with pytest.raises(type(provider_error)) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value is provider_error
    assert state.persist_sessions == []


@pytest.mark.parametrize(
    "mismatched_result",
    [
        agent_result(agent_id="other-agent"),
        agent_result(prompt_id="other-prompt"),
        agent_result(prompt_version="2"),
        agent_result(result_output=OtherOutput(value="wrong schema")),
    ],
)
def test_handler_rejects_result_mismatch_before_persist(
    mismatched_result: AgentResult[BaseModel],
) -> None:
    sessions = FakeSessionFactory()
    state = GenerationState(sessions)
    agent = FakeAgent(sessions, mismatched_result)

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value.code == "agent_run_result_mismatch"
    assert exc_info.value.retryable is False
    assert state.persist_sessions == []
