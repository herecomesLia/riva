from uuid import UUID

from procrastinate import JobContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from riva.ai.roles import JobDescriptionExtractor, RoleMatchingAnalyzer
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.role import JobDescription, JobDescriptionContent, Role, RoleMatching
from riva.tasks import (
    JobStatus,
    Task,
    TaskErrorCode,
    app,
    get_job_status,
    get_task_resources,
)
from riva.tasks.errors import TaskError
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
    jd.updated_at = utc_now()
    jd.extraction_job_id = None
    jd.extraction_error_code = None
    await session.execute(
        update(Role).where(Role.id == jd.role_id).values(updated_at=utc_now())
    )


@app.task(
    name=Task.ANALYZE_ROLE_MATCHING.name,
    queue=Task.ANALYZE_ROLE_MATCHING.queue,
    pass_context=True,
    retry=False,
)
async def analyze_role_matching(context: JobContext, *, role_id: str) -> None:
    resources = get_task_resources(context)
    role_id = UUID(role_id)
    job_id = context.job.id
    try:
        async with resources.database.sessionmaker() as session:
            matching = await session.get(RoleMatching, role_id)
            if matching is None or matching.job_id != job_id:
                return
            # Read both content rows and their versions in one statement snapshot.
            row = (
                await session.execute(
                    select(JobDescription, CareerProfile)
                    .select_from(Role)
                    .join(JobDescription, JobDescription.role_id == Role.id)
                    .join(CareerProfile, CareerProfile.user_id == Role.user_id)
                    .where(Role.id == role_id)
                )
            ).one_or_none()
            if row is None:
                raise TaskError(
                    "Role matching requires a job description and career profile."
                )
            jd, profile = row
            profile_content = CareerProfileContent.model_validate(
                profile, from_attributes=True
            ).model_copy(deep=True)
            jd_content = JobDescriptionContent.model_validate(
                jd, from_attributes=True
            ).model_copy(deep=True)
            profile_updated_at = profile.updated_at
            jd_updated_at = jd.updated_at

        result = await RoleMatchingAnalyzer(resources.llm).analyze(
            profile_content, jd_content
        )
        async with resources.database.sessionmaker() as session:
            matching = await session.get(RoleMatching, role_id, with_for_update=True)
            if matching is None or not await _can_write_role_matching(
                session, matching, job_id=job_id
            ):
                return
            matching.result = result
            matching.profile_updated_at = profile_updated_at
            matching.jd_updated_at = jd_updated_at
            matching.generated_at = utc_now()
            matching.job_id = None
            matching.error_code = None
            await session.commit()
    except Exception as exc:
        if isinstance(exc, LLMOutputError):
            error_code = TaskErrorCode.INVALID_OUTPUT
        elif isinstance(exc, LLMUnavailableError):
            error_code = TaskErrorCode.LLM_UNAVAILABLE
        else:
            error_code = TaskErrorCode.INTERNAL_ERROR
        async with resources.database.sessionmaker() as session:
            matching = await session.get(RoleMatching, role_id, with_for_update=True)
            if matching is not None and await _can_write_role_matching(
                session, matching, job_id=job_id
            ):
                matching.error_code = error_code
                await session.commit()
        raise


async def _can_write_role_matching(
    session: AsyncSession, matching: RoleMatching, *, job_id: int
) -> bool:
    # The caller holds the matching row lock until commit. Abort revokes writes
    # even when the current job ID has not changed.
    if matching.job_id != job_id:
        return False
    return await get_job_status(session, job_id) is JobStatus.RUNNING
