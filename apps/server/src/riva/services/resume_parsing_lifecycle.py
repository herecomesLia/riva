from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)
from riva.prompts import RESUME_PARSING_PROMPT
from riva.schemas.resume_parsing import (
    ResumeParsingOutput,
    ResumeParsingRunPayload,
)
from riva.schemas.resume_parsing_lifecycle import ResumeParsingStatusResponse
from riva.services.agent_runs import AgentRunService
from riva.services.resume_parsing import (
    ResumeParsingStateError,
    resume_parsing_output_from_result,
)
from riva.services.prompt_versions import RESUME_PARSING_ACCEPTED_PROMPT_VERSIONS
from riva.services.resume_imports import (
    RESUME_IMPORT_DRAFT_INVALID,
    ResumeImportStateError,
    resume_import_draft_data_from_model,
)


RESUME_PARSING_FAILURE_REASON = (
    "Resume parsing failed. Your uploaded resume is preserved; please try again."
)

RESUME_DOCUMENT_NOT_FOUND = "resume_document_not_found"
RESUME_DOCUMENT_NOT_READY = "resume_document_not_ready"
RESUME_DOCUMENT_TEXT_MISSING = "resume_document_text_missing"
RESUME_PARSING_STATE_CONFLICT = "resume_parsing_state_conflict"
RESUME_PARSING_RETRY_REQUIRED = "resume_parsing_retry_required"
RESUME_PARSING_NOT_STARTED = "resume_parsing_not_started"
RESUME_PARSING_RETRY_NOT_ALLOWED = "resume_parsing_retry_not_allowed"
RESUME_PARSING_UNAVAILABLE = "resume_parsing_unavailable"

READY = "ready"
APPLIED = "applied"
SUPERSEDED = "superseded"

_SAFE_ERROR_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class ResumeParsingLifecycleService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        agent_run_service_factory: Callable[..., AgentRunService] = (
            AgentRunService
        ),
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory

    async def start(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> ResumeParsingStatusResponse:
        try:
            await self._lock_user(user_id)
            document = await self._load_document(
                user_id,
                resume_document_id,
                for_update=True,
            )
            run = await self._load_current_run(document, for_update=True)

            if run is not None:
                if run.status in (AgentRunStatus.QUEUED, AgentRunStatus.RUNNING):
                    response = self._status_response(
                        document,
                        run,
                        result=None,
                        draft=None,
                    )
                    await self.session.commit()
                    return response
                if run.status == AgentRunStatus.SUCCEEDED:
                    result, draft = await self._load_artifacts(
                        document.id,
                        for_update=True,
                    )
                    response = self._status_response(
                        document,
                        run,
                        result=result,
                        draft=draft,
                    )
                    await self.session.commit()
                    return response
                if run.status == AgentRunStatus.FAILED:
                    raise APIError(
                        status.HTTP_409_CONFLICT,
                        RESUME_PARSING_RETRY_REQUIRED,
                    )
                raise _state_conflict()

            self._require_document_ready(document)
            model = self._configured_model()
            new_run = await self._enqueue(
                user_id=user_id,
                document_id=document.id,
                model=model,
                interaction_language=interaction_language,
                idempotency_key=(
                    f"resume-parsing:{document.id}:initial:{interaction_language}"
                ),
            )
            document.parsing_run_id = new_run.id
            response = self._status_response(
                document,
                new_run,
                result=None,
                draft=None,
            )
            await self.session.commit()
            return response
        except BaseException:
            await self.session.rollback()
            raise

    async def retry(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> ResumeParsingStatusResponse:
        try:
            await self._lock_user(user_id)
            document = await self._load_document(
                user_id,
                resume_document_id,
                for_update=True,
            )
            run = await self._load_current_run(document, for_update=True)
            if run is None:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    RESUME_PARSING_NOT_STARTED,
                )
            if run.status in (AgentRunStatus.QUEUED, AgentRunStatus.RUNNING):
                response = self._status_response(
                    document,
                    run,
                    result=None,
                    draft=None,
                )
                await self.session.commit()
                return response
            if run.status == AgentRunStatus.SUCCEEDED:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    RESUME_PARSING_RETRY_NOT_ALLOWED,
                )
            if run.status != AgentRunStatus.FAILED:
                raise _state_conflict()

            result, draft = await self._load_artifacts(
                document.id,
                for_update=True,
            )
            self._require_document_ready(document)
            model = self._configured_model()
            self._prepare_retry_artifacts(
                document=document,
                failed_run=run,
                result=result,
                draft=draft,
            )
            new_run = await self._enqueue(
                user_id=user_id,
                document_id=document.id,
                model=model,
                interaction_language=interaction_language,
                idempotency_key=(
                    f"resume-parsing:{document.id}:retry:{run.id}:"
                    f"{interaction_language}"
                ),
            )
            document.parsing_run_id = new_run.id
            response = self._status_response(
                document,
                new_run,
                result=None,
                draft=None,
            )
            await self.session.commit()
            return response
        except BaseException:
            await self.session.rollback()
            raise

    async def get_status(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeParsingStatusResponse:
        document = await self._load_document(
            user_id,
            resume_document_id,
            for_update=False,
        )
        run = await self._load_current_run(document, for_update=False)
        if run is None:
            return self._not_started_response(document.id)

        result, draft = await self._load_artifacts(
            document.id,
            for_update=False,
        )
        return self._status_response(
            document,
            run,
            result=result,
            draft=draft,
        )

    async def _lock_user(self, user_id: UUID) -> None:
        user = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if user is None:
            raise _document_not_found()

    async def _load_document(
        self,
        user_id: UUID,
        resume_document_id: UUID,
        *,
        for_update: bool,
    ) -> ResumeDocument:
        statement = select(ResumeDocument).where(
            ResumeDocument.id == resume_document_id,
            ResumeDocument.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        document = await self.session.scalar(statement)
        if document is None:
            raise _document_not_found()
        if document.id != resume_document_id or document.user_id != user_id:
            raise _document_not_found()
        return document

    async def _load_current_run(
        self,
        document: ResumeDocument,
        *,
        for_update: bool,
    ) -> AgentRun | None:
        if document.parsing_run_id is None:
            return None

        statement = select(AgentRun).where(
            AgentRun.id == document.parsing_run_id,
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is None:
            raise _state_conflict()
        if self._current_resume_parsing_run(document, run) is None:
            raise _state_conflict()
        return run

    @staticmethod
    def _current_resume_parsing_run(
        document: ResumeDocument,
        run: AgentRun,
    ) -> tuple[AgentRun, ResumeParsingRunPayload] | None:
        if (
            document.parsing_run_id != run.id
            or run.user_id != document.user_id
        ):
            return None
        active_prompt = RESUME_PARSING_PROMPT
        if (
            run.agent_id != "resume-parser"
            or run.prompt_id != active_prompt.prompt_id
            or run.prompt_version not in RESUME_PARSING_ACCEPTED_PROMPT_VERSIONS
            or run.output_schema_id != active_prompt.output_schema_id
        ):
            return None
        try:
            payload = ResumeParsingRunPayload.model_validate(run.payload)
        except (TypeError, ValueError, ValidationError):
            return None
        if payload.resume_document_id != document.id:
            return None
        return run, payload

    async def _load_artifacts(
        self,
        resume_document_id: UUID,
        *,
        for_update: bool,
    ) -> tuple[ResumeParsingResult | None, ResumeImportDraft | None]:
        result_statement = select(ResumeParsingResult).where(
            ResumeParsingResult.resume_document_id == resume_document_id,
        )
        draft_statement = select(ResumeImportDraft).where(
            ResumeImportDraft.resume_document_id == resume_document_id,
        )
        if for_update:
            result_statement = result_statement.with_for_update()
            draft_statement = draft_statement.with_for_update()
        result = await self.session.scalar(result_statement)
        draft = await self.session.scalar(draft_statement)
        return result, draft

    async def _enqueue(
        self,
        *,
        user_id: UUID,
        document_id: UUID,
        model: str,
        interaction_language: InteractionLanguage,
        idempotency_key: str,
    ) -> AgentRun:
        prompt = RESUME_PARSING_PROMPT
        payload = ResumeParsingRunPayload(
            resume_document_id=document_id,
            interaction_language=interaction_language,
        )
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="resume-parser",
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model=model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    def _configured_model(self) -> str:
        if self.llm_provider != "qwen":
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_PARSING_UNAVAILABLE,
            )
        if not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                RESUME_PARSING_UNAVAILABLE,
            )
        return self.llm_model

    @staticmethod
    def _require_document_ready(document: ResumeDocument) -> None:
        if document.extraction_status != "succeeded":
            raise APIError(
                status.HTTP_409_CONFLICT,
                RESUME_DOCUMENT_NOT_READY,
            )
        if document.extracted_text is None or not document.extracted_text.strip():
            raise APIError(
                status.HTTP_409_CONFLICT,
                RESUME_DOCUMENT_TEXT_MISSING,
            )

    @staticmethod
    def _prepare_retry_artifacts(
        *,
        document: ResumeDocument,
        failed_run: AgentRun,
        result: ResumeParsingResult | None,
        draft: ResumeImportDraft | None,
    ) -> None:
        if result is not None and (
            result.user_id != document.user_id
            or result.resume_document_id != document.id
        ):
            raise _state_conflict()
        if draft is None:
            return
        if (
            draft.user_id != document.user_id
            or draft.resume_document_id != document.id
        ):
            raise _state_conflict()
        if draft.status == READY:
            if draft.source_agent_run_id != failed_run.id:
                raise _state_conflict()
            draft.status = SUPERSEDED
            draft.applied_profile_version = None
            draft.applied_at = None
        elif draft.status == SUPERSEDED:
            return
        elif draft.status == APPLIED:
            raise _state_conflict()
        else:
            raise _state_conflict()

    @classmethod
    def _not_started_response(
        cls,
        resume_document_id: UUID,
    ) -> ResumeParsingStatusResponse:
        return cls._response(
            resume_document_id=resume_document_id,
            status_value="notStarted",
            run=None,
            error_code=None,
            failure_reason=None,
            can_retry=False,
            result_version=None,
            draft_version=None,
            draft_status=None,
        )

    @classmethod
    def _status_response(
        cls,
        document: ResumeDocument,
        run: AgentRun,
        *,
        result: ResumeParsingResult | None,
        draft: ResumeImportDraft | None,
    ) -> ResumeParsingStatusResponse:
        if run.status == AgentRunStatus.QUEUED:
            return cls._response(
                resume_document_id=document.id,
                status_value="queued",
                run=run,
                error_code=None,
                failure_reason=None,
                can_retry=False,
                result_version=None,
                draft_version=None,
                draft_status=None,
            )
        if run.status == AgentRunStatus.RUNNING:
            return cls._response(
                resume_document_id=document.id,
                status_value="running",
                run=run,
                error_code=None,
                failure_reason=None,
                can_retry=False,
                result_version=None,
                draft_version=None,
                draft_status=None,
            )
        if run.status == AgentRunStatus.FAILED:
            if (
                not isinstance(run.error_code, str)
                or _SAFE_ERROR_CODE_PATTERN.fullmatch(run.error_code) is None
            ):
                raise _state_conflict()
            return cls._response(
                resume_document_id=document.id,
                status_value="failed",
                run=run,
                error_code=run.error_code,
                failure_reason=RESUME_PARSING_FAILURE_REASON,
                can_retry=True,
                result_version=None,
                draft_version=None,
                draft_status=None,
            )
        if run.status == AgentRunStatus.SUCCEEDED:
            cls._validate_succeeded(
                document=document,
                run=run,
                result=result,
                draft=draft,
            )
            assert result is not None
            assert draft is not None
            return cls._response(
                resume_document_id=document.id,
                status_value="succeeded",
                run=run,
                error_code=None,
                failure_reason=None,
                can_retry=False,
                result_version=result.result_version,
                draft_version=draft.draft_version,
                draft_status=draft.status,
            )
        raise _state_conflict()

    @staticmethod
    def _validate_succeeded(
        *,
        document: ResumeDocument,
        run: AgentRun,
        result: ResumeParsingResult | None,
        draft: ResumeImportDraft | None,
    ) -> None:
        if run.finished_at is None or run.result is None:
            raise _state_conflict()
        if result is None or draft is None:
            raise _state_conflict()
        if (
            result.user_id != document.user_id
            or result.resume_document_id != document.id
            or result.source_agent_run_id != run.id
            or draft.user_id != document.user_id
            or draft.resume_document_id != document.id
            or draft.source_agent_run_id != run.id
            or draft.status not in {READY, APPLIED, SUPERSEDED}
        ):
            raise _state_conflict()
        if (
            not isinstance(result.result_version, int)
            or isinstance(result.result_version, bool)
            or result.result_version < 1
            or not isinstance(draft.parsing_result_version, int)
            or isinstance(draft.parsing_result_version, bool)
            or draft.parsing_result_version < 1
            or draft.parsing_result_version != result.result_version
            or not isinstance(draft.draft_version, int)
            or isinstance(draft.draft_version, bool)
            or draft.draft_version < 1
        ):
            raise _state_conflict()

        try:
            agent_output = ResumeParsingOutput.model_validate(run.result)
            persisted_output = resume_parsing_output_from_result(result)
            try:
                resume_import_draft_data_from_model(draft)
            except ResumeImportStateError as exc:
                if exc.code == RESUME_IMPORT_DRAFT_INVALID:
                    raise APIError(
                        status.HTTP_409_CONFLICT,
                        RESUME_IMPORT_DRAFT_INVALID,
                    ) from None
                raise
            agent_json = agent_output.model_dump(mode="json")
            persisted_json = persisted_output.model_dump(mode="json")
            if _stable_json(run.result) != _stable_json(agent_json):
                raise _InvalidLifecycleState
            if _stable_json(agent_json) != _stable_json(persisted_json):
                raise _InvalidLifecycleState
        except (
            AttributeError,
            TypeError,
            ValueError,
            ValidationError,
            ResumeParsingStateError,
            ResumeImportStateError,
            _InvalidLifecycleState,
        ):
            raise _state_conflict() from None

    @staticmethod
    def _response(
        *,
        resume_document_id: UUID,
        status_value: str,
        run: AgentRun | None,
        error_code: str | None,
        failure_reason: str | None,
        can_retry: bool,
        result_version: int | None,
        draft_version: int | None,
        draft_status: str | None,
    ) -> ResumeParsingStatusResponse:
        try:
            return ResumeParsingStatusResponse(
                resume_document_id=resume_document_id,
                status=status_value,
                run_id=None if run is None else run.id,
                attempt_count=0 if run is None else run.attempt_count,
                max_attempts=None if run is None else run.max_attempts,
                error_code=error_code,
                failure_reason=failure_reason,
                can_retry=can_retry,
                created_at=None if run is None else run.created_at,
                started_at=None if run is None else run.started_at,
                finished_at=None if run is None else run.finished_at,
                result_version=result_version,
                draft_version=draft_version,
                draft_status=draft_status,
            )
        except (TypeError, ValueError, ValidationError):
            raise _state_conflict() from None


class _InvalidLifecycleState(Exception):
    pass


def _stable_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _document_not_found() -> APIError:
    return APIError(status.HTTP_404_NOT_FOUND, RESUME_DOCUMENT_NOT_FOUND)


def _state_conflict() -> APIError:
    return APIError(status.HTTP_409_CONFLICT, RESUME_PARSING_STATE_CONFLICT)


__all__ = [
    "RESUME_DOCUMENT_NOT_FOUND",
    "RESUME_DOCUMENT_NOT_READY",
    "RESUME_DOCUMENT_TEXT_MISSING",
    "RESUME_PARSING_FAILURE_REASON",
    "RESUME_PARSING_NOT_STARTED",
    "RESUME_PARSING_RETRY_NOT_ALLOWED",
    "RESUME_PARSING_RETRY_REQUIRED",
    "RESUME_PARSING_STATE_CONFLICT",
    "RESUME_PARSING_UNAVAILABLE",
    "ResumeParsingLifecycleService",
]
