from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.llm import get_llm_provider
from riva.db import get_db_session
from riva.services.question_cards import QuestionCardService


async def get_question_card_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> QuestionCardService:
    settings = request.app.state.settings
    return QuestionCardService(
        session,
        llm_provider=get_llm_provider(request),
        llm_model=settings.llm_model,
    )


__all__ = ["get_question_card_service"]
