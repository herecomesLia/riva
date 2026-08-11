from collections.abc import Callable
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import QuestionCard
from riva.schemas.practice_sessions import (
    PracticeActiveSessionResponse,
    PracticeAnsweringResponse,
    PracticeGeneratingQuestionResponse,
    PracticeGuidanceNotRequestedResponse,
    PracticeQuestionResponse,
    PracticeReferenceAnswerNotRequestedResponse,
    PracticeSessionSelection,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PracticeSessionService,
    PracticeSessionStateError,
    PracticeSessionWorkflowContext,
)


PRACTICE_QUESTION_GENERATION_UNAVAILABLE = (
    "practice_question_generation_unavailable"
)

PracticeSessionServiceFactory = Callable[..., PracticeSessionService]


class PracticeAPIService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        practice_service_factory: PracticeSessionServiceFactory = (
            PracticeSessionService
        ),
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.practice_service_factory = practice_service_factory

    async def start_session(
        self,
        *,
        user_id: UUID,
        payload: StartPracticeSessionRequest,
        interaction_language: InteractionLanguage,
    ) -> PracticeActiveSessionResponse:
        try:
            self._configured_model()
            context = await self._practice_service().start_session(
                user_id=user_id,
                selection=PracticeSessionSelection.model_validate(
                    payload.model_dump(mode="python", by_alias=False)
                ),
                interaction_language=interaction_language,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def refresh_question_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RefreshPracticeQuestionGenerationRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().refresh_question_generation(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def get_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().get_session_context(
                user_id=user_id,
                session_id=session_id,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    def _practice_service(self) -> PracticeSessionService:
        return self.practice_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _configured_model(self) -> str:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
            )
        return self.llm_model


PracticeSessionAPIService = PracticeAPIService


def build_practice_session_response(
    context: PracticeSessionWorkflowContext,
) -> PracticeGeneratingQuestionResponse | PracticeAnsweringResponse:
    try:
        base = {
            "session_id": context.session.id,
            "language": context.session.language,
            "version": context.session.version,
            "selection": PracticeSessionSelection(
                target_role_id=context.session.target_role_id,
                question_type=QuestionCardQuestionType(
                    context.attempt.question_type
                ),
                difficulty=QuestionCardDifficulty(context.attempt.difficulty),
                source=context.session.source,
                prioritize_weaknesses=context.session.prioritize_weaknesses,
            ),
            "started_at": context.session.started_at,
            "attempt_id": context.attempt.id,
            "attempt_number": context.attempt.attempt_number,
        }
        if context.attempt.status == "generatingQuestion":
            return PracticeGeneratingQuestionResponse(
                status="generatingQuestion",
                **base,
            )
        if context.attempt.status == "answering":
            if context.question_card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return PracticeAnsweringResponse(
                status="answering",
                question=build_practice_question_response(context.question_card),
                **base,
            )
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
    except PracticeSessionStateError:
        raise
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_question_response(card: QuestionCard) -> PracticeQuestionResponse:
    try:
        return PracticeQuestionResponse.model_validate(
            {
                "id": card.id,
                "prompt": card.prompt,
                "question_type": card.question_type,
                "difficulty": card.difficulty,
                "assessed_capabilities": list(card.assessed_capabilities),
                "recommended_materials": list(card.recommended_materials),
                "answer_hints": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "answer_framework": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "reference_answer": PracticeReferenceAnswerNotRequestedResponse(
                    status="notRequested"
                ),
                "is_saved": card.is_saved,
                "is_marked_weak": card.is_marked_weak,
            }
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def practice_session_state_api_error(error: PracticeSessionStateError) -> APIError:
    error_status = (
        status.HTTP_404_NOT_FOUND
        if error.code == PRACTICE_SESSION_NOT_FOUND
        else status.HTTP_409_CONFLICT
    )
    return APIError(error_status, error.code)


__all__ = [
    "PRACTICE_QUESTION_GENERATION_UNAVAILABLE",
    "PracticeAPIService",
    "PracticeSessionAPIService",
    "build_practice_question_response",
    "build_practice_session_response",
    "practice_session_state_api_error",
]
