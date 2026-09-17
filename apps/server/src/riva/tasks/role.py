from uuid import UUID

from procrastinate import JobContext
from sqlalchemy import select, update

from riva.ai.role import JobDescriptionExtractor, RoleMatchingAnalyzer
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.role import (
    JobDescription,
    JobDescriptionContent,
    JobDescriptionExtraction,
    Role,
    RoleMatching,
    RoleMatchingAnalysis,
)
from riva.tasks import (
    Task,
    TaskAttempt,
    TaskErrorCode,
    app,
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
    attempt = TaskAttempt(context.job)
    async with resources.database.sessionmaker() as session:
        extraction = await session.get(JobDescriptionExtraction, role_id)
        if extraction is None or not await attempt.is_current(
            session, extraction.job_id
        ):
            return

    try:
        content = await JobDescriptionExtractor(resources.llm).from_text(text)
        async with resources.database.sessionmaker() as session:
            extraction = await session.get(
                JobDescriptionExtraction, role_id, with_for_update=True
            )
            if extraction is None or not await attempt.lock_for_write(
                session, extraction.job_id
            ):
                return
            jd = await session.get(JobDescription, role_id)
            if jd is None:
                raise TaskError("Job description was not found.")
            content_changed = any(
                getattr(jd, field) != getattr(content, field)
                for field in JobDescriptionContent.model_fields
            )
            for field in JobDescriptionContent.model_fields:
                setattr(jd, field, getattr(content, field))
            if content_changed:
                jd.updated_at = utc_now()
                await session.execute(
                    update(Role)
                    .where(Role.id == jd.role_id)
                    .values(updated_at=jd.updated_at)
                )
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
                JobDescriptionExtraction, role_id, with_for_update=True
            )
            if extraction is not None and await attempt.lock_for_write(
                session, extraction.job_id
            ):
                extraction.error_code = error_code
                await attempt.finish(session, failed=True)
                await session.commit()
        raise


@app.task(
    name=Task.ANALYZE_ROLE_MATCHING.name,
    queue=Task.ANALYZE_ROLE_MATCHING.queue,
    pass_context=True,
    retry=False,
)
async def analyze_role_matching(context: JobContext, *, role_id: str) -> None:
    resources = get_task_resources(context)
    role_id = UUID(role_id)
    attempt = TaskAttempt(context.job)
    try:
        async with resources.database.sessionmaker() as session:
            analysis = await session.get(RoleMatchingAnalysis, role_id)
            if analysis is None or not await attempt.is_current(
                session, analysis.job_id
            ):
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
            analysis = await session.get(
                RoleMatchingAnalysis, role_id, with_for_update=True
            )
            if analysis is None or not await attempt.lock_for_write(
                session, analysis.job_id
            ):
                return
            matching = await session.get(RoleMatching, role_id)
            if matching is None:
                raise TaskError("Role matching result resource was not found.")
            matching.result = result
            matching.profile_updated_at = profile_updated_at
            matching.jd_updated_at = jd_updated_at
            matching.generated_at = utc_now()
            analysis.job_id = None
            analysis.error_code = None
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
            analysis = await session.get(
                RoleMatchingAnalysis, role_id, with_for_update=True
            )
            if analysis is not None and await attempt.lock_for_write(
                session, analysis.job_id
            ):
                analysis.error_code = error_code
                await attempt.finish(session, failed=True)
                await session.commit()
        raise
