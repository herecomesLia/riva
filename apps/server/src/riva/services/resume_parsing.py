from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import AgentRun, ResumeDocument, ResumeParsingResult, User
from riva.prompts import (
    RESUME_PARSING_PROMPT,
    RESUME_PARSING_PROMPT_V1,
    RESUME_PARSING_PROMPT_V2,
    RESUME_PARSING_PROMPT_V3,
)
from riva.schemas.resume_parsing import (
    ResumeParsingInput,
    ResumeParsingOutput,
    ResumeParsingRunPayload,
)
from riva.utils import utc_now


ResumeParsingStateErrorCode = Literal[
    "invalid_resume_parsing_run",
    "resume_document_not_found",
    "resume_document_not_ready",
    "resume_document_text_missing",
    "resume_parsing_superseded",
    "resume_parsing_result_conflict",
]

INVALID_RESUME_PARSING_RUN: ResumeParsingStateErrorCode = (
    "invalid_resume_parsing_run"
)
RESUME_DOCUMENT_NOT_FOUND: ResumeParsingStateErrorCode = (
    "resume_document_not_found"
)
RESUME_DOCUMENT_NOT_READY: ResumeParsingStateErrorCode = (
    "resume_document_not_ready"
)
RESUME_DOCUMENT_TEXT_MISSING: ResumeParsingStateErrorCode = (
    "resume_document_text_missing"
)
RESUME_PARSING_SUPERSEDED: ResumeParsingStateErrorCode = (
    "resume_parsing_superseded"
)
RESUME_PARSING_RESULT_CONFLICT: ResumeParsingStateErrorCode = (
    "resume_parsing_result_conflict"
)


class ResumeParsingStateError(RuntimeError):
    safe_message = "The resume parsing state is invalid."

    def __init__(self, code: ResumeParsingStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _ResumeParsingContext:
    payload: ResumeParsingRunPayload
    document: ResumeDocument
    existing_result: ResumeParsingResult | None


class ResumeParsingService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def load_input(self, run: AgentRun) -> ResumeParsingInput:
        try:
            context = await self._validated_context(run, for_update=False)
            try:
                parsing_input = ResumeParsingInput(
                    resume_text=context.document.extracted_text,
                    interaction_language=context.payload.interaction_language,
                )
            except (TypeError, ValueError, ValidationError):
                raise ResumeParsingStateError(
                    RESUME_DOCUMENT_TEXT_MISSING
                ) from None

            await self.session.commit()
            return parsing_input
        except BaseException:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: ResumeParsingOutput,
    ) -> ResumeParsingResult:
        try:
            validated_output = _revalidate_output(output)
            context = await self._validated_context(run, for_update=True)
            existing = context.existing_result

            if (
                existing is not None
                and existing.user_id == run.user_id
                and existing.resume_document_id == context.payload.resume_document_id
                and existing.source_agent_run_id == run.id
            ):
                await self.session.commit()
                return existing

            conflicting_source = await self.session.scalar(
                select(ResumeParsingResult)
                .where(
                    ResumeParsingResult.source_agent_run_id == run.id,
                    ResumeParsingResult.resume_document_id
                    != context.document.id,
                )
                .with_for_update()
            )
            if conflicting_source is not None:
                raise ResumeParsingStateError(RESUME_PARSING_RESULT_CONFLICT)

            parsed_at = self.clock()
            _require_aware_datetime(parsed_at)
            values = validated_output.model_dump(mode="json")
            if existing is None:
                result = ResumeParsingResult(
                    resume_document_id=context.document.id,
                    user_id=context.document.user_id,
                    result_version=1,
                    source_agent_run_id=run.id,
                    parsed_at=parsed_at,
                    summary=cast(str | None, values["summary"]),
                    education=_copy_json_list(values["education"]),
                    work_experiences=_copy_json_list(
                        values["work_experiences"]
                    ),
                    project_experiences=_copy_json_list(
                        values["project_experiences"]
                    ),
                    skills=_copy_string_list(values["skills"]),
                    unresolved_items=_copy_string_list(
                        values["unresolved_items"]
                    ),
                )
                self.session.add(result)
            else:
                result = existing
                result.user_id = context.document.user_id
                result.result_version += 1
                result.source_agent_run_id = run.id
                result.parsed_at = parsed_at
                result.summary = cast(str | None, values["summary"])
                result.education = _copy_json_list(values["education"])
                result.work_experiences = _copy_json_list(
                    values["work_experiences"]
                )
                result.project_experiences = _copy_json_list(
                    values["project_experiences"]
                )
                result.skills = _copy_string_list(values["skills"])
                result.unresolved_items = _copy_string_list(
                    values["unresolved_items"]
                )

            context.document.parsing_run_id = run.id
            await self.session.commit()
            return result
        except BaseException:
            await self.session.rollback()
            raise

    async def _validated_context(
        self,
        run: AgentRun,
        *,
        for_update: bool,
    ) -> _ResumeParsingContext:
        payload = _validate_run(run)

        if for_update:
            user_exists = await self.session.scalar(
                select(User.id).where(User.id == run.user_id).with_for_update()
            )
            if user_exists is None:
                raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_FOUND)

        document_statement = select(ResumeDocument).where(
            ResumeDocument.id == payload.resume_document_id,
            ResumeDocument.user_id == run.user_id,
        )
        if for_update:
            document_statement = document_statement.with_for_update()
        document = await self.session.scalar(document_statement)
        if document is None:
            raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_FOUND)
        if (
            document.id != payload.resume_document_id
            or document.user_id != run.user_id
        ):
            raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_FOUND)
        if document.parsing_run_id != run.id:
            raise ResumeParsingStateError(RESUME_PARSING_SUPERSEDED)
        if document.extraction_status != "succeeded":
            raise ResumeParsingStateError(RESUME_DOCUMENT_NOT_READY)
        if document.extracted_text is None or not document.extracted_text.strip():
            raise ResumeParsingStateError(RESUME_DOCUMENT_TEXT_MISSING)

        existing_result = None
        if for_update:
            existing_result = await self.session.scalar(
                select(ResumeParsingResult)
                .where(ResumeParsingResult.resume_document_id == document.id)
                .with_for_update()
            )

        return _ResumeParsingContext(
            payload=payload,
            document=document,
            existing_result=existing_result,
        )


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
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN) from None


def _validate_run(run: AgentRun) -> ResumeParsingRunPayload:
    active_prompt = RESUME_PARSING_PROMPT
    if (
        run.agent_id != "resume-parser"
        or run.prompt_id != active_prompt.prompt_id
        or run.prompt_version
        not in {
            RESUME_PARSING_PROMPT_V1.version,
            RESUME_PARSING_PROMPT_V2.version,
            RESUME_PARSING_PROMPT_V3.version,
            active_prompt.version,
        }
        or run.output_schema_id != active_prompt.output_schema_id
    ):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN)

    try:
        return ResumeParsingRunPayload.model_validate(run.payload)
    except (TypeError, ValueError, ValidationError):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN) from None


def _revalidate_output(output: ResumeParsingOutput) -> ResumeParsingOutput:
    try:
        return ResumeParsingOutput.model_validate(
            output.model_dump(mode="json")
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN) from None


def _copy_json_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN)
    return cast(list[dict[str, object]], deepcopy(value))


def _copy_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        raise ResumeParsingStateError(INVALID_RESUME_PARSING_RUN)
    return cast(list[str], deepcopy(value))


def _require_aware_datetime(value: object) -> None:
    if not isinstance(value, datetime):
        raise ValueError("clock must return a datetime")
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INVALID_RESUME_PARSING_RUN",
    "RESUME_DOCUMENT_NOT_FOUND",
    "RESUME_DOCUMENT_NOT_READY",
    "RESUME_DOCUMENT_TEXT_MISSING",
    "RESUME_PARSING_RESULT_CONFLICT",
    "RESUME_PARSING_SUPERSEDED",
    "ResumeParsingService",
    "ResumeParsingStateError",
    "resume_parsing_output_from_result",
]
