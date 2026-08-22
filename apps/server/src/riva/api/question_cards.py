from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.language import normalize_interaction_language
from riva.core.question_cards import get_question_card_service
from riva.models import User
from riva.schemas.question_cards import (
    QuestionCardResponse,
    StartQuestionGenerationRequest,
)
from riva.services.question_cards import QuestionCardService

QuestionCardId = Annotated[UUID, Path(alias="questionCardId")]

router = APIRouter(
    prefix="/question-cards",
    tags=["question-cards"],
    dependencies=[Depends(csrf_protect)],
)


@router.post(
    "/generations",
    response_model=QuestionCardResponse,
)
async def start_question_generation(
    payload: StartQuestionGenerationRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    question_card_service: QuestionCardService = Depends(get_question_card_service),
) -> QuestionCardResponse:
    return await question_card_service.start_generation(
        current_user,
        payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.get(
    "/{questionCardId}",
    response_model=QuestionCardResponse,
)
async def get_question_card(
    question_card_id: QuestionCardId,
    current_user: User = Depends(require_current_user),
    question_card_service: QuestionCardService = Depends(get_question_card_service),
) -> QuestionCardResponse:
    return await question_card_service.get_question_card(
        user_id=current_user.id,
        question_card_id=question_card_id,
    )


__all__ = ["router"]
