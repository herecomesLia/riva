from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.agent_execution import get_agent_executor
from riva.db import get_db_session
from riva.services.question_cards import QuestionCardService


async def get_question_card_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> QuestionCardService:
    settings = request.app.state.settings
    return QuestionCardService(
        session,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        agent_executor=get_agent_executor(request),
    )


__all__ = ["get_question_card_service"]
