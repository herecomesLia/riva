import asyncio
import io
import threading
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from riva.core.errors import APIError
from riva.models import ResumeDocument, User
from riva.resumes import (
    TEXT_PLAIN,
    ExtractedResumeText,
    ResumeExtractionError,
)
from riva.services.resume_documents import (
    RESUME_EXTRACTION_FAILURE_REASON,
    LoadedResumeText,
    ResumeDocumentService,
    ResumeDocumentStateError,
    normalize_resume_filename,
)
from riva.storage import (
    RESUME_FILE_EMPTY,
    RESUME_FILE_TOO_LARGE,
    RESUME_STORAGE_COLLISION,
    RESUME_STORAGE_UNAVAILABLE,
    LocalResumeObjectStorage,
    ResumeStorageError,
    StoredResumeObject,
    build_resume_storage_key,
)
from riva.utils import utc_now


class FakeResult:
    def __init__(
        self,
        documents: list[ResumeDocument],
        document: ResumeDocument | None = None,
    ) -> None:
        self.documents = documents
        self.document = document

    def scalars(self) -> "FakeResult":
        return self

    def all(self) -> list[ResumeDocument]:
        return self.documents

    def scalar_one_or_none(self) -> ResumeDocument | None:
        return self.document


class FakeSession:
    def __init__(
        self,
        *,
        documents: list[ResumeDocument] | None = None,
        document: ResumeDocument | None = None,
        flush_error: BaseException | None = None,
        commit_error: BaseException | None = None,
    ) -> None:
        self.documents = documents or []
        self.document = document
        self.flush_error = flush_error
        self.commit_error = commit_error
        self.statements: list[object] = []
        self.added: list[ResumeDocument] = []
        self.flush_count = 0
        self.commit_count = 0
        self.rollback_count = 0

    async def execute(self, statement: object) -> FakeResult:
        self.statements.append(statement)
        return FakeResult(self.documents, self.document)

    def add(self, document: ResumeDocument) -> None:
        self.added.append(document)

    async def flush(self) -> None:
        self.flush_count += 1
        if self.flush_error is not None:
            raise self.flush_error

    async def commit(self) -> None:
        if self.commit_error is not None:
            raise self.commit_error
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


class FakeStorage:
    def __init__(
        self,
        payload: bytes = b"stored bytes",
        *,
        store_error: BaseException | None = None,
        read_error: BaseException | None = None,
        delete_error: BaseException | None = None,
    ) -> None:
        self.payload = payload
        self.store_error = store_error
        self.read_error = read_error
        self.delete_error = delete_error
        self.store_calls: list[tuple[str, object, int]] = []
        self.read_calls: list[str] = []
        self.delete_calls: list[str] = []

    async def store_file(
        self,
        key: str,
        file_obj,
        max_bytes: int,
    ) -> StoredResumeObject:
        self.store_calls.append((key, file_obj, max_bytes))
        if self.store_error is not None:
            raise self.store_error
        return StoredResumeObject(
            key=key,
            byte_size=len(self.payload),
            sha256=sha256(self.payload).hexdigest(),
        )

    async def read_bytes(self, key: str) -> bytes:
        self.read_calls.append(key)
        if self.read_error is not None:
            raise self.read_error
        return self.payload

    async def delete(self, key: str) -> None:
        self.delete_calls.append(key)
        if self.delete_error is not None:
            raise self.delete_error


class FakeExtractor:
    def __init__(
        self,
        result: ExtractedResumeText | None = None,
        *,
        error: BaseException | None = None,
    ) -> None:
        self.result = result or ExtractedResumeText(TEXT_PLAIN, "Resume")
        self.error = error
        self.calls: list[tuple[bytes, str | None, int]] = []

    async def extract(
        self,
        data: bytes,
        *,
        declared_media_type: str | None,
        max_characters: int,
    ) -> ExtractedResumeText:
        self.calls.append((data, declared_media_type, max_characters))
        if self.error is not None:
            raise self.error
        return self.result


class BlockingSource(io.BytesIO):
    def __init__(self, value: bytes) -> None:
        super().__init__(value)
        self.started = threading.Event()
        self.release = threading.Event()

    def read(self, size: int = -1) -> bytes:
        self.started.set()
        if not self.release.wait(timeout=5):
            raise OSError("controlled source was not released")
        return super().read(size)


class CompletionGatedLocalStorage(LocalResumeObjectStorage):
    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.published = asyncio.Event()
        self.release = asyncio.Event()

    async def store_file(
        self,
        key: str,
        file_obj,
        max_bytes: int,
    ) -> StoredResumeObject:
        stored = await super().store_file(key, file_obj, max_bytes)
        self.published.set()
        await self.release.wait()
        return stored


class DeletionGatedLocalStorage(LocalResumeObjectStorage):
    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.delete_started = asyncio.Event()
        self.delete_release = asyncio.Event()

    async def delete(self, key: str) -> None:
        self.delete_started.set()
        await self.delete_release.wait()
        await super().delete(key)


def create_user(user_id: UUID | None = None) -> User:
    return User(
        id=user_id or uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def create_service(
    *,
    session: FakeSession | None = None,
    storage: FakeStorage | None = None,
    extractor: FakeExtractor | None = None,
    document_id: UUID | None = None,
) -> tuple[ResumeDocumentService, FakeSession, FakeStorage, FakeExtractor]:
    session = session or FakeSession()
    storage = storage or FakeStorage()
    extractor = extractor or FakeExtractor()
    service = ResumeDocumentService(
        session,  # type: ignore[arg-type]
        storage,  # type: ignore[arg-type]
        extractor,  # type: ignore[arg-type]
        max_upload_bytes=100,
        max_extracted_characters=50,
        document_id_factory=lambda: (
            document_id or UUID("22222222-2222-4222-8222-222222222222")
        ),
    )
    return service, session, storage, extractor


def assert_api_error(
    error: pytest.ExceptionInfo[APIError], status_code: int, code: str
) -> None:
    assert error.value.status_code == status_code
    assert error.value.error == code


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("/home/user/resume.pdf", "resume.pdf"),
        (r"C:\fakepath\resume.pdf", "resume.pdf"),
        (" resume.pdf ", "resume.pdf"),
    ],
)
def test_normalize_resume_filename(value: str, expected: str) -> None:
    assert normalize_resume_filename(value) == expected


@pytest.mark.parametrize("value", [None, "", "  ", ".", "..", "a\x00b", "a\nb"])
def test_normalize_resume_filename_rejects_invalid_values(value: str | None) -> None:
    with pytest.raises(ValueError, match="resume_filename_invalid"):
        normalize_resume_filename(value)


def test_normalize_resume_filename_rejects_long_basename() -> None:
    with pytest.raises(ValueError, match="resume_filename_invalid"):
        normalize_resume_filename("a" * 256)


def test_create_file_document_stores_then_reads_exact_object_and_succeeds() -> None:
    user = create_user(UUID("11111111-1111-4111-8111-111111111111"))
    service, session, storage, extractor = create_service()
    source = io.BytesIO(b"client stream")

    response = asyncio.run(
        service.create_file_document(
            user,
            file_obj=source,
            original_filename=r"C:\fakepath\resume.pdf",
            declared_media_type=" TEXT/PLAIN; charset=UTF-8 ",
        )
    )

    document = session.added[0]
    assert response.extraction_status == "succeeded"
    assert document.original_filename == "resume.pdf"
    assert document.media_type == TEXT_PLAIN
    assert document.byte_size == len(storage.payload)
    assert document.sha256 == sha256(storage.payload).hexdigest()
    assert document.extracted_text == "Resume"
    assert storage.store_calls[0] == (
        "users/11111111111141118111111111111111/"
        "resumes/22222222222242228222222222222222/source",
        source,
        100,
    )
    assert storage.read_calls == [storage.store_calls[0][0]]
    assert extractor.calls == [(b"stored bytes", " TEXT/PLAIN; charset=UTF-8 ", 50)]
    assert storage.delete_calls == []
    assert source.closed is False


def test_file_extraction_failure_is_persisted_and_source_is_retained() -> None:
    service, session, storage, _extractor = create_service(
        extractor=FakeExtractor(error=ResumeExtractionError("resume_pdf_invalid"))
    )

    response = asyncio.run(
        service.create_file_document(
            create_user(),
            file_obj=io.BytesIO(b"pdf"),
            original_filename="resume.pdf",
            declared_media_type="application/pdf",
        )
    )

    document = session.added[0]
    assert response.extraction_status == "failed"
    assert response.failure_reason == RESUME_EXTRACTION_FAILURE_REASON
    assert document.extraction_status == "failed"
    assert document.extraction_failure_code == "resume_pdf_invalid"
    assert document.media_type == "application/pdf"
    assert document.extracted_text is None
    assert storage.delete_calls == []


@pytest.mark.parametrize(
    ("storage_error", "status_code", "code"),
    [
        (ResumeStorageError(RESUME_FILE_EMPTY), 422, RESUME_FILE_EMPTY),
        (ResumeStorageError(RESUME_FILE_TOO_LARGE), 413, RESUME_FILE_TOO_LARGE),
        (
            ResumeStorageError(RESUME_STORAGE_COLLISION),
            503,
            "resume_storage_unavailable",
        ),
        (
            ResumeStorageError(RESUME_STORAGE_UNAVAILABLE),
            503,
            "resume_storage_unavailable",
        ),
    ],
)
def test_storage_errors_do_not_create_documents(
    storage_error: ResumeStorageError,
    status_code: int,
    code: str,
) -> None:
    service, session, storage, extractor = create_service(
        storage=FakeStorage(store_error=storage_error)
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )

    assert_api_error(error, status_code, code)
    assert session.added == []
    assert extractor.calls == []
    assert storage.delete_calls == []


def test_read_failure_and_unexpected_extractor_failure_compensate_storage() -> None:
    read_service, read_session, read_storage, read_extractor = create_service(
        storage=FakeStorage(read_error=ResumeStorageError("resume_object_not_found"))
    )
    with pytest.raises(APIError) as read_error:
        asyncio.run(
            read_service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )
    assert_api_error(read_error, 503, "resume_storage_unavailable")
    assert read_session.added == []
    assert read_extractor.calls == []
    assert len(read_storage.delete_calls) == 1

    extract_storage = FakeStorage()
    extract_service, extract_session, _, _ = create_service(
        storage=extract_storage,
        extractor=FakeExtractor(error=RuntimeError("parser detail")),
    )
    with pytest.raises(APIError) as extract_error:
        asyncio.run(
            extract_service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )
    assert_api_error(extract_error, 503, "resume_upload_unavailable")
    assert extract_session.added == []
    assert len(extract_storage.delete_calls) == 1


@pytest.mark.parametrize("failure", ["flush", "commit"])
def test_database_failure_rolls_back_and_compensates_storage(failure: str) -> None:
    session = FakeSession(**{f"{failure}_error": RuntimeError("database detail")})
    storage = FakeStorage(delete_error=RuntimeError("delete detail"))
    service, session, storage, _extractor = create_service(
        session=session,
        storage=storage,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )

    assert_api_error(error, 503, "resume_upload_unavailable")
    assert session.rollback_count == 1
    assert len(storage.delete_calls) == 1


def test_cancelled_file_operation_is_rethrown_and_compensated() -> None:
    storage = FakeStorage(read_error=asyncio.CancelledError())
    service, session, storage, _extractor = create_service(storage=storage)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )

    assert session.added == []
    assert len(storage.delete_calls) == 1

    commit_storage = FakeStorage()
    commit_service, commit_session, commit_storage, _extractor = create_service(
        session=FakeSession(commit_error=asyncio.CancelledError()),
        storage=commit_storage,
    )
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            commit_service.create_file_document(
                create_user(),
                file_obj=io.BytesIO(b"data"),
                original_filename="resume.txt",
                declared_media_type="text/plain",
            )
        )
    assert commit_session.rollback_count == 1
    assert len(commit_storage.delete_calls) == 1


def test_cancelled_real_storage_waits_for_worker_before_deleting_source(
    tmp_path: Path,
) -> None:
    async def scenario() -> tuple[FakeSession, FakeExtractor, BlockingSource]:
        storage = LocalResumeObjectStorage(tmp_path / "resumes")
        service, session, _storage, extractor = create_service(
            storage=storage,  # type: ignore[arg-type]
        )
        source = BlockingSource(b"payload")
        upload_task = asyncio.create_task(
            service.create_file_document(
                create_user(),
                file_obj=source,
                original_filename="resume.txt",
                declared_media_type=TEXT_PLAIN,
            )
        )

        started = await asyncio.to_thread(source.started.wait, 5)
        upload_task.cancel()
        source.release.set()
        with pytest.raises(asyncio.CancelledError):
            await upload_task
        assert started
        return session, extractor, source

    session, extractor, source = asyncio.run(scenario())
    root = tmp_path / "resumes"
    assert list(root.rglob("source")) == []
    assert list(root.rglob(".riva-resume-*")) == []
    assert session.added == []
    assert extractor.calls == []
    assert source.closed is False


def test_repeated_cancellation_during_cleanup_still_deletes_real_source(
    tmp_path: Path,
) -> None:
    async def scenario() -> tuple[FakeSession, FakeExtractor, BlockingSource]:
        storage = DeletionGatedLocalStorage(tmp_path / "resumes")
        service, session, _storage, extractor = create_service(
            storage=storage,  # type: ignore[arg-type]
        )
        source = BlockingSource(b"payload")
        upload_task = asyncio.create_task(
            service.create_file_document(
                create_user(),
                file_obj=source,
                original_filename="resume.txt",
                declared_media_type=TEXT_PLAIN,
            )
        )

        started = await asyncio.to_thread(source.started.wait, 5)
        upload_task.cancel()
        source.release.set()
        await storage.delete_started.wait()
        upload_task.cancel()
        storage.delete_release.set()
        with pytest.raises(asyncio.CancelledError):
            await upload_task
        assert started
        return session, extractor, source

    session, extractor, source = asyncio.run(scenario())
    root = tmp_path / "resumes"
    assert list(root.rglob("source")) == []
    assert list(root.rglob(".riva-resume-*")) == []
    assert session.added == []
    assert extractor.calls == []
    assert source.closed is False


def test_cancelled_real_storage_collision_preserves_existing_object(
    tmp_path: Path,
) -> None:
    async def scenario() -> tuple[FakeSession, FakeExtractor]:
        storage = LocalResumeObjectStorage(tmp_path / "resumes")
        user_id = UUID("11111111-1111-4111-8111-111111111111")
        document_id = UUID("22222222-2222-4222-8222-222222222222")
        key = build_resume_storage_key(user_id, document_id)
        await storage.store_file(key, io.BytesIO(b"original"), max_bytes=100)

        service, session, _storage, extractor = create_service(
            storage=storage,  # type: ignore[arg-type]
            document_id=document_id,
        )
        source = BlockingSource(b"replacement")
        upload_task = asyncio.create_task(
            service.create_file_document(
                create_user(user_id),
                file_obj=source,
                original_filename="resume.txt",
                declared_media_type=TEXT_PLAIN,
            )
        )

        started = await asyncio.to_thread(source.started.wait, 5)
        upload_task.cancel()
        source.release.set()
        with pytest.raises(asyncio.CancelledError):
            await upload_task
        assert started
        assert await storage.read_bytes(key) == b"original"
        return session, extractor

    session, extractor = asyncio.run(scenario())
    assert session.added == []
    assert extractor.calls == []


def test_cancelled_after_real_storage_publish_deletes_returned_key(
    tmp_path: Path,
) -> None:
    async def scenario() -> tuple[FakeSession, FakeExtractor]:
        storage = CompletionGatedLocalStorage(tmp_path / "resumes")
        document_id = UUID("22222222-2222-4222-8222-222222222222")
        user = create_user(UUID("11111111-1111-4111-8111-111111111111"))
        key = build_resume_storage_key(user.id, document_id)
        service, session, _storage, extractor = create_service(
            storage=storage,  # type: ignore[arg-type]
            document_id=document_id,
        )

        upload_task = asyncio.create_task(
            service.create_file_document(
                user,
                file_obj=io.BytesIO(b"payload"),
                original_filename="resume.txt",
                declared_media_type=TEXT_PLAIN,
            )
        )
        await storage.published.wait()
        assert await storage.read_bytes(key) == b"payload"
        upload_task.cancel()
        storage.release.set()
        with pytest.raises(asyncio.CancelledError):
            await upload_task
        return session, extractor

    session, extractor = asyncio.run(scenario())
    root = tmp_path / "resumes"
    assert list(root.rglob("source")) == []
    assert list(root.rglob(".riva-resume-*")) == []
    assert session.added == []
    assert extractor.calls == []


def test_pasted_text_uses_canonical_text_without_storage() -> None:
    storage = FakeStorage()
    extractor = FakeExtractor(result=ExtractedResumeText(TEXT_PLAIN, "中文简历"))
    service, session, storage, extractor = create_service(
        storage=storage,
        extractor=extractor,
    )

    response = asyncio.run(
        service.create_pasted_text_document(
            create_user(),
            text="  中文原文 \r\n",
        )
    )

    document = session.added[0]
    canonical = "中文简历".encode("utf-8")
    assert response.extraction_status == "succeeded"
    assert document.source_type == "pastedText"
    assert document.storage_key is None
    assert document.byte_size == len(canonical)
    assert document.sha256 == sha256(canonical).hexdigest()
    assert document.extracted_text == "中文简历"
    assert extractor.calls == [("  中文原文 \r\n".encode(), TEXT_PLAIN, 50)]
    assert storage.store_calls == []
    assert storage.read_calls == []
    assert storage.delete_calls == []


@pytest.mark.parametrize(
    ("text", "max_upload_bytes", "extractor_error", "status_code", "code"),
    [
        ("   ", 100, None, 422, "resume_text_empty"),
        ("中文", 2, None, 413, "resume_text_too_large"),
        (
            "text",
            100,
            ResumeExtractionError("resume_text_decode_failed"),
            422,
            "resume_text_invalid",
        ),
        (
            "text",
            100,
            ResumeExtractionError("resume_text_too_large"),
            413,
            "resume_text_too_large",
        ),
    ],
)
def test_pasted_text_errors_do_not_create_documents(
    text: str,
    max_upload_bytes: int,
    extractor_error: ResumeExtractionError | None,
    status_code: int,
    code: str,
) -> None:
    session = FakeSession()
    storage = FakeStorage()
    extractor = (
        FakeExtractor(error=extractor_error) if extractor_error else FakeExtractor()
    )
    service = ResumeDocumentService(
        session,  # type: ignore[arg-type]
        storage,  # type: ignore[arg-type]
        extractor,  # type: ignore[arg-type]
        max_upload_bytes=max_upload_bytes,
        max_extracted_characters=50,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(service.create_pasted_text_document(create_user(), text=text))

    assert_api_error(error, status_code, code)
    assert session.added == []
    assert storage.store_calls == []


def document_for_query(
    user_id: UUID,
    *,
    document_id: UUID | None = None,
    status: str = "pending",
    extracted_text: str | None = None,
) -> ResumeDocument:
    now = utc_now()
    return ResumeDocument(
        id=document_id or uuid4(),
        user_id=user_id,
        source_type="file",
        original_filename="resume.txt",
        media_type=TEXT_PLAIN,
        byte_size=4,
        sha256="a" * 64,
        storage_key="users/u/resumes/d/source",
        extraction_status=status,
        extracted_text=extracted_text,
        extraction_failure_code=("resume_text_empty" if status == "failed" else None),
        uploaded_at=now,
        extracted_at=(now if status != "pending" else None),
        created_at=now,
        updated_at=now,
    )


def test_list_get_and_load_are_user_scoped_and_explicitly_mapped() -> None:
    user = create_user()
    first = document_for_query(
        user.id,
        status="succeeded",
        extracted_text="Resume",
    )
    second = document_for_query(user.id)
    session = FakeSession(documents=[first, second], document=first)
    service, _session, storage, _extractor = create_service(session=session)

    listed = asyncio.run(service.list_documents(user, limit=2))
    detail = asyncio.run(service.get_document(user, first.id))
    loaded = asyncio.run(
        service.load_extracted_text(
            user_id=user.id,
            resume_document_id=first.id,
        )
    )

    assert len(listed.documents) == 2
    assert detail.extraction_status == "succeeded"
    assert loaded == LoadedResumeText(first.id, TEXT_PLAIN, "Resume")
    assert storage.read_calls == []
    assert all(
        field not in listed.model_dump(by_alias=True)["documents"][0]
        for field in ("sha256", "storageKey", "extractedText", "userId")
    )
    assert "ORDER BY" in str(session.statements[0])
    assert "LIMIT" in str(session.statements[0])

    missing_session = FakeSession(document=None)
    missing_service, _, _, _ = create_service(session=missing_session)
    with pytest.raises(APIError) as missing_error:
        asyncio.run(missing_service.get_document(user, uuid4()))
    assert_api_error(missing_error, 404, "resume_document_not_found")


@pytest.mark.parametrize(
    ("status", "extracted_text", "code"),
    [
        ("pending", None, "resume_document_not_ready"),
        ("failed", None, "resume_document_not_ready"),
        ("succeeded", None, "resume_document_text_missing"),
        ("succeeded", "   ", "resume_document_text_missing"),
    ],
)
def test_load_extracted_text_state_errors(
    status: str,
    extracted_text: str | None,
    code: str,
) -> None:
    user = create_user()
    document = document_for_query(
        user.id,
        status=status,
        extracted_text=extracted_text,
    )
    service, _, _, _ = create_service(session=FakeSession(document=document))

    with pytest.raises(ResumeDocumentStateError) as error:
        asyncio.run(
            service.load_extracted_text(
                user_id=user.id,
                resume_document_id=document.id,
            )
        )
    assert error.value.code == code
