import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import AgentRun, ResumeDocument, ResumeParsingResult, User
from riva.prompts import RESUME_PARSING_PROMPT_V4
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_parsing import (
    RESUME_DOCUMENT_NOT_FOUND,
    RESUME_DOCUMENT_NOT_READY,
    RESUME_PARSING_RESULT_CONFLICT,
    RESUME_PARSING_SUPERSEDED,
    ResumeParsingService,
    ResumeParsingStateError,
)
from riva.utils import utc_now


pytestmark = pytest.mark.integration
GENERATED_AT = datetime(2026, 8, 5, 11, 0, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def make_user(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=f"resume-service-{suffix}",
        normalized_username=f"resume-service-{suffix}",
        password_hash="hash",
        display_name="Resume Service Test",
    )


def make_run(user_id: UUID, document_id: UUID, suffix: str) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V4.prompt_id,
        prompt_version=RESUME_PARSING_PROMPT_V4.version,
        output_schema_id=RESUME_PARSING_PROMPT_V4.output_schema_id,
        payload={
            "resumeDocumentId": str(document_id),
            "interactionLanguage": "zh-CN",
        },
        idempotency_key=f"resume-service-run-{suffix}-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )


def make_document(
    user_id: UUID,
    document_id: UUID,
    run_id: UUID,
    *,
    extraction_status: str = "succeeded",
    extracted_text: str | None = "Extracted resume text",
) -> ResumeDocument:
    now = utc_now()
    succeeded = extraction_status == "succeeded"
    return ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256=(str(document_id).replace("-", "") + "0" * 64)[:64],
        storage_key=None,
        extraction_status=extraction_status,
        extracted_text=extracted_text if succeeded else None,
        extraction_failure_code=None if succeeded else "extraction_failed",
        uploaded_at=now,
        extracted_at=now,
        created_at=now,
        updated_at=now,
        parsing_run_id=run_id,
    )


def output(summary: str | None = "Parsed summary") -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary=summary,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


async def seed(
    database: Database,
    suffix: str,
    *,
    extraction_status: str = "succeeded",
) -> tuple[User, ResumeDocument, AgentRun]:
    owner = make_user(uuid4(), suffix)
    document_id = uuid4()
    run = make_run(owner.id, document_id, suffix)
    document = make_document(
        owner.id,
        document_id,
        run.id,
        extraction_status=extraction_status,
    )
    async with database.sessionmaker() as session:
        session.add_all([owner, run, document])
        await session.commit()
    return owner, document, run


def test_service_loads_and_persists_database_resume_text_and_result() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, agent_run = await seed(database, "basic")

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, agent_run.id)
                assert stored_run is not None
                loaded = await ResumeParsingService(session).load_input(stored_run)
                assert loaded.resume_text == document.extracted_text

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, agent_run.id)
                assert stored_run is not None
                persisted = await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_run, output())
                assert persisted.result_version == 1
                assert persisted.user_id == owner.id
                assert persisted.resume_document_id == document.id

            async with database.sessionmaker() as session:
                stored_document = await session.get(ResumeDocument, document.id)
                stored_result = await session.get(
                    ResumeParsingResult,
                    document.id,
                )
                assert stored_document is not None
                assert stored_result is not None
                assert stored_document.extraction_status == "succeeded"
                assert stored_document.extracted_text == document.extracted_text
                assert stored_result.summary == "Parsed summary"
                assert stored_result.skills == ["Python"]
                assert stored_result.parsed_at == GENERATED_AT
                parsed_output = ResumeParsingOutput.model_validate(
                    {
                        "summary": stored_result.summary,
                        "education": stored_result.education,
                        "work_experiences": stored_result.work_experiences,
                        "project_experiences": stored_result.project_experiences,
                        "skills": stored_result.skills,
                        "unresolved_items": stored_result.unresolved_items,
                    }
                )
                assert parsed_output.skills == ["Python"]

    asyncio.run(run())


def test_same_run_is_idempotent_and_new_run_overwrites_version() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, agent_run = await seed(database, "retry")

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, agent_run.id)
                assert stored_run is not None
                await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_run, output("first"))

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, agent_run.id)
                assert stored_run is not None
                persisted = await ResumeParsingService(
                    session,
                    clock=lambda: (_ for _ in ()).throw(
                        AssertionError("idempotent path called clock")
                    ),
                ).persist_success(stored_run, output("different"))
                assert persisted.result_version == 1
                assert persisted.summary == "first"

            replacement_run = make_run(owner.id, document.id, "replacement")
            async with database.sessionmaker() as session:
                stored_document = await session.get(ResumeDocument, document.id)
                assert stored_document is not None
                session.add(replacement_run)
                stored_document.parsing_run_id = replacement_run.id
                await session.commit()

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, replacement_run.id)
                assert stored_run is not None
                persisted = await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_run, output("replacement"))
                assert persisted.result_version == 2
                assert persisted.source_agent_run_id == replacement_run.id

            async with database.sessionmaker() as session:
                results = list(
                    (
                        await session.scalars(
                            select(ResumeParsingResult)
                        )
                    ).all()
                )
                assert len(results) == 1

    asyncio.run(run())


def test_superseded_run_is_rejected_then_current_run_succeeds() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, old_run = await seed(database, "superseded")
            replacement_run = make_run(owner.id, document.id, "current")

            async with database.sessionmaker() as session:
                stored_document = await session.get(ResumeDocument, document.id)
                assert stored_document is not None
                session.add(replacement_run)
                stored_document.parsing_run_id = replacement_run.id
                await session.commit()

            async with database.sessionmaker() as session:
                stored_old_run = await session.get(AgentRun, old_run.id)
                assert stored_old_run is not None
                with pytest.raises(ResumeParsingStateError) as exc_info:
                    await ResumeParsingService(
                        session,
                        clock=lambda: GENERATED_AT,
                    ).persist_success(stored_old_run, output())
                assert exc_info.value.code == RESUME_PARSING_SUPERSEDED

            async with database.sessionmaker() as session:
                stored_new_run = await session.get(AgentRun, replacement_run.id)
                assert stored_new_run is not None
                await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_new_run, output())

            async with database.sessionmaker() as session:
                stored_result = await session.get(
                    ResumeParsingResult,
                    document.id,
                )
                assert stored_result is not None
                assert stored_result.source_agent_run_id == replacement_run.id

    asyncio.run(run())


def test_two_sessions_observe_pointer_switch_without_stale_success() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, old_run = await seed(database, "concurrent-a")
            replacement_run = make_run(owner.id, document.id, "concurrent-b")

            async with database.sessionmaker() as session_a:
                stored_old_run = await session_a.get(AgentRun, old_run.id)
                assert stored_old_run is not None
                loaded = await ResumeParsingService(session_a).load_input(
                    stored_old_run
                )
                assert loaded.resume_text == document.extracted_text

                async with database.sessionmaker() as session_b:
                    stored_document = await session_b.get(
                        ResumeDocument,
                        document.id,
                    )
                    assert stored_document is not None
                    session_b.add(replacement_run)
                    stored_document.parsing_run_id = replacement_run.id
                    await session_b.commit()

                with pytest.raises(ResumeParsingStateError) as exc_info:
                    await ResumeParsingService(
                        session_a,
                        clock=lambda: GENERATED_AT,
                    ).persist_success(stored_old_run, output("stale"))
                assert exc_info.value.code == RESUME_PARSING_SUPERSEDED

            async with database.sessionmaker() as session_b:
                stored_new_run = await session_b.get(AgentRun, replacement_run.id)
                assert stored_new_run is not None
                persisted = await ResumeParsingService(
                    session_b,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_new_run, output("current"))
                assert persisted.result_version == 1
                assert persisted.source_agent_run_id == replacement_run.id

            async with database.sessionmaker() as session:
                stored_result = await session.get(
                    ResumeParsingResult,
                    document.id,
                )
                assert stored_result is not None
                assert stored_result.summary == "current"
                assert stored_result.source_agent_run_id == replacement_run.id

    asyncio.run(run())


def test_service_enforces_isolation_readiness_conflict_and_rollback() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, agent_run = await seed(database, "errors")

            other_owner = make_user(uuid4(), "other")
            async with database.sessionmaker() as session:
                session.add(other_owner)
                await session.commit()

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, agent_run.id)
                assert stored_run is not None
                stored_run.payload["resumeDocumentId"] = str(uuid4())
                await session.commit()
                with pytest.raises(ResumeParsingStateError) as exc_info:
                    await ResumeParsingService(session).load_input(stored_run)
                assert exc_info.value.code == RESUME_DOCUMENT_NOT_FOUND

            await database.reset()
            _, failed_document, failed_run = await seed(
                database,
                "failed",
                extraction_status="failed",
            )
            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, failed_run.id)
                assert stored_run is not None
                with pytest.raises(ResumeParsingStateError) as exc_info:
                    await ResumeParsingService(session).load_input(stored_run)
                assert exc_info.value.code == RESUME_DOCUMENT_NOT_READY
                assert failed_document.id

            await database.reset()
            owner, first_document, first_run = await seed(database, "conflict-a")
            second_document_id = uuid4()
            second_run = make_run(owner.id, second_document_id, "conflict-b")
            second_document = make_document(
                owner.id,
                second_document_id,
                second_run.id,
            )
            async with database.sessionmaker() as session:
                session.add_all(
                    [
                        second_run,
                        second_document,
                        ResumeParsingResult(
                            resume_document_id=second_document.id,
                            user_id=owner.id,
                            result_version=1,
                            source_agent_run_id=first_run.id,
                            parsed_at=GENERATED_AT,
                            summary=None,
                            education=[],
                            work_experiences=[],
                            project_experiences=[],
                            skills=[],
                            unresolved_items=[],
                        ),
                    ]
                )
                await session.commit()

            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, first_run.id)
                assert stored_run is not None
                with pytest.raises(ResumeParsingStateError) as exc_info:
                    await ResumeParsingService(
                        session,
                        clock=lambda: GENERATED_AT,
                    ).persist_success(stored_run, output())
                assert exc_info.value.code == RESUME_PARSING_RESULT_CONFLICT

            await database.reset()
            _, rollback_document, rollback_run = await seed(database, "rollback")
            invalid_output = output()
            invalid_output.skills = [str(uuid4())]
            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, rollback_run.id)
                assert stored_run is not None
                with pytest.raises(ResumeParsingStateError):
                    await ResumeParsingService(
                        session,
                        clock=lambda: GENERATED_AT,
                    ).persist_success(stored_run, invalid_output)

            async with database.sessionmaker() as session:
                assert (
                    await session.get(
                        ResumeParsingResult,
                        rollback_document.id,
                    )
                    is None
                )

    asyncio.run(run())


def test_two_documents_can_persist_identical_parsed_content() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner_a, document_a, run_a = await seed(database, "same-a")
            owner_b, document_b, run_b = await seed(database, "same-b")
            assert owner_a.id != owner_b.id

            async with database.sessionmaker() as session:
                stored_run_a = await session.get(AgentRun, run_a.id)
                assert stored_run_a is not None
                await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_run_a, output())

            async with database.sessionmaker() as session:
                stored_run_b = await session.get(AgentRun, run_b.id)
                assert stored_run_b is not None
                await ResumeParsingService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(stored_run_b, output())

            async with database.sessionmaker() as session:
                results = list(
                    (await session.scalars(select(ResumeParsingResult))).all()
                )
                assert {item.resume_document_id for item in results} == {
                    document_a.id,
                    document_b.id,
                }
                assert [item.skills for item in results] == [["Python"], ["Python"]]

    asyncio.run(run())
