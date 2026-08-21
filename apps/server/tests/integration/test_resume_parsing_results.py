import asyncio
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import AgentRun, ResumeDocument, ResumeParsingResult, User
from riva.prompts import RESUME_PARSING_PROMPT
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
        username=f"resume-result-{suffix}",
        normalized_username=f"resume-result-{suffix}",
        password_hash="hash",
        display_name="Resume Result Test",
    )


def make_run(user_id: UUID, document_id: UUID, suffix: str) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT.prompt_id,
        prompt_version="2",
        output_schema_id=RESUME_PARSING_PROMPT.output_schema_id,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"resume-result-run-{suffix}-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )


def make_document(
    user_id: UUID,
    run_id: UUID,
    *,
    status: str = "succeeded",
    text: str | None = "Normalized resume text",
    suffix: str,
) -> ResumeDocument:
    now = utc_now()
    return ResumeDocument(
        id=uuid4(),
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256=(suffix * 64)[:64],
        storage_key=None,
        extraction_status=status,
        extracted_text=text if status == "succeeded" else None,
        extraction_failure_code=(None if status == "succeeded" else "failed"),
        uploaded_at=now,
        extracted_at=now,
        created_at=now,
        updated_at=now,
        parsing_run_id=run_id,
    )


def make_result(
    owner_id: UUID,
    document_id: UUID,
    source_run_id: UUID,
    *,
    result_version: int = 1,
) -> ResumeParsingResult:
    now = utc_now()
    return ResumeParsingResult(
        resume_document_id=document_id,
        user_id=owner_id,
        result_version=result_version,
        source_agent_run_id=source_run_id,
        parsed_at=now,
        summary=None,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


def test_resume_parsing_result_constraints_and_cascades() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            first_user_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
            second_user_id = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
            first_user = make_user(first_user_id, "first")
            second_user = make_user(second_user_id, "second")

            async with database.sessionmaker() as session:
                session.add_all([first_user, second_user])
                await session.commit()

            first_document_id = uuid4()
            first_run = make_run(first_user_id, first_document_id, "first")
            first_document = ResumeDocument(
                id=first_document_id,
                user_id=first_user_id,
                source_type="pastedText",
                original_filename=None,
                media_type="text/plain",
                byte_size=1,
                sha256="a" * 64,
                storage_key=None,
                extraction_status="succeeded",
                extracted_text="Resume",
                extraction_failure_code=None,
                uploaded_at=utc_now(),
                extracted_at=utc_now(),
                created_at=utc_now(),
                updated_at=utc_now(),
                parsing_run_id=first_run.id,
            )
            second_document_id = uuid4()
            second_run = make_run(first_user_id, second_document_id, "second")
            second_document = make_document(
                first_user_id,
                second_run.id,
                suffix="b",
            )
            second_document.id = second_document_id

            async with database.sessionmaker() as session:
                session.add_all(
                    [
                        first_run,
                        first_document,
                        make_result(
                            first_user_id,
                            first_document.id,
                            first_run.id,
                        ),
                    ]
                )
                await session.commit()

            async with database.sessionmaker() as session:
                session.add_all([second_run, second_document])
                await session.commit()

            async with database.sessionmaker() as session:
                stored = await session.get(
                    ResumeParsingResult,
                    first_document.id,
                )
                assert stored is not None
                assert stored.summary is None
                assert stored.skills == ["Python"]
                assert stored.education == []

            async with database.sessionmaker() as session:
                invalid_version = make_result(
                    first_user_id,
                    second_document.id,
                    second_run.id,
                    result_version=0,
                )
                session.add(invalid_version)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            async with database.sessionmaker() as session:
                wrong_owner = make_result(
                    second_user_id,
                    second_document.id,
                    second_run.id,
                )
                session.add(wrong_owner)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            async with database.sessionmaker() as session:
                duplicate_source = make_result(
                    first_user_id,
                    second_document.id,
                    first_run.id,
                )
                session.add(duplicate_source)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            async with database.sessionmaker() as session:
                duplicate_pointer_document = make_document(
                    first_user_id,
                    first_run.id,
                    suffix="c",
                )
                session.add(duplicate_pointer_document)
                with pytest.raises(IntegrityError):
                    await session.commit()
                await session.rollback()

            async with database.sessionmaker() as session:
                session.add(
                    make_result(
                        first_user_id,
                        second_document.id,
                        second_run.id,
                    )
                )
                await session.commit()

            async with database.sessionmaker() as session:
                await session.execute(
                    delete(ResumeDocument).where(ResumeDocument.id == first_document.id)
                )
                await session.commit()
                assert await session.get(ResumeParsingResult, first_document.id) is None

            async with database.sessionmaker() as session:
                await session.execute(delete(User).where(User.id == first_user_id))
                await session.commit()
                assert (
                    await session.scalar(
                        select(ResumeDocument.id).where(
                            ResumeDocument.user_id == first_user_id
                        )
                    )
                    is None
                )
                assert (
                    await session.scalar(
                        select(ResumeParsingResult.resume_document_id).where(
                            ResumeParsingResult.user_id == first_user_id
                        )
                    )
                    is None
                )

    asyncio.run(run())
