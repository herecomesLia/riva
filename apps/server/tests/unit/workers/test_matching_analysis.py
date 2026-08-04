import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from pydantic import BaseModel
import pytest

from riva.agents import AgentResult, MatchingAnalysisAgent
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMProviderConfigurationError,
    LLMUsage,
    ProviderRateLimitedError,
    ProviderUnavailableError,
)
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.matching_analysis import (
    MatchingAnalysisInput,
    MatchingAnalysisOutput,
)
from riva.services.matching_analyses import MatchingAnalysisStateError
from riva.workers import AgentExecutionError, MatchingAnalysisHandler
from riva.workers.matching_analysis import AnalysisServiceFactory
from riva.workers.runtime import SessionFactory


class OtherOutput(BaseModel):
    value: str


def output() -> MatchingAnalysisOutput:
    return MatchingAnalysisOutput(
        overall_match_score=87,
        core_requirements_summary="Build reliable APIs.",
        matched_capabilities=["Python"],
        missing_capabilities=["Kubernetes"],
        underrepresented_capabilities=["System design"],
        resume_highlights=["Improved reliability"],
        resume_gaps=["Scale is not stated"],
        high_risk_questions=["How did you improve reliability?"],
        preparation_recommendations=["Prepare the example."],
    )


def matching_input() -> MatchingAnalysisInput:
    return MatchingAnalysisInput.model_validate(
        {
            "career_profile": {
                "summary": "Backend engineer.",
                "education": [],
                "work_experiences": [],
                "project_experiences": [],
                "skills": ["Python"],
            },
            "job": {
                "role_title": "Backend Engineer",
                "company": "Riva",
                "job_description_analysis": {
                    "riva_summary": "Build reliable APIs.",
                    "responsibilities": ["Design APIs"],
                    "qualification_requirements": {
                        "education": [],
                        "graduation_cohorts": [],
                        "majors": [],
                        "experience": [],
                        "languages": [],
                        "certifications": [],
                        "other": [],
                    },
                    "required_skills": {
                        "programming_languages": ["Python"],
                        "frameworks_and_libraries": [],
                        "platforms": [],
                        "tools": [],
                        "concepts_and_methods": [],
                        "databases_and_middleware": [],
                        "other": [],
                    },
                    "preferred_qualifications": [],
                    "soft_skills": [],
                    "business_domains": [],
                },
            },
        }
    )


def agent_result(
    *,
    agent_id: str = "matching-analyzer",
    prompt_id: str = "matching-analyzer",
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
    now = datetime(2026, 7, 31, 8, tzinfo=UTC)
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="matching-analyzer",
        prompt_id="matching-analyzer",
        prompt_version="1",
        output_schema_id="matching-analysis-v1",
        status=AgentRunStatus.RUNNING,
        payload={
            "roleId": str(uuid4()),
            "profileId": str(uuid4()),
            "profileVersion": 1,
            "jobDescriptionVersion": 1,
            "jobDescriptionAnalysisVersion": 1,
        },
        idempotency_key="matching-test",
        attempt_count=1,
        max_attempts=3,
        available_at=now,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=now,
        started_at=now,
        model="test-model",
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


class AnalysisState:
    def __init__(self, sessions: FakeSessionFactory) -> None:
        self.sessions = sessions
        self.load_error: Exception | None = None
        self.persist_error: Exception | None = None
        self.load_sessions: list[int] = []
        self.persist_sessions: list[int] = []
        self.persisted_outputs: list[MatchingAnalysisOutput] = []


class FakeAnalysisService:
    def __init__(self, session: FakeSession, state: AnalysisState) -> None:
        self.session = session
        self.state = state

    async def load_matching_input(
        self,
        run: AgentRun,
    ) -> MatchingAnalysisInput:
        assert self.state.sessions.active == 1
        self.state.load_sessions.append(self.session.identifier)
        if self.state.load_error is not None:
            raise self.state.load_error
        return matching_input()

    async def persist_success(
        self,
        run: AgentRun,
        result_output: MatchingAnalysisOutput,
    ) -> object:
        assert self.state.sessions.active == 1
        self.state.persist_sessions.append(self.session.identifier)
        if self.state.persist_error is not None:
            raise self.state.persist_error
        self.state.persisted_outputs.append(result_output)
        return object()


class FakeAgent:
    agent_id = "matching-analyzer"

    def __init__(
        self,
        sessions: FakeSessionFactory,
        response: AgentResult[BaseModel] | Exception,
    ) -> None:
        self.sessions = sessions
        self.response = response
        self.inputs: list[MatchingAnalysisInput] = []

    async def run(
        self,
        value: MatchingAnalysisInput,
    ) -> AgentResult[BaseModel]:
        assert self.sessions.active == 0
        self.inputs.append(value)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def handler(
    sessions: FakeSessionFactory,
    state: AnalysisState,
    agent: FakeAgent,
) -> MatchingAnalysisHandler:
    return MatchingAnalysisHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(MatchingAnalysisAgent, agent),
        analysis_service_factory=cast(
            AnalysisServiceFactory,
            lambda session: FakeAnalysisService(cast(FakeSession, session), state),
        ),
    )


def test_handler_uses_two_short_sessions_and_returns_original_result() -> None:
    async def run_test() -> None:
        sessions = FakeSessionFactory()
        state = AnalysisState(sessions)
        expected = agent_result()
        agent = FakeAgent(sessions, expected)
        run = running_agent_run()
        original_state = (run.status, run.lease_token, run.attempt_count)
        tasks_before = set(asyncio.all_tasks())

        result = await handler(sessions, state, agent).execute(run)

        assert result is expected
        assert MatchingAnalysisHandler.agent_id == "matching-analyzer"
        assert agent.inputs == [matching_input()]
        assert state.load_sessions == [1]
        assert state.persist_sessions == [2]
        assert state.persisted_outputs == [expected.output]
        assert sessions.entered == [1, 2]
        assert sessions.exited == [1, 2]
        assert sessions.active == 0
        assert (run.status, run.lease_token, run.attempt_count) == original_state
        assert set(asyncio.all_tasks()) == tasks_before

    asyncio.run(run_test())


def test_handler_requires_matching_agent_identity() -> None:
    sessions = FakeSessionFactory()
    state = AnalysisState(sessions)
    agent = FakeAgent(sessions, agent_result())
    agent.agent_id = "other-agent"

    with pytest.raises(ValueError, match="matching analysis agent"):
        handler(sessions, state, agent)


@pytest.mark.parametrize("invalid_field", ["status", "lease_token", "agent_id"])
def test_handler_rejects_invalid_run_before_opening_session(
    invalid_field: str,
) -> None:
    sessions = FakeSessionFactory()
    state = AnalysisState(sessions)
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

    assert exc_info.value.code == "invalid_matching_analysis_run"
    assert exc_info.value.retryable is False
    assert sessions.created == 0
    assert agent.inputs == []


@pytest.mark.parametrize("phase", ["load", "persist"])
def test_handler_maps_state_error_without_exception_chain(phase: str) -> None:
    sessions = FakeSessionFactory()
    state = AnalysisState(sessions)
    error = MatchingAnalysisStateError("matching_profile_version_stale")
    if phase == "load":
        state.load_error = error
    else:
        state.persist_error = error
    agent = FakeAgent(sessions, agent_result())

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value.code == "matching_profile_version_stale"
    assert exc_info.value.retryable is False
    assert exc_info.value.__cause__ is None
    assert sessions.active == 0


@pytest.mark.parametrize(
    "provider_error",
    [
        ProviderUnavailableError(),
        ProviderRateLimitedError(),
        InvalidStructuredOutputError(),
        LLMProviderConfigurationError(),
    ],
)
def test_handler_preserves_provider_error(provider_error: Exception) -> None:
    sessions = FakeSessionFactory()
    state = AnalysisState(sessions)
    agent = FakeAgent(sessions, provider_error)

    with pytest.raises(type(provider_error)) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value is provider_error
    assert sessions.entered == [1]
    assert sessions.exited == [1]
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
    state = AnalysisState(sessions)
    agent = FakeAgent(sessions, mismatched_result)

    with pytest.raises(AgentExecutionError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value.code == "agent_run_result_mismatch"
    assert exc_info.value.retryable is False
    assert state.persist_sessions == []
    assert sessions.entered == [1]


@pytest.mark.parametrize("phase", ["load", "persist"])
def test_handler_preserves_unknown_database_error(phase: str) -> None:
    sessions = FakeSessionFactory()
    state = AnalysisState(sessions)
    error = RuntimeError("database unavailable")
    if phase == "load":
        state.load_error = error
    else:
        state.persist_error = error
    agent = FakeAgent(sessions, agent_result())

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(handler(sessions, state, agent).execute(running_agent_run()))

    assert exc_info.value is error
    assert sessions.active == 0
