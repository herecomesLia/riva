from uuid import UUID

from procrastinate import JobContext
from sqlalchemy.ext.asyncio import AsyncSession

from riva.ai.career_profile import CareerProfileExtractor
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import (
    CareerProfile,
    CareerProfileContent,
    CareerProfileExtraction,
)
from riva.tasks import (
    JobStatus,
    Task,
    TaskErrorCode,
    app,
    get_job_status,
    get_task_resources,
)


@app.task(
    name=Task.EXTRACT_CAREER_PROFILE_TEXT.name,
    queue=Task.EXTRACT_CAREER_PROFILE_TEXT.queue,
    pass_context=True,
    retry=False,
)
async def extract_career_profile_text(
    context: JobContext, *, user_id: str, text: str
) -> None:
    resources = get_task_resources(context)
    user_id = UUID(user_id)
    job_id = context.job.id
    async with resources.database.sessionmaker() as session:
        extraction = await session.get(CareerProfileExtraction, user_id)
        if extraction is None or extraction.job_id != job_id:
            return

    try:
        content = await CareerProfileExtractor(resources.llm).from_text(text)
        async with resources.database.sessionmaker() as session:
            extraction = await session.get(
                CareerProfileExtraction, user_id, with_for_update=True
            )
            if extraction is None or not await _can_write_career_profile_extraction(
                session, extraction, job_id=job_id
            ):
                return
            profile = await session.get(CareerProfile, user_id)
            if profile is None:
                profile = CareerProfile(user_id=user_id)
                session.add(profile)
            for field in CareerProfileContent.model_fields:
                setattr(profile, field, getattr(content, field))
            extraction.job_id = None
            extraction.error_code = None
            await session.commit()
    except Exception as exc:
        if isinstance(exc, LLMOutputError):
            error_code = TaskErrorCode.INVALID_OUTPUT
        elif isinstance(exc, LLMUnavailableError):
            error_code = TaskErrorCode.LLM_UNAVAILABLE
        else:
            error_code = TaskErrorCode.INTERNAL_ERROR
        async with resources.database.sessionmaker() as session:
            extraction = await session.get(
                CareerProfileExtraction, user_id, with_for_update=True
            )
            if extraction is not None and await _can_write_career_profile_extraction(
                session, extraction, job_id=job_id
            ):
                extraction.error_code = error_code
                await session.commit()
        raise


async def _can_write_career_profile_extraction(
    session: AsyncSession, extraction: CareerProfileExtraction, *, job_id: int
) -> bool:
    # The caller must hold the extraction row lock until the write is committed.
    if extraction.job_id != job_id:
        return False
    # An abort request keeps the job ID but revokes permission to write.
    return await get_job_status(session, job_id) is JobStatus.RUNNING
