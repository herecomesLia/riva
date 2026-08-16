from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.training_record_reference_answers import (
    TrainingRecordReferenceAnswerService,
)
from riva.services.training_records import TrainingRecordService


async def get_training_record_service(
    session: AsyncSession = Depends(get_db_session),
) -> TrainingRecordService:
    return TrainingRecordService(session)


async def get_training_record_reference_answer_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> TrainingRecordReferenceAnswerService:
    settings = request.app.state.settings
    return TrainingRecordReferenceAnswerService(
        session,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
    )


__all__ = [
    "get_training_record_reference_answer_service",
    "get_training_record_service",
]
