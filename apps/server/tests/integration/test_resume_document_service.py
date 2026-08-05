import asyncio
from io import BytesIO
import os
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pypdf import PdfWriter
from sqlalchemy import select

from riva.db.database import Database
from riva.models import ResumeDocument, User
from riva.resumes import DefaultResumeTextExtractor
from riva.services.resume_documents import ResumeDocumentService
from riva.storage import LocalResumeObjectStorage, build_resume_storage_key
from tests.unit.resumes.test_extraction import make_docx, make_pdf


pytestmark = pytest.mark.integration


TEST_USER_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
SECOND_USER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def create_user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def encrypted_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.encrypt("secret")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_resume_document_service_with_postgres_and_local_storage(
    tmp_path: Path,
) -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        storage = LocalResumeObjectStorage(tmp_path / "resumes")
        extractor = DefaultResumeTextExtractor()
        user = create_user(TEST_USER_ID, "service-first")
        second_user = create_user(SECOND_USER_ID, "service-second")

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add_all([user, second_user])
                    await session.commit()

                async with database.sessionmaker() as session:
                    service = ResumeDocumentService(
                        session,
                        storage,
                        extractor,
                        max_upload_bytes=10 * 1024 * 1024,
                        max_extracted_characters=100_000,
                    )
                    txt = await service.create_file_document(
                        user,
                        file_obj=BytesIO("中文简历".encode()),
                        original_filename="resume.txt",
                        declared_media_type="text/plain",
                    )
                    pdf = await service.create_file_document(
                        user,
                        file_obj=BytesIO(make_pdf(["PDF resume"])),
                        original_filename="resume.pdf",
                        declared_media_type="application/pdf",
                    )
                    docx = await service.create_file_document(
                        user,
                        file_obj=BytesIO(make_docx()),
                        original_filename="resume.docx",
                        declared_media_type=(
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        ),
                    )

                    assert txt.extraction_status == "succeeded"
                    assert pdf.extraction_status == "succeeded"
                    assert docx.extraction_status == "succeeded"
                    assert txt.media_type == "text/plain"
                    assert pdf.media_type == "application/pdf"
                    assert docx.media_type.endswith("wordprocessingml.document")

                    for response in (txt, pdf, docx):
                        key = build_resume_storage_key(user.id, response.id)
                        assert (tmp_path / "resumes" / Path(key)).is_file()

                    failed = await service.create_file_document(
                        user,
                        file_obj=BytesIO(encrypted_pdf()),
                        original_filename="encrypted.pdf",
                        declared_media_type="application/pdf",
                    )
                    fake_format = await service.create_file_document(
                        user,
                        file_obj=BytesIO(b"plain text"),
                        original_filename="fake.pdf",
                        declared_media_type="application/pdf",
                    )
                    assert failed.extraction_status == "failed"
                    assert fake_format.extraction_status == "failed"

                    stored_before_paste = sorted(
                        path for path in (tmp_path / "resumes").rglob("source")
                    )
                    pasted = await service.create_pasted_text_document(
                        user,
                        text="  pasted resume  ",
                    )
                    stored_after_paste = sorted(
                        path for path in (tmp_path / "resumes").rglob("source")
                    )
                    assert pasted.extraction_status == "succeeded"
                    assert pasted.source_type == "pastedText"
                    assert stored_after_paste == stored_before_paste

                    duplicate_one = await service.create_file_document(
                        user,
                        file_obj=BytesIO(b"duplicate content"),
                        original_filename="one.txt",
                        declared_media_type="text/plain",
                    )
                    duplicate_two = await service.create_file_document(
                        user,
                        file_obj=BytesIO(b"duplicate content"),
                        original_filename="two.txt",
                        declared_media_type="text/plain",
                    )
                    assert duplicate_one.id != duplicate_two.id

                    listed = await service.list_documents(user, limit=100)
                    second_user_list = await service.list_documents(
                        second_user,
                        limit=100,
                    )
                    assert len(listed.documents) == 8
                    assert second_user_list.documents == []

                    stored_rows = (
                        await session.execute(
                            select(ResumeDocument).where(
                                ResumeDocument.user_id == user.id
                            )
                        )
                    ).scalars().all()
                    assert len(stored_rows) == 8
                    assert sum(row.extraction_status == "failed" for row in stored_rows) == 2
                    rows_by_id = {row.id: row for row in stored_rows}
                    assert rows_by_id[pasted.id].storage_key is None
                    assert rows_by_id[duplicate_one.id].sha256 == rows_by_id[
                        duplicate_two.id
                    ].sha256
                    assert rows_by_id[duplicate_one.id].storage_key != rows_by_id[
                        duplicate_two.id
                    ].storage_key
            finally:
                await database.drop_tables()

    asyncio.run(run())
