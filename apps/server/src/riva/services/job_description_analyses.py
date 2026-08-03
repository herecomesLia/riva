from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import AgentRun, JobDescriptionAnalysis, TargetRole
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT_V1
from riva.schemas.job_description_parsing import (
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
    JobDescriptionParsingRunPayload,
    MAX_JOB_DESCRIPTION_SUMMARY_LENGTH,
)
from riva.utils import utc_now


JobDescriptionParsingStateErrorCode = Literal[
    "invalid_job_description_parse_run",
    "job_description_target_not_found",
    "job_description_missing",
    "job_description_version_stale",
    "job_description_parse_superseded",
]
INVALID_PARSE_RUN: JobDescriptionParsingStateErrorCode = (
    "invalid_job_description_parse_run"
)
TARGET_NOT_FOUND: JobDescriptionParsingStateErrorCode = (
    "job_description_target_not_found"
)
JOB_DESCRIPTION_MISSING: JobDescriptionParsingStateErrorCode = (
    "job_description_missing"
)
JOB_DESCRIPTION_VERSION_STALE: JobDescriptionParsingStateErrorCode = (
    "job_description_version_stale"
)
PARSE_SUPERSEDED: JobDescriptionParsingStateErrorCode = (
    "job_description_parse_superseded"
)
RIVA_SUMMARY_FALLBACK = "No specific structured requirements were identified."


def build_riva_summary(
    *,
    responsibilities: Sequence[str],
    qualification_requirements: Mapping[str, Sequence[str]],
    required_skills: Mapping[str, Sequence[str]],
    preferred_qualifications: Sequence[str],
    soft_skills: Sequence[str],
    business_domains: Sequence[str],
) -> str:
    """Build a bounded, deterministic summary from structured JD modules."""

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
        normalized = _clean_summary_item(item)
        if normalized:
            normalized = normalized.rstrip("。.")
            if normalized:
                return normalized
    return None


def _first_from_categories(
    groups: Mapping[str, Sequence[str]],
    categories: Sequence[str],
) -> str | None:
    for category in categories:
        item = _first_item(groups.get(category, ()))
        if item:
            return item
    return None


def _clean_summary_item(item: str) -> str:
    return item.strip()


class JobDescriptionParsingStateError(RuntimeError):
    safe_message = "The job description parsing state is invalid."

    def __init__(self, code: JobDescriptionParsingStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _ParsingContext:
    payload: JobDescriptionParsingRunPayload
    role: TargetRole


class JobDescriptionAnalysisService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def load_parsing_input(
        self,
        run: AgentRun,
    ) -> JobDescriptionParsingInput:
        try:
            context = await self._validated_context(run, for_update=False)
            try:
                parsing_input = JobDescriptionParsingInput(
                    role_title=context.role.title,
                    company=context.role.company,
                    raw_job_description=context.role.raw_job_description,
                )
            except ValidationError:
                raise JobDescriptionParsingStateError(INVALID_PARSE_RUN) from None

            await self.session.commit()
            return parsing_input
        except Exception:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: JobDescriptionParsingOutput,
    ) -> JobDescriptionAnalysis:
        try:
            context = await self._validated_context(run, for_update=True)
            existing = await self.session.scalar(
                select(JobDescriptionAnalysis).where(
                    JobDescriptionAnalysis.role_id == context.role.id
                )
            )
            if (
                existing is not None
                and existing.source_agent_run_id == run.id
                and existing.job_description_version
                == context.payload.job_description_version
            ):
                await self.session.commit()
                return existing

            now = self.clock()
            _require_aware_datetime(now)
            values = output.model_dump(mode="json")
            if existing is None:
                analysis = JobDescriptionAnalysis(
                    role_id=context.role.id,
                    user_id=context.role.user_id,
                    job_description_version=context.payload.job_description_version,
                    analysis_version=1,
                    source_agent_run_id=run.id,
                    parsed_at=now,
                    riva_summary=output.riva_summary,
                    responsibilities=cast(list[str], values["responsibilities"]),
                    qualification_requirements=cast(
                        dict[str, list[str]],
                        values["qualification_requirements"],
                    ),
                    required_skills=cast(
                        dict[str, list[str]],
                        values["required_skills"],
                    ),
                    preferred_qualifications=cast(
                        list[str], values["preferred_qualifications"]
                    ),
                    soft_skills=cast(list[str], values["soft_skills"]),
                    business_domains=cast(list[str], values["business_domains"]),
                )
                self.session.add(analysis)
            else:
                analysis = existing
                analysis.job_description_version = (
                    context.payload.job_description_version
                )
                analysis.analysis_version = 1
                analysis.source_agent_run_id = run.id
                analysis.parsed_at = now
                analysis.riva_summary = output.riva_summary
                analysis.responsibilities = cast(
                    list[str], values["responsibilities"]
                )
                analysis.qualification_requirements = cast(
                    dict[str, list[str]],
                    values["qualification_requirements"],
                )
                analysis.required_skills = cast(
                    dict[str, list[str]], values["required_skills"]
                )
                analysis.preferred_qualifications = cast(
                    list[str], values["preferred_qualifications"]
                )
                analysis.soft_skills = cast(list[str], values["soft_skills"])
                analysis.business_domains = cast(
                    list[str], values["business_domains"]
                )

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
    ) -> _ParsingContext:
        prompt = JOB_DESCRIPTION_PARSING_PROMPT_V1
        if (
            run.agent_id != "job-description-parser"
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version != prompt.version
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise JobDescriptionParsingStateError(INVALID_PARSE_RUN)

        try:
            payload = JobDescriptionParsingRunPayload.model_validate(run.payload)
        except ValidationError:
            raise JobDescriptionParsingStateError(INVALID_PARSE_RUN) from None

        statement = select(TargetRole).where(
            TargetRole.id == payload.role_id,
            TargetRole.user_id == run.user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        role = await self.session.scalar(statement)
        if role is None:
            raise JobDescriptionParsingStateError(TARGET_NOT_FOUND)
        if (
            role.job_description_status != "saved"
            or role.raw_job_description is None
            or role.job_description_version is None
        ):
            raise JobDescriptionParsingStateError(JOB_DESCRIPTION_MISSING)
        if role.job_description_version != payload.job_description_version:
            raise JobDescriptionParsingStateError(JOB_DESCRIPTION_VERSION_STALE)
        if role.job_description_parsing_run_id != run.id:
            raise JobDescriptionParsingStateError(PARSE_SUPERSEDED)

        return _ParsingContext(payload=payload, role=role)


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")
