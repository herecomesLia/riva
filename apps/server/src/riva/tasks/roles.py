from uuid import UUID

from procrastinate import JobContext
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from riva.ai.roles import JobDescriptionExtractor
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.role import JobDescription, JobDescriptionContent, Role
from riva.tasks import (
    JobStatus,
    Task,
    TaskErrorCode,
    app,
    get_job_status,
    get_task_resources,
)
from riva.utils import utc_now


@app.task(
    name=Task.EXTRACT_JD_TEXT.name,
    queue=Task.EXTRACT_JD_TEXT.queue,
    pass_context=True,
    retry=False,
)
async def extract_jd_text(context: JobContext, *, role_id: str, text: str) -> None:
    resources = get_task_resources(context)
    role_id = UUID(role_id)
    job_id = context.job.id
    async with resources.database.sessionmaker() as session:
        jd = await session.get(JobDescription, role_id)
        if jd is None or jd.extraction_job_id != job_id:
            return

    try:
        content = await JobDescriptionExtractor(resources.llm).from_text(text)
        async with resources.database.sessionmaker() as session:
            jd = await session.get(JobDescription, role_id, with_for_update=True)
            if jd is None or not await _can_write_jd_extraction(
                session, jd, job_id=job_id
            ):
                return
            await _apply_jd_extraction(session, jd, content)
            await session.commit()
    except Exception as exc:
        if isinstance(exc, LLMOutputError):
            error_code = TaskErrorCode.INVALID_OUTPUT
        elif isinstance(exc, LLMUnavailableError):
            error_code = TaskErrorCode.LLM_UNAVAILABLE
        else:
            error_code = TaskErrorCode.INTERNAL_ERROR
        async with resources.database.sessionmaker() as session:
            jd = await session.get(JobDescription, role_id, with_for_update=True)
            if jd is not None and await _can_write_jd_extraction(
                session, jd, job_id=job_id
            ):
                jd.extraction_error_code = error_code
                await session.commit()
        raise


async def _can_write_jd_extraction(
    session: AsyncSession, jd: JobDescription, *, job_id: int
) -> bool:
    # The caller must hold the JD row lock until the write is committed.
    if jd.extraction_job_id != job_id:
        return False
    # An abort request keeps the job ID but revokes permission to write.
    return await get_job_status(session, job_id) is JobStatus.RUNNING


async def _apply_jd_extraction(
    session: AsyncSession, jd: JobDescription, content: JobDescriptionContent
) -> None:
    for field in JobDescriptionContent.model_fields:
        setattr(jd, field, getattr(content, field))
    jd.extraction_job_id = None
    jd.extraction_error_code = None
    await session.execute(
        update(Role).where(Role.id == jd.role_id).values(updated_at=utc_now())
    )
