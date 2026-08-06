import asyncio
from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage, ProviderUnavailableError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_parsing_lifecycle import (
    RESUME_PARSING_FAILURE_REASON,
    ResumeParsingLifecycleService,
)
from riva.utils import utc_now
from riva.workers import AgentWorker
from riva.workers.bootstrap import build_agent_handler_registry
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration

MODEL = "fake-resume-model"
RESUME_TEXT = "Python backend engineer resume"


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def make_user(user_id: UUID) -> User:
    suffix = user_id.hex[:16]
    return User(
        id=user_id,
        username=f"resume-lifecycle-{suffix}",
        normalized_username=f"resume-lifecycle-{suffix}",
        password_hash="hash",
        display_name="Resume Lifecycle User",
    )


def make_document(user_id: UUID, document_id: UUID) -> ResumeDocument:
    now = utc_now()
    return ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=len(RESUME_TEXT.encode()),
        sha256=(document_id.hex * 2)[:64],
        storage_key=None,
        extraction_status="succeeded",
        extracted_text=RESUME_TEXT,
        extraction_failure_code=None,
        uploaded_at=now,
        extracted_at=now,
        parsing_run_id=None,
        created_at=now,
        updated_at=now,
    )


def parsing_output(summary: str = "First durable result") -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary=summary,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        unresolved_items=[],
    )


def settings(database_url_value: str) -> Settings:
    return Settings(
        database_url=database_url_value,
        session_digest_key="resume-lifecycle-integration-key",
        llm_provider="qwen",
        llm_model=f"  {MODEL}  ",
        llm_api_key="fake-provider-key",
        llm_base_url="https://example.invalid/v1",
    )


def make_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = build_agent_handler_registry(
        settings(str(database.engine.url)),
        database.sessionmaker,
        provider_factory=lambda _settings: provider,
    )
    return AgentWorker(
        worker_id="resume-lifecycle-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(seconds=1),
        logger=SilentLogger(),
    )


async def seed_document(database: Database) -> tuple[UUID, UUID]:
    user_id = uuid4()
    document_id = uuid4()
    async with database.sessionmaker() as session:
        session.add_all(
            [
                make_user(user_id),
                make_document(user_id, document_id),
            ]
        )
        await session.commit()
    return user_id, document_id


async def start(
    database: Database,
    user_id: UUID,
    document_id: UUID,
) -> object:
    async with database.sessionmaker() as session:
        return await ResumeParsingLifecycleService(
            session,
            llm_provider="qwen",
            llm_model=MODEL,
        ).start(
            user_id=user_id,
            resume_document_id=document_id,
        )


async def status(
    database: Database,
    user_id: UUID,
    document_id: UUID,
) -> object:
    async with database.sessionmaker() as session:
        return await ResumeParsingLifecycleService(
            session,
            llm_provider="qwen",
            llm_model=MODEL,
        ).get_status(
            user_id=user_id,
            resume_document_id=document_id,
        )


async def _retry(
    database: Database,
    user_id: UUID,
    document_id: UUID,
) -> object:
    async with database.sessionmaker() as session:
        return await ResumeParsingLifecycleService(
            session,
            llm_provider="qwen",
            llm_model=MODEL,
        ).retry(
            user_id=user_id,
            resume_document_id=document_id,
        )


def test_start_is_idempotent_and_worker_reaches_succeeded() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed_document(database)
                first = await start(database, user_id, document_id)
                second = await start(database, user_id, document_id)

                assert first.status == "queued"
                assert second.status == "queued"
                assert second.run_id == first.run_id

                async with database.sessionmaker() as session:
                    run_count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(AgentRun.user_id == user_id)
                    )
                    document = await session.get(ResumeDocument, document_id)
                    assert run_count == 1
                    assert document is not None
                    assert document.parsing_run_id == first.run_id

                provider = FakeLLMProvider(
                    [parsing_output()],
                    provider="fake-resume-provider",
                    usage=LLMUsage(input_tokens=11, output_tokens=7),
                )
                assert await make_worker(database, provider).process_one() is True

                succeeded = await status(database, user_id, document_id)
                assert succeeded.status == "succeeded"
                assert succeeded.result_version == 1
                assert succeeded.draft_version == 1
                assert succeeded.draft_status == "ready"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_two_concurrent_starts_create_one_run() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed_document(database)

                async def one_start() -> object:
                    return await start(database, user_id, document_id)

                first, second = await asyncio.gather(one_start(), one_start())
                assert first.status == "queued"
                assert second.status == "queued"
                assert first.run_id == second.run_id

                async with database.sessionmaker() as session:
                    count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(AgentRun.user_id == user_id)
                    )
                    assert count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_failed_retry_preserves_old_artifacts_and_advances_versions() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed_document(database)
                initial = await start(database, user_id, document_id)
                first_provider = FakeLLMProvider([parsing_output()])
                assert await make_worker(database, first_provider).process_one() is True

                async with database.sessionmaker() as session:
                    first_run = await session.get(AgentRun, initial.run_id)
                    old_result = await session.get(
                        ResumeParsingResult,
                        document_id,
                    )
                    old_draft = await session.get(ResumeImportDraft, document_id)
                    assert first_run is not None
                    assert old_result is not None
                    assert old_draft is not None
                    old_draft_json = {
                        "summary": old_draft.summary,
                        "education": old_draft.education,
                        "skills": old_draft.skills,
                    }
                    first_run.status = AgentRunStatus.FAILED
                    first_run.attempt_count = 3
                    first_run.finished_at = datetime.now(UTC)
                    first_run.error_code = "provider_timeout"
                    first_run.result = None
                    first_run.provider = None
                    first_run.input_tokens = None
                    first_run.output_tokens = None
                    first_run.lease_owner = None
                    first_run.lease_token = None
                    first_run.lease_expires_at = None
                    await session.commit()

                failed = await status(database, user_id, document_id)
                assert failed.status == "failed"
                assert failed.error_code == "provider_timeout"
                assert failed.failure_reason == RESUME_PARSING_FAILURE_REASON
                assert failed.can_retry is True

                async with database.sessionmaker() as session:
                    retry_response = await ResumeParsingLifecycleService(
                        session,
                        llm_provider="qwen",
                        llm_model=MODEL,
                    ).retry(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )
                assert retry_response.status == "queued"
                assert retry_response.run_id != initial.run_id

                async with database.sessionmaker() as session:
                    stored_old_draft = await session.get(
                        ResumeImportDraft,
                        document_id,
                    )
                    assert stored_old_draft is not None
                    assert stored_old_draft.status == "superseded"
                    assert stored_old_draft.draft_version == 1
                    assert {
                        "summary": stored_old_draft.summary,
                        "education": stored_old_draft.education,
                        "skills": stored_old_draft.skills,
                    } == old_draft_json

                second_provider = FakeLLMProvider(
                    [parsing_output("Second durable result")]
                )
                assert (
                    await make_worker(database, second_provider).process_one()
                    is True
                )

                succeeded = await status(database, user_id, document_id)
                assert succeeded.status == "succeeded"
                assert succeeded.result_version == 2
                assert succeeded.draft_version == 2
                assert succeeded.draft_status == "ready"

                async with database.sessionmaker() as session:
                    document = await session.get(ResumeDocument, document_id)
                    result = await session.get(ResumeParsingResult, document_id)
                    assert document is not None
                    assert result is not None
                    assert document.parsing_run_id == retry_response.run_id
                    assert result.source_agent_run_id == retry_response.run_id
                    assert result.summary == "Second durable result"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_retry_can_continue_after_retry_run_fails_before_persisting_artifacts() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed_document(database)
                run_a_response = await start(database, user_id, document_id)

                assert await make_worker(
                    database,
                    FakeLLMProvider([parsing_output("Result A")]),
                ).process_one() is True

                async with database.sessionmaker() as session:
                    run_a = await session.get(AgentRun, run_a_response.run_id)
                    result_a = await session.get(
                        ResumeParsingResult,
                        document_id,
                    )
                    draft_a = await session.get(ResumeImportDraft, document_id)
                    assert run_a is not None
                    assert result_a is not None
                    assert draft_a is not None
                    assert draft_a.status == "ready"

                    run_a.status = AgentRunStatus.FAILED
                    run_a.attempt_count = run_a.max_attempts
                    run_a.finished_at = datetime.now(UTC)
                    run_a.error_code = "provider_timeout"
                    run_a.result = None
                    run_a.provider = None
                    run_a.input_tokens = None
                    run_a.output_tokens = None
                    run_a.lease_owner = None
                    run_a.lease_token = None
                    run_a.lease_expires_at = None
                    await session.commit()

                run_b_response = await _retry(database, user_id, document_id)
                assert run_b_response.status == "queued"
                assert run_b_response.run_id != run_a_response.run_id

                async with database.sessionmaker() as session:
                    stored_b = await session.get(AgentRun, run_b_response.run_id)
                    stored_result = await session.get(
                        ResumeParsingResult,
                        document_id,
                    )
                    stored_draft = await session.get(
                        ResumeImportDraft,
                        document_id,
                    )
                    assert stored_b is not None
                    assert stored_result is not None
                    assert stored_draft is not None
                    stored_b.max_attempts = 1
                    await session.commit()
                    result_source_before_b = stored_result.source_agent_run_id
                    draft_source_before_b = stored_draft.source_agent_run_id
                    draft_version_before_b = stored_draft.draft_version
                    draft_summary_before_b = stored_draft.summary

                assert result_source_before_b == run_a_response.run_id
                assert draft_source_before_b == run_a_response.run_id
                assert draft_version_before_b == 1

                b_provider = FakeLLMProvider([ProviderUnavailableError()])
                assert await make_worker(database, b_provider).process_one() is True
                assert len(b_provider.calls) == 1

                failed_b = await status(database, user_id, document_id)
                assert failed_b.status == "failed"

                run_c_response = await _retry(database, user_id, document_id)
                assert run_c_response.status == "queued"
                assert run_c_response.run_id not in {
                    run_a_response.run_id,
                    run_b_response.run_id,
                }

                async with database.sessionmaker() as session:
                    document = await session.get(ResumeDocument, document_id)
                    stored_result = await session.get(
                        ResumeParsingResult,
                        document_id,
                    )
                    stored_draft = await session.get(
                        ResumeImportDraft,
                        document_id,
                    )
                    assert document is not None
                    assert stored_result is not None
                    assert stored_draft is not None
                    assert document.parsing_run_id == run_c_response.run_id
                    assert stored_result.source_agent_run_id == run_a_response.run_id
                    assert stored_draft.source_agent_run_id == run_a_response.run_id
                    assert stored_draft.status == "superseded"
                    assert stored_draft.draft_version == draft_version_before_b
                    assert stored_draft.summary == draft_summary_before_b

                assert await make_worker(
                    database,
                    FakeLLMProvider([parsing_output("Result C")]),
                ).process_one() is True

                final = await status(database, user_id, document_id)
                assert final.status == "succeeded"
                assert final.result_version == 2
                assert final.draft_version == 2
                assert final.draft_status == "ready"

                async with database.sessionmaker() as session:
                    result_c = await session.get(
                        ResumeParsingResult,
                        document_id,
                    )
                    draft_c = await session.get(ResumeImportDraft, document_id)
                    run_count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(AgentRun.user_id == user_id)
                    )
                    assert result_c is not None
                    assert draft_c is not None
                    assert result_c.source_agent_run_id == run_c_response.run_id
                    assert result_c.summary == "Result C"
                    assert draft_c.source_agent_run_id == run_c_response.run_id
                    assert draft_c.status == "ready"
                    assert draft_c.draft_version == 2
                    assert run_count == 3
                    assert (
                        await session.get(AgentRun, run_a_response.run_id)
                        is not None
                    )
                    assert (
                        await session.get(AgentRun, run_b_response.run_id)
                        is not None
                    )
                    assert (
                        await session.get(AgentRun, run_c_response.run_id)
                        is not None
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_concurrent_retry_requests_are_idempotent() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed_document(database)
                initial = await start(database, user_id, document_id)

                async with database.sessionmaker() as session:
                    current = await session.get(AgentRun, initial.run_id)
                    assert current is not None
                    current.status = AgentRunStatus.FAILED
                    current.attempt_count = 3
                    current.started_at = datetime.now(UTC)
                    current.finished_at = datetime.now(UTC)
                    current.error_code = "provider_timeout"
                    await session.commit()

                async def one_retry() -> object:
                    async with database.sessionmaker() as session:
                        return await ResumeParsingLifecycleService(
                            session,
                            llm_provider="qwen",
                            llm_model=MODEL,
                        ).retry(
                            user_id=user_id,
                            resume_document_id=document_id,
                        )

                first, second = await asyncio.gather(one_retry(), one_retry())
                assert first.status == "queued"
                assert second.status == "queued"
                assert first.run_id == second.run_id
                async with database.sessionmaker() as session:
                    count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(AgentRun.user_id == user_id)
                    )
                    assert count == 2
            finally:
                await database.reset()

    asyncio.run(run_test())
