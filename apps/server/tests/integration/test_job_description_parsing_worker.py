import asyncio
import os
from dataclasses import dataclass, replace
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.agents import (
    AgentResult,
    JobDescriptionParsingAgent,
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
)
from riva.core.config import Settings
from riva.core.errors import APIError
from riva.db.database import Database
from riva.integrations import (
    LLMProviderConfigurationError,
    LLMUsage,
    MessageRole,
    ProviderUnavailableError,
)
from riva.models import (
    AgentRun,
    AgentRunStatus,
    JobDescriptionAnalysis,
    TargetRole,
    User,
)
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT
from riva.schemas.roles import (
    JobDescriptionParsingStatusQuery,
    SaveJobDescriptionRequest,
    StartJobDescriptionParsingRequest,
)
from riva.services.agent_runs import AgentRunService
from riva.services.roles import TargetRoleService
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    JobDescriptionParsingHandler,
    build_agent_handler_registry,
)
from tests.helpers.llm import FakeLLMProvider

pytestmark = pytest.mark.integration


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


class BlockingFakeLLMProvider(FakeLLMProvider):
    def __init__(self, responses: list[object]) -> None:
        super().__init__(responses)
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def generate_structured(self, request):
        self.started.set()
        await self.release.wait()
        return await super().generate_structured(request)


class MismatchedResultAgent(JobDescriptionParsingAgent):
    async def run(
        self,
        input: JobDescriptionParsingInput,
    ) -> AgentResult[JobDescriptionParsingOutput]:
        result = await super().run(input)
        return replace(result, prompt_id="mismatched-prompt")


@dataclass(frozen=True)
class ParsingSetup:
    owner: User
    role: TargetRole
    run: AgentRun
    provider: FakeLLMProvider
    handler: JobDescriptionParsingHandler
    worker: AgentWorker


def structured_output(
    summary: str = "Build reliable payment APIs.",
) -> dict[str, object]:
    return {
        "riva_summary": summary,
        "responsibilities": ["Design APIs"],
        "qualification_requirements": {
            "education": ["Bachelor's degree"],
            "graduation_cohorts": [],
            "majors": ["Computer Science, Software Engineering, or a related field"],
            "experience": ["Three years of backend experience"],
            "languages": ["English"],
            "certifications": [],
            "other": [],
        },
        "required_skills": {
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": ["Linux"],
            "tools": ["Git"],
            "concepts_and_methods": ["Distributed systems"],
            "databases_and_middleware": ["PostgreSQL"],
            "other": [],
        },
        "preferred_qualifications": ["Kubernetes or cloud platform experience"],
        "soft_skills": ["Communication"],
        "business_domains": ["Payments"],
    }


def database_url() -> str:
    test_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == test_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return test_url


async def leave_run_queued(_run_id: UUID) -> None:
    """Keep worker-focused setup from executing the run through the API path."""


def owner(user_id: UUID) -> User:
    return User(
        id=user_id,
        username=f"jd-worker-{user_id.hex[:8]}",
        normalized_username=f"jd-worker-{user_id.hex[:8]}",
        password_hash="hash",
        display_name="JD Worker",
    )


async def enqueue_parsing_run(
    database: Database,
    *,
    user_id: UUID,
    role_id: UUID,
    job_description_version: int,
    key: str,
) -> AgentRun:
    async with database.sessionmaker() as session:
        prompt = JOB_DESCRIPTION_PARSING_PROMPT
        return await AgentRunService(session).enqueue(
            user_id=user_id,
            agent_id="job-description-parser",
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model="fake-jd-model",
            payload={
                "roleId": role_id,
                "jobDescriptionVersion": job_description_version,
            },
            idempotency_key=key,
            max_attempts=3,
        )


async def setup_parsing(
    database: Database,
    provider: FakeLLMProvider,
    *,
    mismatched_agent: bool = False,
    registry: AgentHandlerRegistry | None = None,
) -> ParsingSetup:
    user_id = uuid4()
    role = TargetRole(
        id=uuid4(),
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable payment APIs with Python.",
        job_description_version=1,
        version=1,
    )
    role_owner = owner(user_id)
    async with database.sessionmaker() as session:
        session.add_all([role_owner, role])
        await session.commit()

    run = await enqueue_parsing_run(
        database,
        user_id=user_id,
        role_id=role.id,
        job_description_version=1,
        key=f"parse-{role.id}",
    )
    async with database.sessionmaker() as session:
        stored_role = await session.get(TargetRole, role.id)
        assert stored_role is not None
        stored_role.job_description_parsing_run_id = run.id
        await session.commit()

    if registry is None:
        agent_type = (
            MismatchedResultAgent if mismatched_agent else JobDescriptionParsingAgent
        )
        agent = agent_type(provider, model="fake-jd-model")
        handler = JobDescriptionParsingHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        registry = AgentHandlerRegistry()
        registry.register(handler)
    else:
        if mismatched_agent:
            raise ValueError("custom registry cannot use a mismatched agent")
        registered = registry.get("job-description-parser")
        assert isinstance(registered, JobDescriptionParsingHandler)
        handler = registered
    worker = AgentWorker(
        worker_id="jd-integration-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=30),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )
    return ParsingSetup(role_owner, role, run, provider, handler, worker)


def test_job_description_parsing_worker_success_chain() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [structured_output()],
            provider="fake-jd-provider",
            usage=LLMUsage(input_tokens=120, output_tokens=45),
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(database, provider)

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    analysis = await session.get(JobDescriptionAnalysis, setup.role.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.attempt_count == 1
                    assert stored_run.provider == "fake-jd-provider"
                    assert stored_run.model == "fake-jd-model"
                    assert stored_run.input_tokens == 120
                    assert stored_run.output_tokens == 45
                    assert stored_run.result == structured_output()
                    assert analysis is not None
                    assert analysis.source_agent_run_id == setup.run.id
                    assert analysis.job_description_version == 1
                    assert analysis.analysis_version == 1
                    assert analysis.qualification_requirements["majors"] == [
                        "Computer Science, Software Engineering, or a related field"
                    ]
                    assert analysis.preferred_qualifications == [
                        "Kubernetes or cloud platform experience"
                    ]
                    assert stored_role is not None
                    assert stored_role.version == 2
                    assert stored_role.job_description_parsing_run_id == setup.run.id

                assert len(provider.calls) == 1
                request = provider.calls[0]
                assert request.model == "fake-jd-model"
                assert request.output_schema is JobDescriptionParsingOutput
                assert [message.role for message in request.messages] == [
                    MessageRole.SYSTEM,
                    MessageRole.USER,
                ]
                assert "<BEGIN_UNTRUSTED_JOB_DESCRIPTION>" in (
                    request.messages[1].content
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_production_registry_runs_job_description_parsing_chain() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [structured_output()],
            provider="fake-production-provider",
            usage=LLMUsage(input_tokens=90, output_tokens=35),
        )
        provider_calls: list[Settings] = []
        test_database_url = database_url()
        async with Database(test_database_url) as database:
            await database.reset()
            try:
                current = Settings(
                    database_url=test_database_url,
                    session_digest_key="integration-session-key",
                    llm_provider="qwen",
                    llm_model="  fake-jd-model  ",
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
                assert {
                    "job-description-parser",
                    "matching-analyzer",
                    "practice-reference-answer-generator",
                    "resume-parser",
                }.issubset(registry.agent_ids)

                setup = await setup_parsing(
                    database,
                    provider,
                    registry=registry,
                )
                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    analysis = await session.get(
                        JobDescriptionAnalysis,
                        setup.role.id,
                    )
                    stored_role = await session.get(TargetRole, setup.role.id)

                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.provider == "fake-production-provider"
                    assert stored_run.model == "fake-jd-model"
                    assert stored_run.input_tokens == 90
                    assert stored_run.output_tokens == 35
                    assert stored_run.result == structured_output()
                    assert analysis is not None
                    assert analysis.source_agent_run_id == setup.run.id
                    assert stored_role is not None
                    assert stored_role.version == 2

                assert provider_calls == [current]
                assert len(provider.calls) == 1
                assert provider.calls[0].model == "fake-jd-model"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_start_worker_status_end_to_end_with_fake_provider() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [structured_output("API-started parsing summary.")],
            provider="fake-api-provider",
            usage=LLMUsage(input_tokens=77, output_tokens=23),
        )
        test_database_url = database_url()
        async with Database(test_database_url) as database:
            await database.reset()
            try:
                role_owner = owner(uuid4())
                target = TargetRole(
                    id=uuid4(),
                    user_id=role_owner.id,
                    title="Backend Engineer",
                    company="Riva",
                    preparation_status="preparing",
                    job_description_status="saved",
                    raw_job_description="Build reliable payment APIs with Python.",
                    job_description_version=1,
                    version=1,
                )
                async with database.sessionmaker() as session:
                    session.add_all([role_owner, target])
                    await session.commit()

                async with database.sessionmaker() as session:
                    started = await TargetRoleService(
                        session,
                        llm_provider="qwen",
                        llm_model=" fake-api-model ",
                        agent_executor=leave_run_queued,
                    ).start_job_description_parsing(
                        role_owner,
                        target.id,
                        StartJobDescriptionParsingRequest(
                            version=1,
                            job_description_version=1,
                        ),
                    )
                assert started.roles[0].job_description.status == "parsing"
                assert started.roles[0].version == 2

                settings = Settings(
                    database_url=test_database_url,
                    session_digest_key="integration-session-key",
                    llm_provider="qwen",
                    llm_model=" fake-api-model ",
                    llm_api_key="integration-fake-key",
                    llm_base_url="https://example.invalid/v1",
                )
                registry = build_agent_handler_registry(
                    settings,
                    database.sessionmaker,
                    provider_factory=lambda _: provider,
                )
                worker = AgentWorker(
                    worker_id="api-e2e-worker",
                    session_factory=database.sessionmaker,
                    registry=registry,
                    lease_duration=timedelta(minutes=10),
                    heartbeat_interval=timedelta(minutes=2),
                    poll_interval=timedelta(seconds=1),
                    requeue_interval=timedelta(minutes=1),
                    retry_base_delay=timedelta(seconds=30),
                    retry_max_delay=timedelta(minutes=2),
                    logger=SilentLogger(),
                )
                assert await worker.process_one() is True

                async with database.sessionmaker() as session:
                    snapshot = await TargetRoleService(
                        session
                    ).get_job_description_parsing_status(
                        role_owner,
                        target.id,
                        JobDescriptionParsingStatusQuery(
                            version=2,
                            job_description_version=1,
                        ),
                    )
                assert snapshot.version == 3
                assert snapshot.job_description.status == "ready"
                assert snapshot.job_description_analysis is not None
                assert snapshot.job_description_analysis.riva_summary == (
                    "API-started parsing summary."
                )
                assert (
                    snapshot.job_description_analysis.required_skills.programming_languages
                    == ["Python"]
                )

                async with database.sessionmaker() as session:
                    ready_no_op = await TargetRoleService(
                        session
                    ).start_job_description_parsing(
                        role_owner,
                        target.id,
                        StartJobDescriptionParsingRequest(
                            version=3,
                            job_description_version=1,
                        ),
                    )
                assert ready_no_op.roles[0].version == 3
                assert ready_no_op.roles[0].job_description.status == "ready"

                async with database.sessionmaker() as session:
                    run = await session.scalar(select(AgentRun))
                    assert run is not None
                    assert run.status is AgentRunStatus.SUCCEEDED
                    assert run.provider == "fake-api-provider"
                    assert run.model == "fake-api-model"
                    assert run.input_tokens == 77
                    assert run.output_tokens == 23
                    analysis = await session.get(JobDescriptionAnalysis, target.id)
                    assert analysis is not None
                    await session.delete(analysis)
                    await session.commit()

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as inconsistent:
                        await TargetRoleService(
                            session,
                            llm_provider="qwen",
                            llm_model="fake-api-model",
                        ).start_job_description_parsing(
                            role_owner,
                            target.id,
                            StartJobDescriptionParsingRequest(
                                version=3,
                                job_description_version=1,
                            ),
                        )
                    assert inconsistent.value.error == (
                        "job_description_parsing_state_conflict"
                    )

                async with database.sessionmaker() as session:
                    changed = await TargetRoleService(session).save_job_description(
                        role_owner,
                        target.id,
                        SaveJobDescriptionRequest(
                            version=3,
                            raw_text="Build distributed systems.",
                        ),
                    )
                assert changed.roles[0].version == 4
                assert changed.roles[0].job_description.version == 2
                async with database.sessionmaker() as session:
                    old_poll = await TargetRoleService(
                        session
                    ).get_job_description_parsing_status(
                        role_owner,
                        target.id,
                        JobDescriptionParsingStatusQuery(
                            version=2,
                            job_description_version=1,
                        ),
                    )
                assert old_poll.version == 4
                assert old_poll.job_description.status == "saved"
                assert old_poll.job_description.version == 2
            finally:
                await database.reset()

    asyncio.run(run_test())


@pytest.mark.parametrize(
    ("response", "expected_status", "error_code"),
    [
        (
            ProviderUnavailableError(),
            AgentRunStatus.QUEUED,
            "provider_unavailable",
        ),
        (
            {"riva_summary": "invalid incomplete output"},
            AgentRunStatus.QUEUED,
            "invalid_structured_output",
        ),
        (
            LLMProviderConfigurationError(),
            AgentRunStatus.FAILED,
            "provider_configuration_error",
        ),
    ],
)
def test_worker_provider_failures_do_not_persist_analysis(
    response: object,
    expected_status: AgentRunStatus,
    error_code: str,
) -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider([response])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(database, provider)
                original_available_at = setup.run.available_at

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    analysis = await session.get(JobDescriptionAnalysis, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is expected_status
                    assert stored_run.error_code == error_code
                    assert stored_run.attempt_count == 1
                    assert analysis is None
                    if expected_status is AgentRunStatus.QUEUED:
                        assert stored_run.available_at > original_available_at
                    else:
                        assert stored_run.finished_at is not None
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_worker_rejects_result_when_jd_changes_during_provider_call() -> None:
    async def run_test() -> None:
        provider = BlockingFakeLLMProvider([structured_output()])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(database, provider)
                process_task = asyncio.create_task(setup.worker.process_one())
                await asyncio.wait_for(provider.started.wait(), timeout=2)

                async with database.sessionmaker() as session:
                    await TargetRoleService(session).save_job_description(
                        setup.owner,
                        setup.role.id,
                        SaveJobDescriptionRequest(
                            version=1,
                            raw_text="Build a new generation of data systems.",
                        ),
                    )
                provider.release.set()
                assert await asyncio.wait_for(process_task, timeout=2) is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.FAILED
                    assert stored_run.error_code == "job_description_version_stale"
                    assert (
                        await session.get(JobDescriptionAnalysis, setup.role.id) is None
                    )
                    assert stored_role is not None
                    assert stored_role.raw_job_description == (
                        "Build a new generation of data systems."
                    )
                    assert stored_role.job_description_version == 2
            finally:
                provider.release.set()
                await database.reset()

    asyncio.run(run_test())


def test_worker_rejects_result_when_current_run_is_replaced() -> None:
    async def run_test() -> None:
        provider = BlockingFakeLLMProvider([structured_output()])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(database, provider)
                process_task = asyncio.create_task(setup.worker.process_one())
                await asyncio.wait_for(provider.started.wait(), timeout=2)

                replacement_run = await enqueue_parsing_run(
                    database,
                    user_id=setup.role.user_id,
                    role_id=setup.role.id,
                    job_description_version=1,
                    key=f"replacement-{setup.role.id}",
                )
                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert stored_role is not None
                    stored_role.job_description_parsing_run_id = replacement_run.id
                    await session.commit()

                provider.release.set()
                assert await asyncio.wait_for(process_task, timeout=2) is True

                async with database.sessionmaker() as session:
                    old_run = await session.get(AgentRun, setup.run.id)
                    new_run = await session.get(AgentRun, replacement_run.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    assert old_run is not None
                    assert old_run.status is AgentRunStatus.FAILED
                    assert old_run.error_code == "job_description_parse_superseded"
                    assert new_run is not None
                    assert new_run.status is AgentRunStatus.QUEUED
                    assert stored_role is not None
                    assert stored_role.job_description_parsing_run_id == (
                        replacement_run.id
                    )
                    assert (
                        await session.get(JobDescriptionAnalysis, setup.role.id) is None
                    )
            finally:
                provider.release.set()
                await database.reset()

    asyncio.run(run_test())


def test_worker_rejects_mismatched_agent_result_before_persist() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider([structured_output()])
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(
                    database,
                    provider,
                    mismatched_agent=True,
                )

                assert await setup.worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, setup.run.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.FAILED
                    assert stored_run.error_code == "agent_run_result_mismatch"
                    assert (
                        await session.get(JobDescriptionAnalysis, setup.role.id) is None
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_repeated_handler_execution_keeps_first_persisted_analysis() -> None:
    async def run_test() -> None:
        provider = FakeLLMProvider(
            [
                structured_output("First persisted result."),
                structured_output("Second result must be ignored."),
            ]
        )
        async with Database(database_url()) as database:
            await database.reset()
            try:
                setup = await setup_parsing(database, provider)
                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="repeat-worker",
                        lease_duration=timedelta(minutes=10),
                    )
                assert claimed is not None

                await setup.handler.execute(claimed)
                async with database.sessionmaker() as session:
                    first = await session.get(JobDescriptionAnalysis, setup.role.id)
                    assert first is not None
                    first_parsed_at = first.parsed_at

                await setup.handler.execute(claimed)

                async with database.sessionmaker() as session:
                    analysis = await session.get(JobDescriptionAnalysis, setup.role.id)
                    stored_role = await session.get(TargetRole, setup.role.id)
                    stored_run = await session.get(AgentRun, setup.run.id)
                    assert analysis is not None
                    assert analysis.riva_summary == "First persisted result."
                    assert analysis.parsed_at == first_parsed_at
                    assert stored_role is not None
                    assert stored_role.version == 2
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.RUNNING
                    assert stored_run.attempt_count == 1
                assert len(provider.calls) == 2
            finally:
                await database.reset()

    asyncio.run(run_test())
