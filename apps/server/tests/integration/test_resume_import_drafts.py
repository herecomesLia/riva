import asyncio
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import (
    AgentRun,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.prompts import RESUME_PARSING_PROMPT_V1
from riva.schemas.resume_imports import ResumeImportDraftData
from riva.utils import utc_now


pytestmark = pytest.mark.integration


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
        username=f"resume-import-{suffix}",
        normalized_username=f"resume-import-{suffix}",
        password_hash="hash",
        display_name="Resume Import Test",
    )


def make_run(user_id: UUID, document_id: UUID, suffix: str) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V1.prompt_id,
        prompt_version=RESUME_PARSING_PROMPT_V1.version,
        output_schema_id=RESUME_PARSING_PROMPT_V1.output_schema_id,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"resume-import-{suffix}-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )


def make_document(user_id: UUID, document_id: UUID, run_id: UUID, suffix: str):
    now = utc_now()
    return ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256=(suffix * 64)[:64],
        storage_key=None,
        extraction_status="succeeded",
        extracted_text="Resume text",
        extraction_failure_code=None,
        uploaded_at=now,
        extracted_at=now,
        parsing_run_id=run_id,
        created_at=now,
        updated_at=now,
    )


def make_result(
    user_id: UUID,
    document_id: UUID,
    run_id: UUID,
    *,
    result_version: int = 1,
) -> ResumeParsingResult:
    now = utc_now()
    return ResumeParsingResult(
        resume_document_id=document_id,
        user_id=user_id,
        result_version=result_version,
        source_agent_run_id=run_id,
        parsed_at=now,
        summary="Parsed",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


def make_draft(
    user_id: UUID,
    document_id: UUID,
    run_id: UUID,
    *,
    status: str = "ready",
    base_profile_id: UUID | None = None,
    base_profile_version: int | None = None,
    applied_profile_version: int | None = None,
    applied_at=None,
) -> ResumeImportDraft:
    now = utc_now()
    return ResumeImportDraft(
        resume_document_id=document_id,
        user_id=user_id,
        parsing_result_version=1,
        source_agent_run_id=run_id,
        base_profile_id=base_profile_id,
        base_profile_version=base_profile_version,
        draft_version=1,
        status=status,
        summary="Parsed",
        summary_action="set",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[{"id": str(uuid4()), "name": "Python"}],
        unresolved_items=[],
        skipped_items=[],
        protected_items=[],
        change_summary={"new_items": 0, "changed_items": 0, "missing_items": 0},
        applied_profile_version=applied_profile_version,
        applied_at=applied_at,
        created_at=now,
        updated_at=now,
    )


async def seed(database: Database, suffix: str):
    user_id = uuid4()
    document_id = uuid4()
    owner = make_user(user_id, suffix)
    run = make_run(user_id, document_id, suffix)
    document = make_document(user_id, document_id, run.id, suffix[0])
    result = make_result(user_id, document_id, run.id)
    async with database.sessionmaker() as session:
        session.add_all([owner, run, document, result])
        await session.commit()
    return owner, document, run, result


def test_resume_import_draft_constraints_cascades_and_json_round_trip() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            owner, document, agent_run, result = await seed(database, "base")

            async with database.sessionmaker() as session:
                draft = make_draft(
                    owner.id,
                    document.id,
                    agent_run.id,
                )
                session.add(draft)
                await session.commit()

            async with database.sessionmaker() as session:
                stored = await session.get(ResumeImportDraft, document.id)
                assert stored is not None
                parsed = ResumeImportDraftData.model_validate(
                    {
                        "summary": stored.summary,
                        "summary_action": stored.summary_action,
                        "education": stored.education,
                        "work_experiences": stored.work_experiences,
                        "project_experiences": stored.project_experiences,
                        "skills": stored.skills,
                        "unresolved_items": stored.unresolved_items,
                        "skipped_items": stored.skipped_items,
                        "protected_items": stored.protected_items,
                        "change_summary": stored.change_summary,
                    }
                )
                assert parsed.skills[0].name == "Python"

            check_owner, check_document, check_run, _ = await seed(
                database,
                "checks",
            )
            async with database.sessionmaker() as session:
                invalid_status = make_draft(
                    check_owner.id,
                    check_document.id,
                    check_run.id,
                    status="invalid",
                )
                session.add(invalid_status)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

                invalid_summary_action = make_draft(
                    check_owner.id,
                    check_document.id,
                    check_run.id,
                )
                invalid_summary_action.summary_action = "overwrite"
                session.add(invalid_summary_action)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

                half_profile = make_draft(
                    check_owner.id,
                    check_document.id,
                    check_run.id,
                    base_profile_id=uuid4(),
                )
                session.add(half_profile)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

                invalid_applied = make_draft(
                    check_owner.id,
                    check_document.id,
                    check_run.id,
                    status="applied",
                )
                session.add(invalid_applied)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            other_owner = make_user(uuid4(), "other-owner")
            async with database.sessionmaker() as session:
                session.add(other_owner)
                await session.commit()
            async with database.sessionmaker() as session:
                wrong_owner = make_draft(
                    other_owner.id,
                    document.id,
                    agent_run.id,
                )
                session.add(wrong_owner)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            no_result_owner = make_user(uuid4(), "no-result")
            no_result_document_id = uuid4()
            no_result_run = make_run(
                no_result_owner.id,
                no_result_document_id,
                "no-result",
            )
            no_result_document = make_document(
                no_result_owner.id,
                no_result_document_id,
                no_result_run.id,
                "c",
            )
            async with database.sessionmaker() as session:
                session.add_all([no_result_owner, no_result_run, no_result_document])
                await session.commit()
            async with database.sessionmaker() as session:
                no_result_draft = make_draft(
                    no_result_owner.id,
                    no_result_document_id,
                    no_result_run.id,
                )
                session.add(no_result_draft)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            second_document_id = uuid4()
            second_run = make_run(owner.id, second_document_id, "second")
            second_document = make_document(
                owner.id,
                second_document_id,
                second_run.id,
                "b",
            )
            second_result = make_result(
                owner.id,
                second_document_id,
                second_run.id,
            )
            async with database.sessionmaker() as session:
                session.add_all([second_run, second_document, second_result])
                await session.commit()

            async with database.sessionmaker() as session:
                duplicate_source = make_draft(
                    owner.id,
                    second_document_id,
                    agent_run.id,
                )
                session.add(duplicate_source)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            async with database.sessionmaker() as session:
                await session.execute(
                    delete(ResumeParsingResult).where(
                        ResumeParsingResult.resume_document_id == document.id
                    )
                )
                await session.commit()
                assert await session.get(ResumeImportDraft, document.id) is None

            async with database.sessionmaker() as session:
                session.add(make_result(owner.id, document.id, agent_run.id))
                await session.commit()

            async with database.sessionmaker() as session:
                session.add(make_draft(owner.id, document.id, agent_run.id))
                await session.commit()
                await session.execute(
                    delete(ResumeDocument).where(ResumeDocument.id == document.id)
                )
                await session.commit()
                assert await session.get(ResumeImportDraft, document.id) is None
                assert await session.get(ResumeParsingResult, document.id) is None

    asyncio.run(run())
