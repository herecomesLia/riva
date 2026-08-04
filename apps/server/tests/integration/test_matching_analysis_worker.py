import asyncio
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from riva.agents import MatchingAnalysisAgent
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole, ProviderUnavailableError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import MATCHING_ANALYSIS_PROMPT_V1
from riva.schemas.matching_analysis import MatchingAnalysisOutput
from riva.schemas.roles import (
    MatchingAnalysisStatusQuery,
    StartMatchingAnalysisRequest,
)
from riva.services.agent_runs import AgentRunService
from riva.services.roles import TargetRoleService
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    MatchingAnalysisHandler,
    build_agent_handler_registry,
)
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 4, 9, 30, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


class MismatchedResultAgent(MatchingAnalysisAgent):
    async def run(self, input):
        result = await super().run(input)
        return replace(result, prompt_id="mismatched-prompt")


@dataclass(frozen=True)
class MatchingSetup:
    owner: User
    role: TargetRole
    profile: CareerProfile
    jd_analysis: JobDescriptionAnalysis
    run: AgentRun
    provider: FakeLLMProvider
    worker: AgentWorker


MATCHING_OUTPUT = {
    "overall_match_score": 87,
    "core_requirements_summary": "Build reliable APIs with Python.",
    "matched_capabilities": ["Python", "FastAPI"],
    "missing_capabilities": ["Kubernetes"],
    "underrepresented_capabilities": ["System design"],
    "resume_highlights": ["Improved API reliability"],
    "resume_gaps": ["Scale is not stated"],
    "high_risk_questions": ["How did you improve reliability?"],
    "preparation_recommendations": ["Prepare the reliability example."],
}


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def make_user(user_id: UUID) -> User:
    return User(
        id=user_id,
        username=user_id.hex,
        normalized_username=user_id.hex,
        password_hash="hash",
        display_name="Matching Worker User",
    )


def make_run(
    *,
    user_id: UUID,
    role_id: UUID,
    profile_id: UUID,
    key: str,
) -> AgentRun:
    prompt = MATCHING_ANALYSIS_PROMPT_V1
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=prompt.prompt_id,
        prompt_id=prompt.prompt_id,
        prompt_version=prompt.version,
        output_schema_id=prompt.output_schema_id,
        payload={
            "roleId": str(role_id),
            "profileId": str(profile_id),
            "profileVersion": 1,
            "jobDescriptionVersion": 1,
            "jobDescriptionAnalysisVersion": 1,
        },
        idempotency_key=key,
        max_attempts=3,
        model="fake-matching-model",
    )


def make_analysis(
    *,
    role_id: UUID,
    user_id: UUID,
    parsing_run_id: UUID,
) -> JobDescriptionAnalysis:
    return JobDescriptionAnalysis(
        role_id=role_id,
        user_id=user_id,
        job_description_version=1,
        analysis_version=1,
        source_agent_run_id=parsing_run_id,
        parsed_at=START,
        riva_summary="Build reliable APIs with Python.",
        responsibilities=["设计可靠的 API"],
        qualification_requirements={
            "education": ["Bachelor's degree"],
            "graduation_cohorts": [],
            "majors": [],
            "experience": ["Three years of backend experience"],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": [],
            "tools": ["Git"],
            "concepts_and_methods": [],
            "databases_and_middleware": ["PostgreSQL"],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=["Communication"],
        business_domains=["Payments"],
    )


async def setup_matching(
    database: Database,
    provider: FakeLLMProvider,
    *,
    mismatched_agent: bool = False,
    registry: AgentHandlerRegistry | None = None,
) -> MatchingSetup:
    user_id = uuid4()
    profile_id = uuid4()
    role_id = uuid4()
    parsing_run = AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="job-description-parser",
        prompt_id="job-description-parser",
        prompt_version="1",
        output_schema_id="job-description-analysis-v1",
        status=AgentRunStatus.SUCCEEDED,
        payload={
            "roleId": str(role_id),
            "jobDescriptionVersion": 1,
        },
        idempotency_key=f"matching-worker-parsing-{role_id}",
        attempt_count=1,
        max_attempts=3,
        started_at=START,
        finished_at=START,
        provider="fake-jd-provider",
        model="fake-jd-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )
    role = TargetRole(
        id=role_id,
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="RAW JD SHOULD NOT ENTER MATCHING PROMPT.",
        job_description_version=1,
        job_description_parsing_run_id=parsing_run.id,
        version=1,
    )
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=user_id,
        summary="后端工程师，专注可靠 API。",
        version=1,
    )
    skill = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="Python",
        normalized_name="python",
        source="userAdded",
    )
    work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        company="Riva",
        title="Backend Engineer",
        employment_type="fullTime",
        start_date="2021-07",
        end_date=None,
        is_current=True,
        responsibilities=["设计可靠的 API"],
        achievements=["Improved API reliability"],
        source="userAdded",
    )
    work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=work.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    profile.skills = [skill]
    profile.work_experiences = [work]
    analysis = make_analysis(
        role_id=role_id,
        user_id=user_id,
        parsing_run_id=parsing_run.id,
    )
    owner = make_user(user_id)

    async with database.sessionmaker() as session:
        session.add_all([owner, role, profile, parsing_run, analysis])
        await session.commit()

    async with database.sessionmaker() as session:
        run = await AgentRunService(session).enqueue(
            user_id=user_id,
            agent_id="matching-analyzer",
            prompt_id="matching-analyzer",
            prompt_version="1",
            output_schema_id="matching-analysis-v1",
            model="fake-matching-model",
            payload={
                "roleId": role_id,
                "profileId": profile_id,
                "profileVersion": 1,
                "jobDescriptionVersion": 1,
                "jobDescriptionAnalysisVersion": 1,
            },
            idempotency_key=f"matching-worker-{role_id}",
            max_attempts=3,
        )

    async with database.sessionmaker() as session:
        stored_role = await session.get(TargetRole, role_id)
        assert stored_role is not None
        stored_role.matching_analysis_run_id = run.id
        await session.commit()

    if registry is None:
        agent_type = (
            MismatchedResultAgent if mismatched_agent else MatchingAnalysisAgent
        )
        agent = agent_type(provider, model="fake-matching-model")
        handler = MatchingAnalysisHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        registry = AgentHandlerRegistry()
        registry.register(handler)
    else:
        if mismatched_agent:
            raise ValueError("custom registry cannot use a mismatched agent")

    worker = AgentWorker(
        worker_id="matching-integration-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )
    return MatchingSetup(owner, role, profile, analysis, run, provider, worker)


def test_matching_worker_success_chain_with_fake_provider() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [MATCHING_OUTPUT],
            provider="fake-matching-provider",
            usage=LLMUsage(input_tokens=120, output_tokens=45),
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(database, provider)
                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    stored_profile = await session.get(
                        CareerProfile,
                        setup.profile.profile_id,
                    )
                    stored_jd = await session.get(
                        JobDescriptionAnalysis,
                        setup.role.id,
                    )
                    stored_analysis = await session.get(
                        MatchingAnalysis,
                        setup.role.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.attempt_count == 1
                    assert stored_run.provider == "fake-matching-provider"
                    assert stored_run.model == "fake-matching-model"
                    assert stored_run.input_tokens == 120
                    assert stored_run.output_tokens == 45
                    assert stored_run.result == MATCHING_OUTPUT
                    assert stored_run.error_code is None
                    assert stored_run.lease_token is None
                    assert stored_run.lease_owner is None
                    assert stored_run.lease_expires_at is None
                    assert stored_analysis is not None
                    assert stored_analysis.source_agent_run_id == setup.run.id
                    assert stored_analysis.profile_id == setup.profile.profile_id
                    assert stored_analysis.profile_version == 1
                    assert stored_analysis.job_description_version == 1
                    assert stored_analysis.job_description_analysis_version == 1
                    assert stored_analysis.generated_at.tzinfo is not None
                    assert stored_analysis.overall_match_score == 87
                    assert stored_analysis.core_requirements_summary == (
                        "Build reliable APIs with Python."
                    )
                    assert stored_analysis.matched_capabilities == [
                        "Python",
                        "FastAPI",
                    ]
                    assert stored_analysis.missing_capabilities == ["Kubernetes"]
                    assert stored_analysis.underrepresented_capabilities == [
                        "System design"
                    ]
                    assert stored_analysis.resume_highlights == [
                        "Improved API reliability"
                    ]
                    assert stored_analysis.resume_gaps == ["Scale is not stated"]
                    assert stored_analysis.high_risk_questions == [
                        "How did you improve reliability?"
                    ]
                    assert stored_analysis.preparation_recommendations == [
                        "Prepare the reliability example."
                    ]
                    assert stored_role is not None
                    assert stored_role.version == 2
                    assert stored_role.matching_analysis_run_id == setup.run.id
                    assert stored_role.job_description_version == 1
                    assert stored_profile is not None
                    assert stored_profile.version == 1
                    assert stored_jd is not None
                    assert stored_jd.analysis_version == 1
                    assert stored_jd.riva_summary == setup.jd_analysis.riva_summary

                assert len(provider.calls) == 1
                request = provider.calls[0]
                assert request.model == "fake-matching-model"
                assert request.output_schema is MatchingAnalysisOutput
                assert [message.role for message in request.messages] == [
                    MessageRole.SYSTEM,
                    MessageRole.USER,
                ]
                user_message = request.messages[1].content
                assert "后端工程师" in user_message
                assert "RAW JD SHOULD NOT ENTER MATCHING PROMPT" not in user_message
                assert str(setup.owner.id) not in user_message
                assert str(setup.role.id) not in user_message
                assert str(setup.profile.profile_id) not in user_message
                assert str(setup.run.id) not in user_message
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_matching_service_worker_status_e2e_with_fake_provider() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [MATCHING_OUTPUT],
            provider="fake-matching-provider",
            usage=LLMUsage(input_tokens=120, output_tokens=45),
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(database, provider)

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, setup.role.id)
                    stored_run = await session.get(AgentRun, setup.run.id)
                    assert stored_role is not None
                    assert stored_run is not None
                    stored_role.matching_analysis_run_id = None
                    await session.delete(stored_run)
                    await session.commit()

                async with database.sessionmaker() as session:
                    started = await TargetRoleService(
                        session,
                        llm_provider="qwen",
                        llm_model="fake-matching-model",
                    ).start_matching_analysis(
                        setup.owner,
                        setup.role.id,
                        StartMatchingAnalysisRequest(version=1),
                    )
                started_role = next(
                    role for role in started.roles if role.id == setup.role.id
                )
                assert started_role.version == 2
                assert started_role.matching_analysis is not None
                assert started_role.matching_analysis.status == "generating"

                async with database.sessionmaker() as session:
                    queued_role = await session.get(TargetRole, setup.role.id)
                    assert queued_role is not None
                    queued_run = await session.get(
                        AgentRun,
                        queued_role.matching_analysis_run_id,
                    )
                    assert queued_run is not None
                    assert queued_run.payload == {
                        "roleId": str(setup.role.id),
                        "profileId": str(setup.profile.profile_id),
                        "profileVersion": 1,
                        "jobDescriptionVersion": 1,
                        "jobDescriptionAnalysisVersion": 1,
                    }
                    assert queued_run.max_attempts == 3

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    snapshot = await TargetRoleService(
                        session
                    ).get_matching_analysis_status(
                        setup.owner,
                        setup.role.id,
                        MatchingAnalysisStatusQuery(version=2),
                    )
                    projected = snapshot.matching_analysis
                    assert projected is not None
                    assert projected.status == "current"
                    assert projected.result is not None
                    assert projected.result.overall_match_score == 87

                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_role is not None
                    assert stored_role.version == 3
                    stored_run = await session.get(
                        AgentRun,
                        stored_role.matching_analysis_run_id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.provider == "fake-matching-provider"
                    assert stored_run.model == "fake-matching-model"
                    assert stored_run.input_tokens == 120
                    assert stored_run.output_tokens == 45
                    stored_analysis = await session.get(
                        MatchingAnalysis,
                        setup.role.id,
                    )
                    assert stored_analysis is not None
                    assert stored_analysis.source_agent_run_id == stored_run.id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_matching_enqueue_is_invisible_until_role_binding_commits() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [MATCHING_OUTPUT],
            provider="fake-matching-provider",
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(database, provider)
                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, setup.role.id)
                    stored_run = await session.get(AgentRun, setup.run.id)
                    assert stored_role is not None
                    assert stored_run is not None
                    stored_role.matching_analysis_run_id = None
                    await session.delete(stored_run)
                    await session.commit()

                async with database.sessionmaker() as enqueue_session:
                    stored_role = await enqueue_session.scalar(
                        select(TargetRole)
                        .where(TargetRole.id == setup.role.id)
                        .with_for_update()
                    )
                    assert stored_role is not None
                    prompt = MATCHING_ANALYSIS_PROMPT_V1
                    run = await AgentRunService(
                        enqueue_session
                    ).enqueue_in_transaction(
                        user_id=setup.owner.id,
                        agent_id="matching-analyzer",
                        prompt_id=prompt.prompt_id,
                        prompt_version=prompt.version,
                        output_schema_id=prompt.output_schema_id,
                        model="fake-matching-model",
                        payload={
                            "roleId": setup.role.id,
                            "profileId": setup.profile.profile_id,
                            "profileVersion": 1,
                            "jobDescriptionVersion": 1,
                            "jobDescriptionAnalysisVersion": 1,
                        },
                        idempotency_key=f"atomic-matching:{setup.role.id}:1",
                        max_attempts=3,
                    )
                    stored_role.matching_analysis_run_id = run.id
                    stored_role.version += 1
                    await enqueue_session.flush()

                    async with database.sessionmaker() as worker_session:
                        invisible = await AgentRunService(
                            worker_session
                        ).claim_next(
                            lease_owner="matching-atomic-worker",
                            lease_duration=timedelta(minutes=5),
                        )
                    assert invisible is None
                    await enqueue_session.commit()

                async with database.sessionmaker() as worker_session:
                    visible = await AgentRunService(worker_session).claim_next(
                        lease_owner="matching-atomic-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                assert visible is not None
                assert visible.id == run.id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_production_registry_runs_matching_worker_chain() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [MATCHING_OUTPUT],
            provider="fake-production-provider",
            usage=LLMUsage(input_tokens=90, output_tokens=35),
        )
        provider_calls: list[Settings] = []
        async with Database(database_url()) as database:
            await database.reset()
            try:
                current = Settings(
                    database_url=os.environ["RIVA_TEST_DATABASE_URL"],
                    session_digest_key="integration-session-key",
                    llm_provider="qwen",
                    llm_model="  fake-matching-model  ",
                    llm_api_key="integration-fake-key",
                    llm_base_url="https://example.invalid/v1",
                )

                def provider_factory(received: Settings):
                    provider_calls.append(received)
                    return provider

                registry = build_agent_handler_registry(
                    current,
                    database.sessionmaker,
                    provider_factory=provider_factory,
                )
                assert registry.agent_ids == (
                    "job-description-parser",
                    "matching-analyzer",
                )
                assert isinstance(
                    registry.get("matching-analyzer"), MatchingAnalysisHandler
                )
                setup = await setup_matching(
                    database,
                    provider,
                    registry=registry,
                )
                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.provider == "fake-production-provider"
                    assert stored_run.model == "fake-matching-model"
                    assert (
                        await session.get(MatchingAnalysis, setup.role.id)
                        is not None
                    )
                assert provider_calls == [current]
                assert len(provider.calls) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ("superseded", "matching_analysis_superseded"),
        ("profile", "matching_profile_version_stale"),
        (
            "analysis",
            "matching_job_description_analysis_version_stale",
        ),
    ],
)
def test_matching_worker_state_errors_are_non_retryable_and_do_not_call_provider(
    mutation: str,
    expected_code: str,
) -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider([])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(database, provider)
                async with database.sessionmaker() as session:
                    if mutation == "superseded":
                        replacement = make_run(
                            user_id=setup.owner.id,
                            role_id=setup.role.id,
                            profile_id=setup.profile.profile_id,
                            key=f"replacement-{setup.run.id}",
                        )
                        session.add(replacement)
                        role = await session.get(TargetRole, setup.role.id)
                        assert role is not None
                        role.matching_analysis_run_id = replacement.id
                    elif mutation == "profile":
                        profile = await session.get(
                            CareerProfile,
                            setup.profile.profile_id,
                        )
                        assert profile is not None
                        profile.version = 2
                    else:
                        analysis = await session.get(
                            JobDescriptionAnalysis,
                            setup.role.id,
                        )
                        assert analysis is not None
                        analysis.analysis_version = 2
                    await session.commit()

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.FAILED
                    assert stored_run.error_code == expected_code
                    assert stored_run.attempt_count == 1
                    assert stored_run.provider is None
                    assert stored_run.result is None
                    assert await session.get(MatchingAnalysis, setup.role.id) is None
                    assert stored_role is not None
                    assert stored_role.version == 1
                assert provider.calls == []
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_matching_worker_retries_provider_unavailable_then_succeeds() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [ProviderUnavailableError(), MATCHING_OUTPUT],
            provider="fake-retry-provider",
            usage=LLMUsage(input_tokens=20, output_tokens=8),
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(database, provider)
                before = setup.run.available_at
                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    first = await session.get(AgentRun, setup.run.id)
                    assert first is not None
                    assert first.status is AgentRunStatus.QUEUED
                    assert first.attempt_count == 1
                    assert first.error_code == "provider_unavailable"
                    assert first.available_at > before
                    assert await session.get(MatchingAnalysis, setup.role.id) is None
                    first.available_at = datetime.now(UTC) - timedelta(seconds=1)
                    await session.commit()

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.attempt_count == 2
                    assert stored_run.error_code is None
                    assert stored_run.provider == "fake-retry-provider"
                    assert (
                        await session.get(MatchingAnalysis, setup.role.id)
                        is not None
                    )
                    assert stored_role is not None
                    assert stored_role.version == 2
                assert len(provider.calls) == 2
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_matching_worker_rejects_mismatched_result_without_persisting() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider([MATCHING_OUTPUT])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_matching(
                    database,
                    provider,
                    mismatched_agent=True,
                )
                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.FAILED
                    assert stored_run.error_code == "agent_run_result_mismatch"
                    assert await session.get(MatchingAnalysis, setup.role.id) is None
                    assert stored_role is not None
                    assert stored_role.version == 1
                assert len(provider.calls) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
