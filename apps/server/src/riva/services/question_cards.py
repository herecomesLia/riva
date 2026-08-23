from uuid import UUID

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.integrations import LLMProvider
from riva.models import QuestionCard, User
from riva.schemas.question_cards import (
    QuestionCardResponse,
    StartQuestionGenerationRequest,
)
from riva.services.question_generation import (
    QuestionGenerationService,
    QuestionGenerationStateError,
)

QUESTION_GENERATION_UNAVAILABLE = "question_generation_unavailable"
QUESTION_CARD_NOT_FOUND = "question_card_not_found"


class QuestionCardService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()

    async def start_generation(
        self,
        user: User,
        payload: StartQuestionGenerationRequest,
        *,
        interaction_language: InteractionLanguage,
    ) -> QuestionCardResponse:
        if self.llm_provider is None or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE, QUESTION_GENERATION_UNAVAILABLE
            )
        try:
            card = await QuestionGenerationService(
                self.session,
                llm_provider=self.llm_provider,
                llm_model=self.llm_model,
            ).generate(
                user_id=user.id,
                target_role_id=payload.target_role_id,
                question_type=payload.question_type,
                difficulty=payload.difficulty,
                interaction_language=interaction_language,
            )
            return build_question_card_response(card)
        except QuestionGenerationStateError as error:
            await self.session.rollback()
            raise APIError(status.HTTP_409_CONFLICT, error.code) from None
        except Exception:
            await self.session.rollback()
            raise

    async def get_question_card(
        self, *, user_id: UUID, question_card_id: UUID
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


def build_question_card_response(card: QuestionCard) -> QuestionCardResponse:
    return QuestionCardResponse(
        id=card.id,
        target_role_id=card.target_role_id,
        language=card.language,
        question_type=card.question_type,
        difficulty=card.difficulty,
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


__all__ = ["QuestionCardService", "build_question_card_response"]
