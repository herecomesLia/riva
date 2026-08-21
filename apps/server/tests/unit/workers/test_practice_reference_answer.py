import asyncio
from typing import cast

import pytest
from pydantic import BaseModel

from riva.agents import AgentResult, PracticeReferenceAnswerAgent
from riva.integrations import LLMUsage, ProviderUnavailableError
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import PRACTICE_REFERENCE_ANSWER_PROMPT
from riva.schemas.practice_reference_answer import (
    PracticeMainReferenceAnswerInput,
    PracticeMainReferenceAnswerOutput,
)
from riva.services.reference_answer_generation import (
    ReferenceAnswerGenerationStateError,
)
from riva.workers import AgentExecutionError, PracticeReferenceAnswerHandler
from riva.workers.practice_reference_answer import (
    ReferenceAnswerGenerationServiceFactory,
)
from riva.workers.runtime import SessionFactory
from tests.unit.services.test_reference_answer_generation import (
    main_graph,
    main_output,
    main_run,
)


class OtherOutput(BaseModel):
    value: str


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
        self.canonical: PracticeMainReferenceAnswerOutput | None = None
        self.persisted: list[object] = []


def reference_input() -> PracticeMainReferenceAnswerInput:
    _owner, card, _qg_run, context = main_graph()
    return PracticeMainReferenceAnswerInput.model_validate(
        {
            "targetType": "main",
            "interactionLanguage": card.language,
            "expectedKind": "personalizedExample",
            "targetRole": context.frozen_context["targetRole"],
            "question": {
                "prompt": card.prompt,
                "questionType": card.question_type,
                "difficulty": card.difficulty,
                "assessedCapabilities": card.assessed_capabilities,
                "answerFramework": card.answer_framework,
                "scoringFocus": card.scoring_focus,
                "recommendedMaterialIds": [],
            },
            "candidateEvidence": [],
        }
    )


class FakeGenerationService:
    def __init__(self, state: State) -> None:
        self.state = state

    async def load_generation_input(
        self,
        _run: AgentRun,
    ) -> PracticeMainReferenceAnswerInput:
        if self.state.load_error is not None:
            raise self.state.load_error
        return reference_input()

    async def persist_success(
        self,
        _run: AgentRun,
        output: object,
    ) -> object:
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted.append(output)
        return self.state.canonical or output


class FakeAgent:
    agent_id = "practice-reference-answer-generator"

    def __init__(self, sessions: FakeSessionFactory, response: object) -> None:
        self.sessions = sessions
        self.response = response
        self.inputs: list[object] = []

    async def run(self, input: object) -> AgentResult[object]:
        assert self.sessions.active == 0
        self.inputs.append(input)
        if isinstance(self.response, Exception):
            raise self.response
        return cast(AgentResult[object], self.response)


def result(
    *,
    output: object | None = None,
    agent_id: str = "practice-reference-answer-generator",
    prompt_id: str = PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
    prompt_version: str = PRACTICE_REFERENCE_ANSWER_PROMPT.version,
) -> AgentResult[object]:
    return AgentResult(
        output=output if output is not None else main_output(),
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        provider="fake",
        model="reference-test-model",
        usage=LLMUsage(input_tokens=4, output_tokens=3),
    )


def make_handler(
    sessions: FakeSessionFactory,
    state: State,
    agent: FakeAgent,
) -> PracticeReferenceAnswerHandler:
    return PracticeReferenceAnswerHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(PracticeReferenceAnswerAgent, agent),
        generation_service_factory=cast(
            ReferenceAnswerGenerationServiceFactory,
            lambda _session: FakeGenerationService(state),
        ),
    )


def test_handler_returns_canonical_replay_output() -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    sessions = FakeSessionFactory()
    state = State()
    state.canonical = main_output().model_copy(
        update={"answer": "Canonical persisted answer."}
    )
    agent = FakeAgent(sessions, result())

    returned = asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert returned.output == state.canonical
    assert state.persisted == [agent.response.output]
    assert len(agent.inputs) == 1
    assert sessions.active == 0


@pytest.mark.parametrize("field", ["status", "lease_token", "agent_id"])
def test_handler_rejects_invalid_lease_or_identity(field: str) -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    if field == "status":
        run.status = AgentRunStatus.QUEUED
    elif field == "lease_token":
        run.lease_token = None
    else:
        run.agent_id = "other-agent"
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert error.value.code == "invalid_practice_reference_answer_run"
    assert error.value.retryable is False
    assert sessions.created == 0


def test_handler_maps_state_errors_to_non_retryable() -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    sessions = FakeSessionFactory()
    state = State()
    state.load_error = ReferenceAnswerGenerationStateError(
        "reference_answer_context_conflict"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert error.value.code == "reference_answer_context_conflict"
    assert error.value.retryable is False


def test_handler_preserves_provider_errors() -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    sessions = FakeSessionFactory()
    agent = FakeAgent(sessions, ProviderUnavailableError())

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(make_handler(sessions, State(), agent).execute(run))


@pytest.mark.parametrize(
    "bad_result",
    [
        result(agent_id="other-agent"),
        result(prompt_id="other-prompt"),
        result(prompt_version="other-version"),
        result(output=OtherOutput(value="wrong schema")),
    ],
)
def test_handler_rejects_result_identity_or_schema_mismatch(bad_result) -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    sessions = FakeSessionFactory()
    state = State()
    agent = FakeAgent(sessions, bad_result)

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert error.value.code == "agent_run_result_mismatch"
    assert state.persisted == []


def test_handler_maps_persist_conflicts() -> None:
    owner, card, _qg_run, context = main_graph()
    run = main_run(owner, card, context)
    sessions = FakeSessionFactory()
    state = State()
    state.persist_error = ReferenceAnswerGenerationStateError(
        "reference_answer_artifact_conflict"
    )
    agent = FakeAgent(sessions, result())

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(make_handler(sessions, state, agent).execute(run))

    assert error.value.code == "reference_answer_artifact_conflict"
    assert error.value.retryable is False
