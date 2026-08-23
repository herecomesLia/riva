from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.jobs.jd_parser_types import (
    MAX_JOB_DESCRIPTION_SUMMARY_LENGTH,
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
)
from riva.core.language import InteractionLanguage
from riva.models import JobDescriptionAnalysis, TargetRole
from riva.services.errors import service_error_for_code
from riva.utils import utc_now

TARGET_NOT_FOUND: str = "job_description_target_not_found"
JOB_DESCRIPTION_MISSING: str = "job_description_missing"
JOB_DESCRIPTION_VERSION_STALE: str = "job_description_version_stale"
RIVA_SUMMARY_FALLBACK = "No specific structured requirements were identified."


def new_job_description_analysis(
    *,
    role: TargetRole,
    output: JobDescriptionParsingOutput,
    parsed_at: datetime,
) -> JobDescriptionAnalysis:
    values = output.model_dump(mode="json")
    return JobDescriptionAnalysis(
        role_id=role.id,
        user_id=role.user_id,
        job_description_version=role.job_description_version,
        analysis_version=1,
        parsed_at=parsed_at,
        riva_summary=output.riva_summary,
        responsibilities=cast(list[str], values["responsibilities"]),
        qualification_requirements=cast(
            dict[str, list[str]], values["qualification_requirements"]
        ),
        required_skills=cast(dict[str, list[str]], values["required_skills"]),
        preferred_qualifications=cast(list[str], values["preferred_qualifications"]),
        soft_skills=cast(list[str], values["soft_skills"]),
        business_domains=cast(list[str], values["business_domains"]),
    )


def build_riva_summary(
    *,
    responsibilities: Sequence[str],
    qualification_requirements: Mapping[str, Sequence[str]],
    required_skills: Mapping[str, Sequence[str]],
    preferred_qualifications: Sequence[str],
    soft_skills: Sequence[str],
    business_domains: Sequence[str],
) -> str:
    responsibility = _first_item(responsibilities)
    skills: list[str] = []
    for category in (
        "programming_languages",
        "frameworks_and_libraries",
        "platforms",
        "tools",
        "concepts_and_methods",
        "databases_and_middleware",
        "other",
    ):
        skills.extend(required_skills.get(category, ()))
    skills = [_clean_summary_item(item) for item in skills[:3]]
    skills = [item for item in skills if item]
    qualification = _first_from_categories(
        qualification_requirements,
        (
            "education",
            "graduation_cohorts",
            "majors",
            "experience",
            "languages",
            "certifications",
            "other",
        ),
    )
    preferred = _first_item(preferred_qualifications)
    soft_skill = _first_item(soft_skills)
    domain = _first_item(business_domains)
    parts = [
        responsibility,
        f"重点要求 {'、'.join(skills)}" if skills else None,
        f"任职资格包括 {qualification}" if qualification else None,
        f"加分项为 {preferred}" if preferred else None,
        f"强调 {soft_skill}" if soft_skill else None,
        f"业务领域为 {domain}" if domain else None,
    ]
    summary = "；".join(item for item in parts if item)
    if not summary:
        return RIVA_SUMMARY_FALLBACK
    bounded = summary[:MAX_JOB_DESCRIPTION_SUMMARY_LENGTH].rstrip("；，, ")
    return bounded or RIVA_SUMMARY_FALLBACK


def _first_item(items: Sequence[str]) -> str | None:
    for item in items:
        normalized = _clean_summary_item(item).rstrip("。.")
        if normalized:
            return normalized
    return None


def _first_from_categories(
    groups: Mapping[str, Sequence[str]], categories: Sequence[str]
) -> str | None:
    for category in categories:
        item = _first_item(groups.get(category, ()))
        if item:
            return item
    return None


def _clean_summary_item(item: str) -> str:
    return item.strip()


class JobDescriptionAnalysisService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def build_parsing_input(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> JobDescriptionParsingInput:
        role = await self._role(user_id=user_id, role_id=role_id, for_update=False)
        return JobDescriptionParsingInput(
            role_title=role.title,
            company=role.company,
            raw_job_description=role.raw_job_description,
            interaction_language=interaction_language,
        )

    async def persist_success(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        output: JobDescriptionParsingOutput,
    ) -> JobDescriptionAnalysis:
        role = await self._role(user_id=user_id, role_id=role_id, for_update=True)
        existing = await self.session.scalar(
            select(JobDescriptionAnalysis)
            .where(JobDescriptionAnalysis.role_id == role.id)
            .with_for_update()
        )
        now = self.clock()
        _require_aware_datetime(now)
        if existing is None:
            analysis = new_job_description_analysis(
                role=role,
                output=output,
                parsed_at=now,
            )
            self.session.add(analysis)
        else:
            values = output.model_dump(mode="json")
            analysis = existing
            analysis.job_description_version = role.job_description_version
            analysis.analysis_version += 1
            analysis.parsed_at = now
            analysis.riva_summary = output.riva_summary
            analysis.responsibilities = cast(list[str], values["responsibilities"])
            analysis.qualification_requirements = cast(
                dict[str, list[str]], values["qualification_requirements"]
            )
            analysis.required_skills = cast(
                dict[str, list[str]], values["required_skills"]
            )
            analysis.preferred_qualifications = cast(
                list[str], values["preferred_qualifications"]
            )
            analysis.soft_skills = cast(list[str], values["soft_skills"])
            analysis.business_domains = cast(list[str], values["business_domains"])
        role.version += 1
        await self.session.flush()
        return analysis

    async def _role(
        self, *, user_id: UUID, role_id: UUID, for_update: bool
    ) -> TargetRole:
        statement = select(TargetRole).where(
            TargetRole.id == role_id,
            TargetRole.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        role = await self.session.scalar(statement)
        if role is None:
            raise service_error_for_code(TARGET_NOT_FOUND)
        if (
            role.job_description_status != "saved"
            or not role.raw_job_description
            or role.job_description_version is None
        ):
            raise service_error_for_code(JOB_DESCRIPTION_MISSING)
        return role


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")
