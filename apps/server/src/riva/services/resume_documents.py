from __future__ import annotations

import asyncio
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256
from pathlib import PurePosixPath, PureWindowsPath
from typing import BinaryIO
from uuid import UUID, uuid4

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.models import ResumeDocument, User
from riva.resumes.extraction import (
    APPLICATION_DOCX,
    APPLICATION_OCTET_STREAM,
    APPLICATION_PDF,
    RESUME_TEXT_EMPTY,
    RESUME_TEXT_TOO_LARGE,
    TEXT_PLAIN,
    ResumeExtractionError,
    ResumeTextExtractor,
)
from riva.schemas.resume_documents import (
    FailedResumeDocumentResponse,
    PendingResumeDocumentResponse,
    ResumeDocumentResponse,
    ResumeDocumentsResponse,
    SucceededResumeDocumentResponse,
)
from riva.storage import (
    ResumeObjectStorage,
    ResumeStorageError,
    StoredResumeObject,
    build_resume_storage_key,
)
from riva.utils import utc_now

RESUME_SOURCE_REQUIRED = "resume_source_required"
RESUME_SOURCE_AMBIGUOUS = "resume_source_ambiguous"
RESUME_FILENAME_INVALID = "resume_filename_invalid"
RESUME_TEXT_INVALID = "resume_text_invalid"
RESUME_UPLOAD_UNAVAILABLE = "resume_upload_unavailable"

RESUME_EXTRACTION_FAILURE_REASON = (
    "The resume text could not be extracted. "
    "Please upload a supported TXT, PDF, or DOCX file with a readable text layer."
)

_SUPPORTED_MEDIA_TYPES = frozenset({TEXT_PLAIN, APPLICATION_PDF, APPLICATION_DOCX})
_RESUME_DOCUMENT_STATE_CODES = frozenset(
    {
        "resume_document_not_found",
        "resume_document_not_ready",
        "resume_document_text_missing",
    }
)


@dataclass(frozen=True, slots=True)
class LoadedResumeText:
    resume_document_id: UUID
    media_type: str
    text: str


class ResumeDocumentStateError(RuntimeError):
    code: str

    def __init__(self, code: str) -> None:
        if code not in _RESUME_DOCUMENT_STATE_CODES:
            raise ValueError("unsupported resume document state error code")
        self.code = code
        super().__init__(code)


def normalize_resume_filename(value: str | None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(RESUME_FILENAME_INVALID)
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError(RESUME_FILENAME_INVALID)

    candidate = value.strip()
    basename = PurePosixPath(candidate).name
    basename = PureWindowsPath(basename).name
    if (
        not basename
        or basename in {".", ".."}
        or len(basename) > 255
        or any(unicodedata.category(character) == "Cc" for character in basename)
    ):
        raise ValueError(RESUME_FILENAME_INVALID)
    return basename


def build_resume_document_response(
    document: ResumeDocument,
) -> ResumeDocumentResponse:
    common = {
        "id": document.id,
        "source_type": document.source_type,
        "original_filename": document.original_filename,
        "media_type": document.media_type,
        "byte_size": document.byte_size,
        "uploaded_at": document.uploaded_at,
    }
    if document.extraction_status == "pending":
        return PendingResumeDocumentResponse(
            **common,
            extraction_status="pending",
            extracted_at=None,
            failure_reason=None,
        )
    if document.extraction_status == "succeeded":
        return SucceededResumeDocumentResponse(
            **common,
            extraction_status="succeeded",
            extracted_at=document.extracted_at,
            failure_reason=None,
        )
    if document.extraction_status == "failed":
        return FailedResumeDocumentResponse(
            **common,
            extraction_status="failed",
            extracted_at=document.extracted_at,
            failure_reason=RESUME_EXTRACTION_FAILURE_REASON,
        )
    raise ValueError("unsupported resume document extraction status")


class ResumeDocumentService:
    def __init__(
        self,
        session: AsyncSession,
        storage: ResumeObjectStorage,
        extractor: ResumeTextExtractor,
        max_upload_bytes: int,
        max_extracted_characters: int,
        document_id_factory: Callable[[], UUID] = uuid4,
    ) -> None:
        if max_upload_bytes <= 0:
            raise ValueError("max_upload_bytes must be greater than zero")
        if max_extracted_characters <= 0:
            raise ValueError("max_extracted_characters must be greater than zero")
        self.session = session
        self.storage = storage
        self.extractor = extractor
        self.max_upload_bytes = max_upload_bytes
        self.max_extracted_characters = max_extracted_characters
        self.document_id_factory = document_id_factory

    async def create_file_document(
        self,
        user: User,
        *,
        file_obj: BinaryIO,
        original_filename: str,
        declared_media_type: str | None,
    ) -> ResumeDocumentResponse:
        try:
            filename = normalize_resume_filename(original_filename)
        except TypeError, ValueError:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RESUME_FILENAME_INVALID,
            ) from None

        document_id = self.document_id_factory()
        storage_key = build_resume_storage_key(user.id, document_id)

        try:
            stored = await self._store_file_cancellation_safe(
                storage_key,
                file_obj,
                self.max_upload_bytes,
            )
        except ResumeStorageError as error:
            raise _storage_api_error(error.code) from None
        except Exception:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "resume_storage_unavailable",
            ) from None

        try:
            stored_bytes = await self.storage.read_bytes(stored.key)
        except asyncio.CancelledError:
            await self._delete_cancellation_safe(stored.key)
            raise
        except Exception:
            await self._delete_safely(stored.key)
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "resume_storage_unavailable",
            ) from None

        try:
            extracted = await self.extractor.extract(
                stored_bytes,
                declared_media_type=declared_media_type,
                max_characters=self.max_extracted_characters,
            )
        except asyncio.CancelledError:
            await self._delete_cancellation_safe(stored.key)
            raise
        except ResumeExtractionError as error:
            try:
                document = self._new_file_document(
                    document_id=document_id,
                    user_id=user.id,
                    filename=filename,
                    declared_media_type=declared_media_type,
                    stored=stored,
                    extraction_status="failed",
                    extracted_text=None,
                    extraction_failure_code=error.code,
                )
            except Exception:
                await self._delete_safely(stored.key)
                raise APIError(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    RESUME_UPLOAD_UNAVAILABLE,
                ) from None
            return await self._persist_document(document, stored.key)
        except Exception:
            await self._delete_safely(stored.key)
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_UPLOAD_UNAVAILABLE,
            ) from None

        try:
            document = self._new_file_document(
                document_id=document_id,
                user_id=user.id,
                filename=filename,
                stored=stored,
                extraction_status="succeeded",
                extracted_media_type=extracted.media_type,
                extracted_text=extracted.text,
                extraction_failure_code=None,
            )
        except Exception:
            await self._delete_safely(stored.key)
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_UPLOAD_UNAVAILABLE,
            ) from None
        return await self._persist_document(document, stored.key)

    async def create_pasted_text_document(
        self,
        user: User,
        *,
        text: str,
    ) -> ResumeDocumentResponse:
        if not isinstance(text, str) or not text.strip():
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RESUME_TEXT_EMPTY,
            )
        try:
            raw_text = text.encode("utf-8")
        except UnicodeError:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RESUME_TEXT_INVALID,
            ) from None
        if len(raw_text) > self.max_upload_bytes:
            raise APIError(
                status.HTTP_413_CONTENT_TOO_LARGE,
                RESUME_TEXT_TOO_LARGE,
            )

        try:
            extracted = await self.extractor.extract(
                raw_text,
                declared_media_type=TEXT_PLAIN,
                max_characters=self.max_extracted_characters,
            )
            canonical_text = extracted.text
            if not isinstance(canonical_text, str):
                raise TypeError("extracted text must be a string")
            if not canonical_text.strip():
                raise ResumeExtractionError(RESUME_TEXT_EMPTY)
            canonical_bytes = canonical_text.encode("utf-8")
        except asyncio.CancelledError:
            raise
        except ResumeExtractionError as error:
            raise _pasted_text_api_error(error.code) from None
        except UnicodeError, AttributeError, TypeError:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RESUME_TEXT_INVALID,
            ) from None
        except Exception:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RESUME_TEXT_INVALID,
            ) from None

        document_id = self.document_id_factory()
        now = utc_now()
        document = ResumeDocument(
            id=document_id,
            user_id=user.id,
            source_type="pastedText",
            original_filename=None,
            media_type=TEXT_PLAIN,
            byte_size=len(canonical_bytes),
            sha256=sha256(canonical_bytes).hexdigest(),
            storage_key=None,
            extraction_status="succeeded",
            extracted_text=canonical_text,
            extraction_failure_code=None,
            uploaded_at=now,
            extracted_at=now,
            created_at=now,
            updated_at=now,
        )
        return await self._persist_document(document, None)

    async def list_documents(
        self,
        user: User,
        *,
        limit: int,
    ) -> ResumeDocumentsResponse:
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")
        statement = (
            select(ResumeDocument)
            .where(ResumeDocument.user_id == user.id)
            .order_by(
                ResumeDocument.uploaded_at.desc(),
                ResumeDocument.id.desc(),
            )
            .limit(limit)
        )
        result = await self.session.execute(statement)
        documents = result.scalars().all()
        return ResumeDocumentsResponse(
            documents=[build_resume_document_response(item) for item in documents]
        )

    async def get_document(
        self,
        user: User,
        resume_document_id: UUID,
    ) -> ResumeDocumentResponse:
        statement = select(ResumeDocument).where(
            ResumeDocument.id == resume_document_id,
            ResumeDocument.user_id == user.id,
        )
        result = await self.session.execute(statement)
        document = result.scalar_one_or_none()
        if document is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "resume_document_not_found",
            )
        return build_resume_document_response(document)

    async def load_extracted_text(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> LoadedResumeText:
        statement = select(ResumeDocument).where(
            ResumeDocument.id == resume_document_id,
            ResumeDocument.user_id == user_id,
        )
        result = await self.session.execute(statement)
        document = result.scalar_one_or_none()
        if document is None:
            raise ResumeDocumentStateError("resume_document_not_found")
        if document.extraction_status != "succeeded":
            raise ResumeDocumentStateError("resume_document_not_ready")
        if document.extracted_text is None or not document.extracted_text.strip():
            raise ResumeDocumentStateError("resume_document_text_missing")
        return LoadedResumeText(
            resume_document_id=document.id,
            media_type=document.media_type,
            text=document.extracted_text,
        )

    def _new_file_document(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
        filename: str,
        stored: StoredResumeObject,
        extraction_status: str,
        extracted_text: str | None,
        extraction_failure_code: str | None,
        extracted_media_type: str | None = None,
        declared_media_type: str | None = None,
    ) -> ResumeDocument:
        now = utc_now()
        return ResumeDocument(
            id=document_id,
            user_id=user_id,
            source_type="file",
            original_filename=filename,
            media_type=(
                _safe_extracted_media_type(extracted_media_type)
                if extraction_status == "succeeded"
                else _safe_declared_media_type(declared_media_type)
            ),
            byte_size=stored.byte_size,
            sha256=stored.sha256,
            storage_key=stored.key,
            extraction_status=extraction_status,
            extracted_text=extracted_text,
            extraction_failure_code=extraction_failure_code,
            uploaded_at=now,
            extracted_at=now,
            created_at=now,
            updated_at=now,
        )

    async def _persist_document(
        self,
        document: ResumeDocument,
        storage_key: str | None,
    ) -> ResumeDocumentResponse:
        try:
            self.session.add(document)
            await self.session.flush()
            await self.session.commit()
        except asyncio.CancelledError:
            await self._rollback_safely()
            if storage_key is not None:
                await self._delete_cancellation_safe(storage_key)
            raise
        except Exception:
            await self._rollback_safely()
            if storage_key is not None:
                await self._delete_safely(storage_key)
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_UPLOAD_UNAVAILABLE,
            ) from None

        try:
            return build_resume_document_response(document)
        except Exception:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_UPLOAD_UNAVAILABLE,
            ) from None

    async def _store_file_cancellation_safe(
        self,
        storage_key: str,
        file_obj: BinaryIO,
        max_bytes: int,
    ) -> StoredResumeObject:
        store_task = asyncio.create_task(
            self.storage.store_file(storage_key, file_obj, max_bytes)
        )
        try:
            return await asyncio.shield(store_task)
        except asyncio.CancelledError as cancellation:
            await self._wait_for_task_completion(store_task)
            try:
                stored = store_task.result()
            except asyncio.CancelledError:
                raise cancellation
            except Exception:
                raise cancellation

            await self._delete_cancellation_safe(stored.key)
            raise cancellation

    @staticmethod
    async def _wait_for_task_completion(task: asyncio.Task[object]) -> None:
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except Exception:
                continue

    async def _delete_cancellation_safe(self, storage_key: str) -> None:
        delete_task = asyncio.create_task(self.storage.delete(storage_key))
        await self._wait_for_task_completion(delete_task)
        try:
            delete_task.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def _rollback_safely(self) -> None:
        try:
            await self.session.rollback()
        except Exception:
            pass

    async def _delete_safely(self, storage_key: str) -> None:
        try:
            await self.storage.delete(storage_key)
        except Exception:
            pass


def _safe_declared_media_type(value: str | None) -> str:
    if not isinstance(value, str) or len(value) > 127:
        return APPLICATION_OCTET_STREAM
    if any(unicodedata.category(character) == "Cc" for character in value):
        return APPLICATION_OCTET_STREAM
    media_type = value.split(";", 1)[0].strip().lower()
    if media_type in _SUPPORTED_MEDIA_TYPES:
        return media_type
    return APPLICATION_OCTET_STREAM


def _safe_extracted_media_type(value: str | None) -> str:
    if value not in _SUPPORTED_MEDIA_TYPES:
        raise ValueError("unsupported extracted media type")
    return value


def _storage_api_error(code: str) -> APIError:
    if code == "resume_file_empty":
        return APIError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "resume_file_empty",
        )
    if code == "resume_file_too_large":
        return APIError(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "resume_file_too_large",
        )
    return APIError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "resume_storage_unavailable",
    )


def _pasted_text_api_error(code: str) -> APIError:
    if code == RESUME_TEXT_EMPTY:
        return APIError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            RESUME_TEXT_EMPTY,
        )
    if code == RESUME_TEXT_TOO_LARGE:
        return APIError(
            status.HTTP_413_CONTENT_TOO_LARGE,
            RESUME_TEXT_TOO_LARGE,
        )
    return APIError(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        RESUME_TEXT_INVALID,
    )


__all__ = [
    "LoadedResumeText",
    "RESUME_EXTRACTION_FAILURE_REASON",
    "ResumeDocumentService",
    "ResumeDocumentStateError",
    "build_resume_document_response",
    "normalize_resume_filename",
]
