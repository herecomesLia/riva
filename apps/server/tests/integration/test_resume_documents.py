import asyncio
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import ResumeDocument, User
from riva.utils import utc_now

pytestmark = pytest.mark.integration


def user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def document(
    user_id: UUID,
    *,
    source_type: str = "file",
    original_filename: str | None = "resume.pdf",
    media_type: str = "application/pdf",
    byte_size: int = 1,
    sha256: str = "a" * 64,
    storage_key: str | None = "users/u/resumes/d/source",
    extraction_status: str = "pending",
    extracted_text: str | None = None,
    extraction_failure_code: str | None = None,
    extracted_at=None,
) -> ResumeDocument:
    return ResumeDocument(
        id=uuid4(),
        user_id=user_id,
        source_type=source_type,
        original_filename=original_filename,
        media_type=media_type,
        byte_size=byte_size,
        sha256=sha256,
        storage_key=storage_key,
        extraction_status=extraction_status,
        extracted_text=extracted_text,
        extraction_failure_code=extraction_failure_code,
        uploaded_at=utc_now(),
        extracted_at=extracted_at,
        created_at=utc_now(),
        updated_at=utc_now(),
    )


async def assert_rejected(database: Database, resume: ResumeDocument) -> None:
    async with database.sessionmaker() as session:
        session.add(resume)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
        remaining = await session.scalar(
            select(func.count())
            .select_from(ResumeDocument)
            .where(ResumeDocument.id == resume.id)
        )
        assert remaining == 0


def test_resume_document_constraints_cascade_and_rollback() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        first_user_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        second_user_id = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        first_user = user(first_user_id, "resume-first")
        second_user = user(second_user_id, "resume-second")

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add_all([first_user, second_user])
                    await session.commit()

                succeeded_at = utc_now()
                failed_at = utc_now()
                file_pending = document(
                    first_user_id,
                    storage_key="users/first/resumes/pending/source",
                )
                pasted_succeeded = document(
                    first_user_id,
                    source_type="pastedText",
                    original_filename=None,
                    media_type="text/plain",
                    sha256="b" * 64,
                    storage_key=None,
                    extraction_status="succeeded",
                    extracted_text="A pasted resume",
                    extracted_at=succeeded_at,
                )
                failed = document(
                    second_user_id,
                    sha256="c" * 64,
                    storage_key="users/second/resumes/failed/source",
                    extraction_status="failed",
                    extraction_failure_code="parser_failed",
                    extracted_at=failed_at,
                )
                same_content_first = document(
                    first_user_id,
                    sha256="d" * 64,
                    storage_key="users/first/resumes/same-content/source",
                )
                same_content_second = document(
                    second_user_id,
                    sha256="d" * 64,
                    storage_key="users/second/resumes/same-content/source",
                )

                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            file_pending,
                            pasted_succeeded,
                            failed,
                            same_content_first,
                            same_content_second,
                        ]
                    )
                    await session.commit()

                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        storage_key=None,
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        source_type="pastedText",
                        original_filename=None,
                        media_type="text/plain",
                        storage_key="users/first/resumes/pasted/source",
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        storage_key="users/first/resumes/pending-text/source",
                        extracted_text="not pending",
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        storage_key="users/first/resumes/empty/source",
                        extraction_status="succeeded",
                        extracted_text="   ",
                        extracted_at=utc_now(),
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        storage_key="users/first/resumes/missing-code/source",
                        extraction_status="failed",
                        extracted_at=utc_now(),
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        source_type="unsupported",
                        storage_key="users/first/resumes/unsupported/source",
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        extraction_status="unsupported",
                        storage_key="users/first/resumes/unsupported-status/source",
                    ),
                )
                await assert_rejected(
                    database,
                    document(
                        first_user_id,
                        storage_key="users/first/resumes/pending/source",
                    ),
                )

                async with database.sessionmaker() as session:
                    await session.execute(delete(User).where(User.id == first_user_id))
                    await session.commit()

                async with database.sessionmaker() as session:
                    first_user_documents = await session.scalar(
                        select(func.count())
                        .select_from(ResumeDocument)
                        .where(ResumeDocument.user_id == first_user_id)
                    )
                    second_user_documents = await session.scalar(
                        select(func.count())
                        .select_from(ResumeDocument)
                        .where(ResumeDocument.user_id == second_user_id)
                    )
                    assert first_user_documents == 0
                    assert second_user_documents == 2
            finally:
                await database.drop_tables()

    asyncio.run(run())
