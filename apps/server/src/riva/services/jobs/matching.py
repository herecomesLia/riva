from collections.abc import Callable, Iterable
from datetime import datetime
from typing import cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.jobs.jd_parser_types import JobDescriptionParsingOutput
from riva.agents.jobs.matcher_types import (
    MAX_MATCHING_EDUCATION_ITEMS,
    MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
    MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
    MAX_MATCHING_EXPERIENCE_SKILLS,
    MAX_MATCHING_PROFILE_SKILLS,
    MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS,
    MAX_MATCHING_WORK_EXPERIENCE_ITEMS,
    MatchingAnalysisInput,
    MatchingAnalysisOutput,
    MatchingCareerProfile,
    MatchingJobContext,
    MatchingProfileEducation,
    MatchingProfileProjectExperience,
    MatchingProfileWorkExperience,
)
from riva.core.language import InteractionLanguage
from riva.models import (
    CareerProfile,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
)
from riva.services.errors import service_error_for_code
from riva.services.profile.content import has_required_content, parse_content
from riva.utils import utc_now

MATCHING_TARGET_NOT_FOUND: str = "matching_target_not_found"
MATCHING_PROFILE_NOT_FOUND: str = "matching_profile_not_found"
MATCHING_PROFILE_INCOMPLETE: str = "matching_profile_incomplete"
MATCHING_JOB_DESCRIPTION_NOT_READY: str = "matching_job_description_not_ready"
MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY: str = (
    "matching_job_description_analysis_not_ready"
)


def stable_unique_texts(
    values: Iterable[str], *, limit: int | None = None
) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result if limit is None else result[:limit]


def build_matching_career_profile(profile: CareerProfile) -> MatchingCareerProfile:
    content = parse_content(profile.content)
    education = [
        MatchingProfileEducation(
            school=item.school,
            degree=item.degree,
            major=item.major,
            start_date=item.start_date,
            end_date=item.end_date,
            is_current=item.is_current,
        )
        for item in content.education[:MAX_MATCHING_EDUCATION_ITEMS]
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
                item.skills,
                limit=MAX_MATCHING_EXPERIENCE_SKILLS,
            ),
        )
        for item in content.work_experiences[:MAX_MATCHING_WORK_EXPERIENCE_ITEMS]
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
                item.skills,
                limit=MAX_MATCHING_EXPERIENCE_SKILLS,
            ),
        )
        for item in content.project_experiences[:MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS]
    ]
    return MatchingCareerProfile(
        summary=content.summary,
        education=education,
        work_experiences=work_experiences,
        project_experiences=project_experiences,
        skills=stable_unique_texts(
            content.skills,
            limit=MAX_MATCHING_PROFILE_SKILLS,
        ),
    )


def build_matching_job_context(
    role: TargetRole, analysis: JobDescriptionAnalysis
) -> MatchingJobContext:
    return MatchingJobContext(
        role_title=role.title,
        company=role.company,
        job_description_analysis=JobDescriptionParsingOutput(
            riva_summary=analysis.riva_summary,
            responsibilities=analysis.responsibilities,
            qualification_requirements=analysis.qualification_requirements,
            required_skills=analysis.required_skills,
            preferred_qualifications=analysis.preferred_qualifications,
            soft_skills=analysis.soft_skills,
            business_domains=analysis.business_domains,
        ),
    )


class MatchingAnalysisService:
    def __init__(
        self, session: AsyncSession, *, clock: Callable[[], datetime] = utc_now
    ) -> None:
        self.session = session
        self.clock = clock

    async def build_matching_input(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> MatchingAnalysisInput:
        context = await self._load_context(
            user_id=user_id,
            role_id=role_id,
            interaction_language=interaction_language,
            for_update=False,
        )
        return self._build_input(context)

    async def persist_success(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        interaction_language: InteractionLanguage,
        output: MatchingAnalysisOutput,
    ) -> MatchingAnalysis:
        context = await self._load_context(
            user_id=user_id,
            role_id=role_id,
            interaction_language=interaction_language,
            for_update=True,
        )
        self._build_input(context)
        values = output.model_dump(mode="json")
        now = self.clock()
        _require_aware_datetime(now)
        if context.existing is None:
            analysis = MatchingAnalysis(
                role_id=context.role.id,
                user_id=context.role.user_id,
                profile_version=context.profile.version,
                job_description_version=context.role.job_description_version,
                job_description_analysis_version=context.job_description_analysis.analysis_version,
                generated_at=now,
                overall_match_score=cast(int, values["overall_match_score"]),
                core_requirements_summary=cast(
                    str, values["core_requirements_summary"]
                ),
                matched_capabilities=_copy_list(values["matched_capabilities"]),
                missing_capabilities=_copy_list(values["missing_capabilities"]),
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
            analysis = context.existing
            analysis.profile_version = context.profile.version
            analysis.job_description_version = context.role.job_description_version
            analysis.job_description_analysis_version = (
                context.job_description_analysis.analysis_version
            )
            analysis.generated_at = now
            analysis.overall_match_score = cast(int, values["overall_match_score"])
            analysis.core_requirements_summary = cast(
                str, values["core_requirements_summary"]
            )
            analysis.matched_capabilities = _copy_list(values["matched_capabilities"])
            analysis.missing_capabilities = _copy_list(values["missing_capabilities"])
            analysis.underrepresented_capabilities = _copy_list(
                values["underrepresented_capabilities"]
            )
            analysis.resume_highlights = _copy_list(values["resume_highlights"])
            analysis.resume_gaps = _copy_list(values["resume_gaps"])
            analysis.high_risk_questions = _copy_list(values["high_risk_questions"])
            analysis.preparation_recommendations = _copy_list(
                values["preparation_recommendations"]
            )
        context.role.version += 1
        await self.session.flush()
        return analysis

    async def _load_context(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        interaction_language: InteractionLanguage,
        for_update: bool,
    ) -> _MatchingContext:
        role_statement = select(TargetRole).where(
            TargetRole.id == role_id, TargetRole.user_id == user_id
        )
        if for_update:
            role_statement = role_statement.with_for_update()
        role = await self.session.scalar(role_statement)
        if role is None:
            raise service_error_for_code(MATCHING_TARGET_NOT_FOUND)
        if role.preparation_status == "archived":
            raise service_error_for_code(MATCHING_TARGET_NOT_FOUND)
        if (
            role.job_description_status != "saved"
            or not role.raw_job_description
            or role.job_description_version is None
        ):
            raise service_error_for_code(MATCHING_JOB_DESCRIPTION_NOT_READY)

        profile_statement = select(CareerProfile).where(
            CareerProfile.user_id == user_id
        )
        if for_update:
            profile_statement = profile_statement.with_for_update()
        profile = await self.session.scalar(profile_statement)
        if profile is None:
            raise service_error_for_code(MATCHING_PROFILE_NOT_FOUND)
        if not has_required_content(parse_content(profile.content)):
            raise service_error_for_code(MATCHING_PROFILE_INCOMPLETE)

        analysis = await self.session.scalar(
            select(JobDescriptionAnalysis).where(
                JobDescriptionAnalysis.role_id == role.id,
                JobDescriptionAnalysis.user_id == user_id,
            )
        )
        if (
            analysis is None
            or analysis.job_description_version != role.job_description_version
        ):
            raise service_error_for_code(MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY)
        existing = await self.session.scalar(
            select(MatchingAnalysis)
            .where(MatchingAnalysis.role_id == role.id)
            .with_for_update()
            if for_update
            else select(MatchingAnalysis).where(MatchingAnalysis.role_id == role.id)
        )
        return _MatchingContext(role, profile, analysis, existing, interaction_language)

    @staticmethod
    def _build_input(context: _MatchingContext) -> MatchingAnalysisInput:
        try:
            return MatchingAnalysisInput(
                career_profile=build_matching_career_profile(context.profile),
                job=build_matching_job_context(
                    context.role, context.job_description_analysis
                ),
                interaction_language=context.interaction_language,
            )
        except AttributeError, TypeError, ValueError, ValidationError:
            raise service_error_for_code(MATCHING_PROFILE_INCOMPLETE) from None


class _MatchingContext:
    def __init__(
        self,
        role: TargetRole,
        profile: CareerProfile,
        job_description_analysis: JobDescriptionAnalysis,
        existing: MatchingAnalysis | None,
        interaction_language: InteractionLanguage,
    ) -> None:
        self.role = role
        self.profile = profile
        self.job_description_analysis = job_description_analysis
        self.existing = existing
        self.interaction_language = interaction_language


def _copy_list(value: object) -> list[str]:
    return list(cast(list[str], value))


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")
