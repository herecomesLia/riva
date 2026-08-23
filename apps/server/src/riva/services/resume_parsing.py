from collections.abc import Callable
from copy import deepcopy
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.resume_parsing import ResumeParsingAgent
from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.integrations import LLMProvider
from riva.models import ResumeDocument, ResumeParsingResult
from riva.schemas.resume_parsing import ResumeParsingInput, ResumeParsingOutput
from riva.utils import utc_now

ResumeParsingStateErrorCode = Literal[
    "resume_document_not_found",
    "resume_document_not_ready",
    "resume_document_text_missing",
    "resume_parsing_result_conflict",
]
INVALID_RESUME_PARSING_RESULT: ResumeParsingStateErrorCode = (
    "resume_parsing_result_conflict"
)
RESUME_DOCUMENT_NOT_FOUND: ResumeParsingStateErrorCode = "resume_document_not_found"
RESUME_DOCUMENT_NOT_READY: ResumeParsingStateErrorCode = "resume_document_not_ready"
RESUME_DOCUMENT_TEXT_MISSING: ResumeParsingStateErrorCode = (
    "resume_document_text_missing"
)
RESUME_PARSING_RESULT_CONFLICT: ResumeParsingStateErrorCode = (
    "resume_parsing_result_conflict"
)
RESUME_PARSING_NOT_STARTED = "resume_parsing_not_started"
RESUME_PARSING_UNAVAILABLE = "resume_parsing_unavailable"


class ResumeParsingStateError(RuntimeError):
    safe_message = "The resume parsing state is invalid."

    def __init__(self, code: ResumeParsingStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class ResumeParsingService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.clock = clock

    async def parse(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: InteractionLanguage,
        retry: bool = False,
    ) -> ResumeParsingResult:
        try:
            document = await self._document(
                user_id, resume_document_id, for_update=True
            )
            existing = await self.session.scalar(
                select(ResumeParsingResult)
                .where(ResumeParsingResult.resume_document_id == document.id)
                .with_for_update()
            )
            if existing is not None and not retry:
                return existing
            if retry and existing is None:
                raise APIError(status.HTTP_409_CONFLICT, RESUME_PARSING_NOT_STARTED)
            if self.llm_provider is None or not self.llm_model:
                raise APIError(
                    status.HTTP_503_SERVICE_UNAVAILABLE, RESUME_PARSING_UNAVAILABLE
                )
            self._require_ready(document)
            parsing_input = ResumeParsingInput(
                resume_text=document.extracted_text,
                interaction_language=interaction_language,
            )
            output = (
                await ResumeParsingAgent(self.llm_provider, self.llm_model).run(
                    parsing_input
                )
            ).output
            result = await self.persist_success(
                user_id=user_id,
                resume_document_id=resume_document_id,
                output=output,
            )
            await self.session.commit()
            return result
        except BaseException:
            await self.session.rollback()
            raise

    async def build_input(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> ResumeParsingInput:
        document = await self._document(user_id, resume_document_id, for_update=False)
        self._require_ready(document)
        return ResumeParsingInput(
            resume_text=document.extracted_text,
            interaction_language=interaction_language,
        )

    async def persist_success(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        output: ResumeParsingOutput,
    ) -> ResumeParsingResult:
        document = await self._document(user_id, resume_document_id, for_update=True)
        self._require_ready(document)
        validated = _revalidate_output(output)
        result = await self.session.scalar(
            select(ResumeParsingResult)
            .where(ResumeParsingResult.resume_document_id == document.id)
            .with_for_update()
        )
        values = validated.model_dump(mode="json")
        now = self.clock()
        _require_aware_datetime(now)
        if result is None:
            result = ResumeParsingResult(
                resume_document_id=document.id,
                user_id=document.user_id,
                result_version=1,
                parsed_at=now,
                summary=cast(str | None, values["summary"]),
                education=_copy_json_list(values["education"]),
                work_experiences=_copy_json_list(values["work_experiences"]),
                project_experiences=_copy_json_list(values["project_experiences"]),
                skills=_copy_string_list(values["skills"]),
                unresolved_items=_copy_string_list(values["unresolved_items"]),
            )
            self.session.add(result)
        else:
            result.user_id = document.user_id
            result.result_version += 1
            result.parsed_at = now
            result.summary = cast(str | None, values["summary"])
            result.education = _copy_json_list(values["education"])
            result.work_experiences = _copy_json_list(values["work_experiences"])
            result.project_experiences = _copy_json_list(values["project_experiences"])
            result.skills = _copy_string_list(values["skills"])
            result.unresolved_items = _copy_string_list(values["unresolved_items"])
        await self.session.flush()
        return result

    async def _document(
        self, user_id: UUID, document_id: UUID, *, for_update: bool
    ) -> ResumeDocument:
        statement = select(ResumeDocument).where(
            ResumeDocument.id == document_id,
            ResumeDocument.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        document = await self.session.scalar(statement)
        if document is None:
            raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_FOUND)
        return document

    @staticmethod
    def _require_ready(document: ResumeDocument) -> None:
        if document.extraction_status != "succeeded":
            raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_READY)
        if not document.extracted_text or not document.extracted_text.strip():
            raise ResumeParsingStateError(RESUME_DOCUMENT_TEXT_MISSING)


def resume_parsing_output_from_result(
    result: ResumeParsingResult,
) -> ResumeParsingOutput:
    try:
        return ResumeParsingOutput.model_validate(
            {
                "summary": result.summary,
                "education": result.education,
                "work_experiences": result.work_experiences,
                "project_experiences": result.project_experiences,
                "skills": result.skills,
                "unresolved_items": result.unresolved_items,
            }
        )
    except AttributeError, TypeError, ValueError, ValidationError:
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RESULT) from None


def _revalidate_output(output: ResumeParsingOutput) -> ResumeParsingOutput:
    try:
        return ResumeParsingOutput.model_validate(output.model_dump(mode="json"))
    except AttributeError, TypeError, ValueError, ValidationError:
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RESULT) from None


def _copy_json_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RESULT)
    return deepcopy(cast(list[dict[str, object]], value))


def _copy_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RESULT)
    return deepcopy(cast(list[str], value))


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INVALID_RESUME_PARSING_RESULT",
    "RESUME_DOCUMENT_NOT_FOUND",
    "RESUME_DOCUMENT_NOT_READY",
    "RESUME_DOCUMENT_TEXT_MISSING",
    "RESUME_PARSING_RESULT_CONFLICT",
    "RESUME_PARSING_NOT_STARTED",
    "RESUME_PARSING_UNAVAILABLE",
    "ResumeParsingService",
    "ResumeParsingStateError",
    "resume_parsing_output_from_result",
]
