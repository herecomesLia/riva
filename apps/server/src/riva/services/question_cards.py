import re
from collections.abc import Callable
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import AgentRun, AgentRunStatus, QuestionCard, User
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
    QuestionCardResponse,
    QuestionGenerationStatusResponse,
    StartQuestionGenerationRequest,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.question_generation import (
    QUESTION_GENERATION_TARGET_NOT_FOUND,
    QuestionGenerationService,
    QuestionGenerationStateError,
    question_generation_output_from_card,
    validate_question_generation_run,
)

QUESTION_GENERATION_FAILURE_REASON = (
    "The question could not be generated right now. Please try again."
)
QUESTION_GENERATION_REQUEST_CONFLICT = "question_generation_request_conflict"
QUESTION_GENERATION_NOT_FOUND = "question_generation_not_found"
QUESTION_GENERATION_STATE_CONFLICT = "question_generation_state_conflict"
QUESTION_GENERATION_UNAVAILABLE = "question_generation_unavailable"
QUESTION_CARD_NOT_FOUND = "question_card_not_found"

_SAFE_ERROR_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
QuestionGenerationServiceFactory = Callable[..., QuestionGenerationService]


class QuestionCardService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        generation_service_factory: QuestionGenerationServiceFactory = (
            QuestionGenerationService
        ),
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.generation_service_factory = generation_service_factory

    async def start_generation(
        self,
        user: User,
        payload: StartQuestionGenerationRequest,
        *,
        interaction_language: InteractionLanguage,
    ) -> QuestionGenerationStatusResponse:
        try:
            idempotency_key = f"question-generation:{payload.request_id}"
            existing = await self._existing_run(
                user_id=user.id,
                idempotency_key=idempotency_key,
            )
            if existing is not None:
                existing_payload = self._validate_replay_payload(existing)
                self._require_replay_intent(
                    existing_payload,
                    payload,
                    interaction_language,
                )
                return await self._status_response(existing)

            self._configured_model()
            try:
                run = await self._generation_service().enqueue_generation(
                    user_id=user.id,
                    target_role_id=payload.target_role_id,
                    question_type=payload.question_type,
                    difficulty=payload.difficulty,
                    interaction_language=interaction_language,
                    idempotency_key=idempotency_key,
                )
            except QuestionGenerationStateError as error:
                raise question_generation_state_api_error(error) from None

            run_payload = self._validate_replay_payload(run)
            self._require_replay_intent(
                run_payload,
                payload,
                interaction_language,
            )
            return await self._status_response(run)
        except BaseException:
            await self.session.rollback()
            raise

    async def get_generation_status(
        self,
        *,
        user_id: UUID,
        run_id: UUID,
    ) -> QuestionGenerationStatusResponse:
        run = await self._load_run(user_id=user_id, run_id=run_id)
        return await self._status_response(run)

    async def get_question_card(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
    ) -> QuestionCardResponse:
        card = await self.session.scalar(
            select(QuestionCard).where(
                QuestionCard.id == question_card_id,
                QuestionCard.user_id == user_id,
            )
        )
        if card is None:
            raise APIError(status.HTTP_404_NOT_FOUND, QUESTION_CARD_NOT_FOUND)
        return build_question_card_response(card)

    def _generation_service(self) -> QuestionGenerationService:
        return self.generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _configured_model(self) -> str:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                QUESTION_GENERATION_UNAVAILABLE,
            )
        return self.llm_model

    async def _existing_run(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
    ) -> AgentRun | None:
        prompt = QUESTION_GENERATION_PROMPT
        return await self.session.scalar(
            select(AgentRun)
            .where(
                AgentRun.user_id == user_id,
                AgentRun.agent_id == "question-generator",
                AgentRun.prompt_id == prompt.prompt_id,
                AgentRun.output_schema_id == prompt.output_schema_id,
                AgentRun.idempotency_key == idempotency_key,
            )
            .order_by(AgentRun.created_at.asc(), AgentRun.id.asc())
            .limit(1)
        )

    async def _load_run(self, *, user_id: UUID, run_id: UUID) -> AgentRun:
        run = await self.session.scalar(
            select(AgentRun).where(
                AgentRun.id == run_id,
                AgentRun.user_id == user_id,
            )
        )
        if run is None:
            raise APIError(status.HTTP_404_NOT_FOUND, QUESTION_GENERATION_NOT_FOUND)
        return run

    async def _status_response(
        self,
        run: AgentRun,
    ) -> QuestionGenerationStatusResponse:
        payload = self._validate_run(run)
        question_card: QuestionCardResponse | None = None

        if run.status == AgentRunStatus.SUCCEEDED:
            if run.finished_at is None:
                raise _state_conflict()
            card = await self.session.scalar(
                select(QuestionCard).where(
                    QuestionCard.source_agent_run_id == run.id,
                    QuestionCard.user_id == run.user_id,
                )
            )
            if card is None or not self._card_lineage_matches(card, run, payload):
                raise _state_conflict()
            try:
                question_generation_output_from_card(card)
            except AttributeError, TypeError, ValueError, ValidationError:
                raise _state_conflict() from None
            question_card = build_question_card_response(card)
        elif run.status == AgentRunStatus.FAILED:
            if (
                not isinstance(run.error_code, str)
                or _SAFE_ERROR_CODE_PATTERN.fullmatch(run.error_code) is None
            ):
                raise _state_conflict()
        elif run.status not in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
        }:
            raise _state_conflict()

        try:
            return QuestionGenerationStatusResponse(
                run_id=run.id,
                status=run.status.value,
                question_type=payload.question_type,
                difficulty=payload.difficulty,
                language=payload.interaction_language,
                attempt_count=run.attempt_count,
                max_attempts=run.max_attempts,
                error_code=(
                    run.error_code if run.status == AgentRunStatus.FAILED else None
                ),
                failure_reason=(
                    QUESTION_GENERATION_FAILURE_REASON
                    if run.status == AgentRunStatus.FAILED
                    else None
                ),
                created_at=run.created_at,
                started_at=run.started_at,
                finished_at=run.finished_at,
                question_card=question_card,
            )
        except AttributeError, TypeError, ValueError, ValidationError:
            raise _state_conflict() from None

    @staticmethod
    def _validate_run(run: AgentRun) -> QuestionGenerationRunPayload:
        try:
            return validate_question_generation_run(run)
        except QuestionGenerationStateError:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                QUESTION_GENERATION_NOT_FOUND,
            ) from None

    @staticmethod
    def _validate_replay_payload(
        run: AgentRun,
    ) -> QuestionGenerationRunPayload:
        try:
            return validate_question_generation_run(run)
        except ValidationError, QuestionGenerationStateError:
            raise _state_conflict() from None

    @staticmethod
    def _require_replay_intent(
        existing_payload: QuestionGenerationRunPayload,
        request: StartQuestionGenerationRequest,
        interaction_language: InteractionLanguage,
    ) -> None:
        if (
            existing_payload.role_id != request.target_role_id
            or existing_payload.question_type != request.question_type
            or existing_payload.difficulty != request.difficulty
            or existing_payload.interaction_language != interaction_language
        ):
            raise APIError(
                status.HTTP_409_CONFLICT,
                QUESTION_GENERATION_REQUEST_CONFLICT,
            )

    @staticmethod
    def _card_lineage_matches(
        card: QuestionCard,
        run: AgentRun,
        payload: QuestionGenerationRunPayload,
    ) -> bool:
        return (
            card.user_id == run.user_id
            and card.target_role_id == payload.role_id
            and card.profile_id == payload.profile_id
            and card.source_agent_run_id == run.id
            and card.matching_analysis_run_id == payload.matching_analysis_run_id
            and card.language == payload.interaction_language
            and card.question_type == payload.question_type.value
            and card.difficulty == payload.difficulty.value
            and card.profile_version == payload.profile_version
            and card.job_description_version == payload.job_description_version
            and card.job_description_analysis_version
            == payload.job_description_analysis_version
        )


def build_question_card_response(card: QuestionCard) -> QuestionCardResponse:
    try:
        return QuestionCardResponse(
            id=card.id,
            target_role_id=card.target_role_id,
            language=card.language,
            question_type=QuestionCardQuestionType(card.question_type),
            difficulty=QuestionCardDifficulty(card.difficulty),
            prompt=card.prompt,
            assessed_capabilities=list(card.assessed_capabilities),
            recommended_materials=list(card.recommended_materials),
            answer_hints=list(card.answer_hints),
            answer_framework=list(card.answer_framework),
            is_saved=card.is_saved,
            is_marked_weak=card.is_marked_weak,
            created_at=card.created_at,
            updated_at=card.updated_at,
        )
    except AttributeError, TypeError, ValueError, ValidationError:
        raise _state_conflict() from None


def question_generation_state_api_error(
    error: QuestionGenerationStateError,
) -> APIError:
    if error.code == QUESTION_GENERATION_TARGET_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


def _state_conflict() -> APIError:
    return APIError(
        status.HTTP_409_CONFLICT,
        QUESTION_GENERATION_STATE_CONFLICT,
    )


__all__ = [
    "QUESTION_CARD_NOT_FOUND",
    "QUESTION_GENERATION_FAILURE_REASON",
    "QUESTION_GENERATION_NOT_FOUND",
    "QUESTION_GENERATION_REQUEST_CONFLICT",
    "QUESTION_GENERATION_STATE_CONFLICT",
    "QUESTION_GENERATION_UNAVAILABLE",
    "QuestionCardService",
    "build_question_card_response",
    "question_generation_state_api_error",
]
