from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.training_records import TrainingRecordService


async def get_training_record_service(
    session: AsyncSession = Depends(get_db_session),
) -> TrainingRecordService:
    return TrainingRecordService(session)


__all__ = ["get_training_record_service"]
