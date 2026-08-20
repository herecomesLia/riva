import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from riva.agents import JobDescriptionParsingAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.core.errors import APIError
from riva.db import Database
from riva.integrations import LLMProviderConfigurationError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    JobDescriptionAnalysis,
    JobDescriptionImportDraft,
    TargetRole,
    User,
)
from riva.schemas.job_description_import_drafts import (
    JobDescriptionImportDraftCreate,
)
from riva.services.job_description_import_drafts import (
    IMPORT_DRAFT_NOT_READY,
    JobDescriptionImportDraftService,
)
from riva.workers import AgentHandlerRegistry, AgentWorker
from riva.workers.job_description_parsing import JobDescriptionParsingHandler
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
RAW_JD = """Backend Engineer
Riva, Shanghai
Build reliable payment APIs with Python and PostgreSQL.
"""


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def user(user_id: UUID | None = None) -> User:
    user_id = user_id or uuid4()
    username = f"jd-import-{user_id.hex[:12]}"
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name="JD Import User",
    )


def parsed_output() -> dict[str, object]:
    return {
        "parsed_title": "Backend Engineer",
        "parsed_company": "Riva",
        "parsed_location": "Shanghai",
        "parsed_description": (
            "Build reliable payment APIs with Python and PostgreSQL."
        ),
        "riva_summary": "Build reliable payment APIs.",
        "responsibilities": ["Build reliable payment APIs"],
        "qualification_requirements": {
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": ["Three years of backend experience"],
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
            "databases_and_middleware": ["PostgreSQL"],
            "other": [],
        },
        "preferred_qualifications": [],
        "soft_skills": [],
        "business_domains": ["Payments"],
    }


def service(session) -> JobDescriptionImportDraftService:
    return JobDescriptionImportDraftService(
        session,
        llm_provider="qwen",
        llm_model="fake-jd-model",
    )


def worker(database: Database, responses: list[object]) -> AgentWorker:
    provider = FakeLLMProvider(responses)
    handler = JobDescriptionParsingHandler(
        session_factory=database.sessionmaker,
        agent=JobDescriptionParsingAgent(provider, model="fake-jd-model"),
    )
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id="jd-import-test-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=5),
        heartbeat_interval=timedelta(minutes=1),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(seconds=10),
        logger=SilentLogger(),
    )


def test_create_parse_apply_and_repeated_apply_are_authoritative() -> None:
    async def run_test() -> None:
        async with Database(get_integration_database_url()) as database:
            await database.reset()
            try:
                owner = user()
                async with database.sessionmaker() as session:
                    session.add(owner)
                    await session.commit()

                async with database.sessionmaker() as session:
                    created = await service(session).create_draft(
                        owner,
                        JobDescriptionImportDraftCreate(raw_text=RAW_JD),
                        interaction_language="en",
                    )
                assert created.status == "parsing"
                assert created.agent_run_id is not None
                assert created.can_apply is False

                async with database.sessionmaker() as session:
                    run = await session.get(AgentRun, created.agent_run_id)
                    assert run is not None
                    assert run.status is AgentRunStatus.QUEUED
                    assert run.payload == {
                        "jobDescriptionImportDraftId": str(created.id),
                        "interactionLanguage": "en",
                    }

                parser_worker = worker(database, [parsed_output()])
                assert await parser_worker.process_one() is True

                async with database.sessionmaker() as session:
                    ready = await service(session).get_draft(
                        user_id=owner.id,
                        draft_id=created.id,
                    )
                assert ready.status == "ready"
                assert ready.can_apply is True
                assert ready.parsed_title == "Backend Engineer"
                assert ready.parsed_company == "Riva"
                assert ready.parsed_location == "Shanghai"
                assert ready.parsed_description == (
                    "Build reliable payment APIs with Python and PostgreSQL."
                )
                async with database.sessionmaker() as session:
                    persisted_ready = await session.get(
                        JobDescriptionImportDraft,
                        created.id,
                    )
                    succeeded_run = await session.get(
                        AgentRun,
                        created.agent_run_id,
                    )
                assert persisted_ready is not None
                assert persisted_ready.parsed_result is not None
                assert persisted_ready.parsed_result["responsibilities"] == [
                    "Build reliable payment APIs"
                ]
                assert succeeded_run is not None
                assert succeeded_run.status is AgentRunStatus.SUCCEEDED

                async with database.sessionmaker() as session:
                    first = await service(session).apply_draft(owner, created.id)
                assert first.status == "applied"
                assert first.can_apply is False
                assert first.applied_role_id is not None

                async with database.sessionmaker() as session:
                    repeated = await service(session).apply_draft(
                        owner,
                        created.id,
                    )
                assert repeated.applied_role_id == first.applied_role_id

                async with database.sessionmaker() as session:
                    role = await session.get(TargetRole, first.applied_role_id)
                    analysis = await session.get(
                        JobDescriptionAnalysis,
                        first.applied_role_id,
                    )
                    run_count = await session.scalar(
                        select(func.count()).select_from(AgentRun)
                    )
                    role_count = await session.scalar(
                        select(func.count()).select_from(TargetRole)
                    )
                assert role is not None
                assert role.title == "Backend Engineer"
                assert role.company == "Riva"
                assert role.location == "Shanghai"
                assert role.job_description_status == "saved"
                assert role.raw_job_description == RAW_JD.strip()
                assert role.job_description_version == 1
                assert role.job_description_parsing_run_id == created.agent_run_id
                assert analysis is not None
                assert analysis.source_agent_run_id == created.agent_run_id
                assert analysis.required_skills["programming_languages"] == [
                    "Python"
                ]
                assert run_count == 1
                assert role_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_parser_failure_marks_draft_failed_and_nonready_apply_is_rejected() -> None:
    async def run_test() -> None:
        async with Database(get_integration_database_url()) as database:
            await database.reset()
            try:
                owner = user()
                async with database.sessionmaker() as session:
                    session.add(owner)
                    await session.commit()
                    parsing = await service(session).create_draft(
                        owner,
                        JobDescriptionImportDraftCreate(raw_text=RAW_JD),
                    )

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as parsing_error:
                        await service(session).apply_draft(owner, parsing.id)
                assert parsing_error.value.status_code == 409
                assert parsing_error.value.error == IMPORT_DRAFT_NOT_READY

                parser_worker = worker(
                    database,
                    [LLMProviderConfigurationError()],
                )
                assert await parser_worker.process_one() is True

                async with database.sessionmaker() as session:
                    persisted_failure = await session.get(
                        JobDescriptionImportDraft,
                        parsing.id,
                    )
                assert persisted_failure is not None
                assert persisted_failure.status == "failed"
                assert (
                    persisted_failure.failure_reason
                    == "provider_configuration_error"
                )

                async with database.sessionmaker() as session:
                    failed = await service(session).get_draft(
                        user_id=owner.id,
                        draft_id=parsing.id,
                    )
                assert failed.status == "failed"
                assert failed.failure_reason == "provider_configuration_error"
                assert failed.can_apply is False

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as failed_error:
                        await service(session).apply_draft(owner, parsing.id)
                assert failed_error.value.status_code == 409
                assert failed_error.value.error == IMPORT_DRAFT_NOT_READY

                async with database.sessionmaker() as session:
                    draft = await session.get(
                        JobDescriptionImportDraft,
                        parsing.id,
                    )
                    run = await session.get(AgentRun, parsing.agent_run_id)
                assert draft is not None and draft.status == "failed"
                assert run is not None and run.status is AgentRunStatus.FAILED
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_import_routes_exist_and_manual_target_role_creation_is_unchanged() -> None:
    database_url = get_integration_database_url()
    owner = user()

    async def prepare() -> None:
        async with Database(database_url) as database:
            await database.reset()
            async with database.sessionmaker() as session:
                session.add(owner)
                await session.commit()

    asyncio.run(prepare())
    app = create_app(
        Settings(
            database_url=database_url,
            cors_allowed_origins=[TRUSTED_ORIGIN],
            session_digest_key="jd-import-api-test-key",
            session_cookie_secure=False,
            llm_provider="qwen",
            llm_model="fake-jd-model",
        )
    )
    app.dependency_overrides[require_current_user] = lambda: owner
    try:
        with TestClient(app) as client:
            imported = client.post(
                "/api/job-description-import-drafts",
                json={"rawText": RAW_JD},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert imported.status_code == 202
            imported_body = imported.json()
            assert imported_body["status"] == "parsing"

            fetched = client.get(
                "/api/job-description-import-drafts/"
                f"{imported_body['id']}"
            )
            assert fetched.status_code == 200
            assert fetched.json()["id"] == imported_body["id"]

            manual = client.post(
                "/api/roles",
                json={
                    "title": "Manual Product Engineer",
                    "company": None,
                    "recruitmentType": None,
                    "location": None,
                    "experienceRange": None,
                    "preparationStatus": "preparing",
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert manual.status_code == 201
            assert any(
                role["title"] == "Manual Product Engineer"
                for role in manual.json()["roles"]
            )
    finally:
        app.dependency_overrides.clear()

        async def cleanup() -> None:
            async with Database(database_url) as database:
                await database.reset()

        asyncio.run(cleanup())
