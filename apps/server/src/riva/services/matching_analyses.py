from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, TypeVar, cast

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import MATCHING_ANALYSIS_PROMPT, MATCHING_ANALYSIS_PROMPT_V1
from riva.schemas.job_description_parsing import JobDescriptionParsingOutput
from riva.schemas.matching_analysis import (
    MAX_MATCHING_EDUCATION_ITEMS,
    MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
    MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
    MAX_MATCHING_EXPERIENCE_SKILLS,
    MAX_MATCHING_PROFILE_SKILLS,
    MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS,
    MAX_MATCHING_WORK_EXPERIENCE_ITEMS,
    MatchingAnalysisInput,
    MatchingAnalysisOutput,
    MatchingAnalysisRunPayload,
    MatchingCareerProfile,
    MatchingJobContext,
    MatchingProfileEducation,
    MatchingProfileProjectExperience,
    MatchingProfileWorkExperience,
)
from riva.services.profile_completion import career_profile_completed
from riva.utils import utc_now


MatchingAnalysisStateErrorCode = Literal[
    "invalid_matching_analysis_run",
    "matching_target_not_found",
    "matching_profile_not_found",
    "matching_profile_incomplete",
    "matching_profile_version_stale",
    "matching_job_description_not_ready",
    "matching_job_description_version_stale",
    "matching_job_description_analysis_not_ready",
    "matching_job_description_analysis_version_stale",
    "matching_analysis_superseded",
]

INVALID_MATCHING_ANALYSIS_RUN: MatchingAnalysisStateErrorCode = (
    "invalid_matching_analysis_run"
)
MATCHING_TARGET_NOT_FOUND: MatchingAnalysisStateErrorCode = (
    "matching_target_not_found"
)
MATCHING_PROFILE_NOT_FOUND: MatchingAnalysisStateErrorCode = (
    "matching_profile_not_found"
)
MATCHING_PROFILE_INCOMPLETE: MatchingAnalysisStateErrorCode = (
    "matching_profile_incomplete"
)
MATCHING_PROFILE_VERSION_STALE: MatchingAnalysisStateErrorCode = (
    "matching_profile_version_stale"
)
MATCHING_JOB_DESCRIPTION_NOT_READY: MatchingAnalysisStateErrorCode = (
    "matching_job_description_not_ready"
)
MATCHING_JOB_DESCRIPTION_VERSION_STALE: MatchingAnalysisStateErrorCode = (
    "matching_job_description_version_stale"
)
MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY: MatchingAnalysisStateErrorCode = (
    "matching_job_description_analysis_not_ready"
)
MATCHING_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE: MatchingAnalysisStateErrorCode = (
    "matching_job_description_analysis_version_stale"
)
MATCHING_ANALYSIS_SUPERSEDED: MatchingAnalysisStateErrorCode = (
    "matching_analysis_superseded"
)


class MatchingAnalysisStateError(RuntimeError):
    safe_message = "The matching analysis state is invalid."

    def __init__(self, code: MatchingAnalysisStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


_Item = TypeVar("_Item")


def stable_unique_texts(
    values: Iterable[str],
    *,
    limit: int | None = None,
) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        value = value.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized if limit is None else normalized[:limit]


def build_matching_career_profile(
    profile: CareerProfile,
) -> MatchingCareerProfile:
    education = [
        MatchingProfileEducation(
            school=item.school,
            degree=item.degree,
            major=item.major,
            start_date=item.start_date,
            end_date=item.end_date,
            is_current=item.is_current,
        )
        for item in _ordered(
            profile.education,
            limit=MAX_MATCHING_EDUCATION_ITEMS,
        )
    ]
    work_experiences = [
        MatchingProfileWorkExperience(
            company=item.company,
            title=item.title,
            employment_type=item.employment_type,
            location=item.location,
            start_date=item.start_date,
            end_date=item.end_date,
            is_current=item.is_current,
            responsibilities=stable_unique_texts(
                item.responsibilities,
                limit=MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
            ),
            achievements=stable_unique_texts(
                item.achievements,
                limit=MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
            ),
            skills=stable_unique_texts(
                [
                    link.skill.name
                    for link in _ordered(item.skill_links, limit=None)
                ],
                limit=MAX_MATCHING_EXPERIENCE_SKILLS,
            ),
        )
        for item in _ordered(
            profile.work_experiences,
            limit=MAX_MATCHING_WORK_EXPERIENCE_ITEMS,
        )
    ]
    project_experiences = [
        MatchingProfileProjectExperience(
            name=item.name,
            role=item.role,
            start_date=item.start_date,
            end_date=item.end_date,
            responsibilities=stable_unique_texts(
                item.responsibilities,
                limit=MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
            ),
            achievements=stable_unique_texts(
                item.achievements,
                limit=MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
            ),
            skills=stable_unique_texts(
                [
                    link.skill.name
                    for link in _ordered(item.skill_links, limit=None)
                ],
                limit=MAX_MATCHING_EXPERIENCE_SKILLS,
            ),
        )
        for item in _ordered(
            profile.project_experiences,
            limit=MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS,
        )
    ]
    return MatchingCareerProfile(
        summary=profile.summary,
        education=education,
        work_experiences=work_experiences,
        project_experiences=project_experiences,
        skills=stable_unique_texts(
            [item.name for item in _ordered(profile.skills, limit=None)],
            limit=MAX_MATCHING_PROFILE_SKILLS,
        ),
    )


def build_matching_job_context(
    role: TargetRole,
    analysis: JobDescriptionAnalysis,
) -> MatchingJobContext:
    job_description_analysis = JobDescriptionParsingOutput(
        riva_summary=analysis.riva_summary,
        responsibilities=analysis.responsibilities,
        qualification_requirements=analysis.qualification_requirements,
        required_skills=analysis.required_skills,
        preferred_qualifications=analysis.preferred_qualifications,
        soft_skills=analysis.soft_skills,
        business_domains=analysis.business_domains,
    )
    return MatchingJobContext(
        role_title=role.title,
        company=role.company,
        job_description_analysis=job_description_analysis,
    )


@dataclass(frozen=True)
class _MatchingContext:
    payload: MatchingAnalysisRunPayload
    role: TargetRole
    profile: CareerProfile
    job_description_analysis: JobDescriptionAnalysis
    existing: MatchingAnalysis | None


class MatchingAnalysisService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def load_matching_input(
        self,
        run: AgentRun,
    ) -> MatchingAnalysisInput:
        try:
            context = await self._validated_context(run, for_update=False)
            matching_input = _build_matching_input(context)

            await self.session.commit()
            return matching_input
        except Exception:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: MatchingAnalysisOutput,
    ) -> MatchingAnalysis:
        try:
            context = await self._validated_context(run, for_update=True)
            _build_matching_input(context)
            existing = context.existing
            if existing is not None:
                is_same_run = existing.source_agent_run_id == run.id
                is_same_dependency = (
                    existing.profile_id == context.payload.profile_id
                    and existing.profile_version == context.payload.profile_version
                    and existing.job_description_version
                    == context.payload.job_description_version
                    and existing.job_description_analysis_version
                    == context.payload.job_description_analysis_version
                )
                if is_same_run and is_same_dependency:
                    await self.session.commit()
                    return existing
                if is_same_run:
                    raise MatchingAnalysisStateError(
                        INVALID_MATCHING_ANALYSIS_RUN
                    )

            conflicting_source = await self.session.scalar(
                select(MatchingAnalysis).where(
                    MatchingAnalysis.source_agent_run_id == run.id,
                    MatchingAnalysis.role_id != context.role.id,
                )
            )
            if conflicting_source is not None:
                raise MatchingAnalysisStateError(INVALID_MATCHING_ANALYSIS_RUN)

            now = self.clock()
            _require_aware_datetime(now)
            values = output.model_dump(mode="json")
            if existing is None:
                analysis = MatchingAnalysis(
                    role_id=context.role.id,
                    user_id=context.role.user_id,
                    profile_id=context.payload.profile_id,
                    profile_version=context.payload.profile_version,
                    job_description_version=(
                        context.payload.job_description_version
                    ),
                    job_description_analysis_version=(
                        context.payload.job_description_analysis_version
                    ),
                    source_agent_run_id=run.id,
                    generated_at=now,
                    overall_match_score=cast(int, values["overall_match_score"]),
                    core_requirements_summary=cast(
                        str,
                        values["core_requirements_summary"],
                    ),
                    matched_capabilities=_copy_list(
                        values["matched_capabilities"]
                    ),
                    missing_capabilities=_copy_list(
                        values["missing_capabilities"]
                    ),
                    underrepresented_capabilities=_copy_list(
                        values["underrepresented_capabilities"]
                    ),
                    resume_highlights=_copy_list(values["resume_highlights"]),
                    resume_gaps=_copy_list(values["resume_gaps"]),
                    high_risk_questions=_copy_list(values["high_risk_questions"]),
                    preparation_recommendations=_copy_list(
                        values["preparation_recommendations"]
                    ),
                )
                self.session.add(analysis)
            else:
                analysis = existing
                analysis.user_id = context.role.user_id
                analysis.profile_id = context.payload.profile_id
                analysis.profile_version = context.payload.profile_version
                analysis.job_description_version = (
                    context.payload.job_description_version
                )
                analysis.job_description_analysis_version = (
                    context.payload.job_description_analysis_version
                )
                analysis.source_agent_run_id = run.id
                analysis.generated_at = now
                analysis.overall_match_score = cast(
                    int,
                    values["overall_match_score"],
                )
                analysis.core_requirements_summary = cast(
                    str,
                    values["core_requirements_summary"],
                )
                analysis.matched_capabilities = _copy_list(
                    values["matched_capabilities"]
                )
                analysis.missing_capabilities = _copy_list(
                    values["missing_capabilities"]
                )
                analysis.underrepresented_capabilities = _copy_list(
                    values["underrepresented_capabilities"]
                )
                analysis.resume_highlights = _copy_list(
                    values["resume_highlights"]
                )
                analysis.resume_gaps = _copy_list(values["resume_gaps"])
                analysis.high_risk_questions = _copy_list(
                    values["high_risk_questions"]
                )
                analysis.preparation_recommendations = _copy_list(
                    values["preparation_recommendations"]
                )

            context.role.matching_analysis_run_id = run.id
            context.role.version += 1
            await self.session.commit()
            return analysis
        except Exception:
            await self.session.rollback()
            raise

    async def _validated_context(
        self,
        run: AgentRun,
        *,
        for_update: bool,
    ) -> _MatchingContext:
        prompt = MATCHING_ANALYSIS_PROMPT
        if (
            run.agent_id != "matching-analyzer"
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version
            not in {MATCHING_ANALYSIS_PROMPT_V1.version, prompt.version}
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise MatchingAnalysisStateError(INVALID_MATCHING_ANALYSIS_RUN)

        try:
            payload = MatchingAnalysisRunPayload.model_validate(run.payload)
        except ValidationError:
            raise MatchingAnalysisStateError(INVALID_MATCHING_ANALYSIS_RUN) from None

        if for_update:
            user_exists = await self.session.scalar(
                select(User.id).where(User.id == run.user_id).with_for_update()
            )
            if user_exists is None:
                raise MatchingAnalysisStateError(MATCHING_TARGET_NOT_FOUND)

        role_statement = select(TargetRole).where(
            TargetRole.id == payload.role_id,
            TargetRole.user_id == run.user_id,
        )
        if for_update:
            role_statement = role_statement.with_for_update()
        role = await self.session.scalar(role_statement)
        if role is None:
            raise MatchingAnalysisStateError(MATCHING_TARGET_NOT_FOUND)
        if role.matching_analysis_run_id != run.id:
            raise MatchingAnalysisStateError(MATCHING_ANALYSIS_SUPERSEDED)

        profile_statement = (
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(
                CareerProfile.profile_id == payload.profile_id,
                CareerProfile.user_id == run.user_id,
            )
        )
        if for_update:
            profile_statement = profile_statement.with_for_update()
        profile = await self.session.scalar(profile_statement)
        if profile is None:
            raise MatchingAnalysisStateError(MATCHING_PROFILE_NOT_FOUND)
        if profile.version != payload.profile_version:
            raise MatchingAnalysisStateError(MATCHING_PROFILE_VERSION_STALE)
        if not career_profile_completed(profile):
            raise MatchingAnalysisStateError(MATCHING_PROFILE_INCOMPLETE)

        if (
            role.job_description_status != "saved"
            or role.raw_job_description is None
            or not role.raw_job_description.strip()
            or role.job_description_version is None
        ):
            raise MatchingAnalysisStateError(MATCHING_JOB_DESCRIPTION_NOT_READY)
        if role.job_description_version != payload.job_description_version:
            raise MatchingAnalysisStateError(MATCHING_JOB_DESCRIPTION_VERSION_STALE)

        analysis_statement = select(JobDescriptionAnalysis).where(
            JobDescriptionAnalysis.role_id == role.id,
            JobDescriptionAnalysis.user_id == run.user_id,
        )
        if for_update:
            analysis_statement = analysis_statement.with_for_update()
        analysis = await self.session.scalar(analysis_statement)
        if analysis is None:
            raise MatchingAnalysisStateError(
                MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY
            )
        if (
            analysis.job_description_version != role.job_description_version
            or analysis.job_description_version != payload.job_description_version
        ):
            raise MatchingAnalysisStateError(
                MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY
            )
        if analysis.analysis_version != payload.job_description_analysis_version:
            raise MatchingAnalysisStateError(
                MATCHING_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE
            )

        existing = None
        if for_update:
            existing = await self.session.scalar(
                select(MatchingAnalysis)
                .where(MatchingAnalysis.role_id == role.id)
                .with_for_update()
            )

        return _MatchingContext(
            payload=payload,
            role=role,
            profile=profile,
            job_description_analysis=analysis,
            existing=existing,
        )


def _ordered(items: Iterable[_Item], *, limit: int | None) -> list[_Item]:
    ordered = sorted(
        items,
        key=lambda item: (
            cast(int, getattr(item, "position")),
            str(getattr(item, "id")),
        ),
    )
    return ordered if limit is None else ordered[:limit]


def _build_matching_input(context: _MatchingContext) -> MatchingAnalysisInput:
    try:
        career_profile = build_matching_career_profile(context.profile)
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise MatchingAnalysisStateError(MATCHING_PROFILE_INCOMPLETE) from None
    try:
        job = build_matching_job_context(
            context.role,
            context.job_description_analysis,
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise MatchingAnalysisStateError(
            MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY
        ) from None
    try:
        return MatchingAnalysisInput(
            career_profile=career_profile,
            job=job,
            interaction_language=context.payload.interaction_language,
        )
    except (TypeError, ValueError, ValidationError):
        raise MatchingAnalysisStateError(INVALID_MATCHING_ANALYSIS_RUN) from None


def _career_profile_loader_options() -> tuple[object, ...]:
    return (
        selectinload(CareerProfile.education),
        selectinload(CareerProfile.skills),
        selectinload(CareerProfile.work_experiences)
        .selectinload(CareerProfileWorkExperience.skill_links)
        .selectinload(CareerProfileWorkSkill.skill),
        selectinload(CareerProfile.project_experiences)
        .selectinload(CareerProfileProjectExperience.skill_links)
        .selectinload(CareerProfileProjectSkill.skill),
    )


def _copy_list(value: object) -> list[str]:
    return list(cast(list[str], value))


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")
