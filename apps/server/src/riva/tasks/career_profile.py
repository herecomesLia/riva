from uuid import UUID

from procrastinate import JobContext

from riva.ai.career_profile import CareerProfileExtractor
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import (
    CareerProfile,
    CareerProfileContent,
    CareerProfileExtraction,
)
from riva.tasks import (
    Task,
    TaskAttempt,
    TaskErrorCode,
    app,
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
    attempt = TaskAttempt(context.job)
    async with resources.database.sessionmaker() as session:
        extraction = await session.get(CareerProfileExtraction, user_id)
        if extraction is None or not await attempt.is_current(
            session, extraction.job_id
        ):
            return

    try:
        content = await CareerProfileExtractor(resources.llm).from_text(text)
        async with resources.database.sessionmaker() as session:
            extraction = await session.get(
                CareerProfileExtraction, user_id, with_for_update=True
            )
            if extraction is None or not await attempt.lock_for_write(
                session, extraction.job_id
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
            await attempt.finish(session)
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
            if extraction is not None and await attempt.lock_for_write(
                session, extraction.job_id
            ):
                extraction.error_code = error_code
                await attempt.finish(session, failed=True)
                await session.commit()
        raise
