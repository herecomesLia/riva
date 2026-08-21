from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.errors import APIError
from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CurrentTargetRole,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import (
    JOB_DESCRIPTION_PARSING_PROMPT,
    MATCHING_ANALYSIS_PROMPT,
)
from riva.schemas.job_description_parsing import JobDescriptionParsingRunPayload
from riva.schemas.matching_analysis import (
    MatchingAnalysisResultResponse,
    MatchingAnalysisRunPayload,
)
from riva.schemas.roles import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    CurrentMatchingAnalysisResponse,
    ExistingProfileContext,
    FailedJobDescriptionResponse,
    FailedMatchingAnalysisResponse,
    GeneratingMatchingAnalysisResponse,
    JobDescriptionAnalysisResponse,
    JobDescriptionParsingStatusQuery,
    MatchingAnalysisStatusQuery,
    MissingJobDescriptionResponse,
    MissingProfileContext,
    ParsingJobDescriptionResponse,
    ReadyJobDescriptionResponse,
    RolesPageResponse,
    SavedJobDescriptionResponse,
    SaveJobDescriptionRequest,
    SetCurrentTargetRoleRequest,
    StaleMatchingAnalysisResponse,
    StartJobDescriptionParsingRequest,
    StartMatchingAnalysisRequest,
    TargetRoleExperienceRange,
    TargetRoleResponse,
    UpdateJobDescriptionAnalysisModuleRequest,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)
from riva.services.agent_runs import AgentRunService
from riva.services.job_description_analyses import build_riva_summary
from riva.services.profile_completion import career_profile_completed
from riva.services.prompt_versions import (
    JOB_DESCRIPTION_PARSING_ACCEPTED_PROMPT_VERSIONS,
    MATCHING_ANALYSIS_ACCEPTED_PROMPT_VERSIONS,
)

AgentRunServiceFactory = Callable[[AsyncSession], AgentRunService]
PARSING_FAILURE_REASON = (
    "Job description parsing failed. Please review the text and try again."
)
MATCHING_FAILURE_REASON = (
    "The matching analysis could not be generated right now. "
    "Your profile and job description are preserved; please try again."
)


def build_matching_analysis_result_response(
    analysis: MatchingAnalysis,
) -> MatchingAnalysisResultResponse:
    return MatchingAnalysisResultResponse(
        overall_match_score=analysis.overall_match_score,
        core_requirements_summary=analysis.core_requirements_summary,
        matched_capabilities=list(analysis.matched_capabilities),
        missing_capabilities=list(analysis.missing_capabilities),
        underrepresented_capabilities=list(analysis.underrepresented_capabilities),
        resume_highlights=list(analysis.resume_highlights),
        resume_gaps=list(analysis.resume_gaps),
        high_risk_questions=list(analysis.high_risk_questions),
        preparation_recommendations=list(analysis.preparation_recommendations),
    )


class TargetRoleService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        agent_run_service_factory: AgentRunServiceFactory = AgentRunService,
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory

    async def get_roles_page(self, user: User) -> RolesPageResponse:
        return await self._roles_page(user.id)

    async def create_role(
        self,
        user: User,
        payload: CreateTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            await self.create_role_in_transaction(user.id, payload)
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def create_role_in_transaction(
        self,
        user_id: UUID,
        payload: CreateTargetRoleRequest,
    ) -> TargetRole:
        """Create a role without committing so compound workflows can reuse it."""

        await self._lock_user(user_id)
        current = await self._current_mapping(user_id)
        has_active_role = await self.session.scalar(
            select(TargetRole.id)
            .where(
                TargetRole.user_id == user_id,
                TargetRole.preparation_status.in_(("preparing", "paused")),
            )
            .limit(1)
        )
        role = TargetRole(
            user_id=user_id,
            title=payload.title,
            company=payload.company,
            recruitment_type=(
                payload.recruitment_type.value
                if payload.recruitment_type is not None
                else None
            ),
            location=payload.location,
            min_experience_years=(
                payload.experience_range.min_years
                if payload.experience_range is not None
                else None
            ),
            max_experience_years=(
                payload.experience_range.max_years
                if payload.experience_range is not None
                else None
            ),
            preparation_status=payload.preparation_status.value,
            job_description_status="missing",
            raw_job_description=None,
            job_description_version=None,
            version=1,
        )
        self.session.add(role)
        await self.session.flush()

        if current is None and has_active_role is None:
            self.session.add(CurrentTargetRole(user_id=user_id, role_id=role.id))
        return role

    async def update_role(
        self,
        user: User,
        role_id: UUID,
        payload: UpdateTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            recruitment_type = (
                payload.recruitment_type.value
                if payload.recruitment_type is not None
                else None
            )
            min_experience_years = (
                payload.experience_range.min_years
                if payload.experience_range is not None
                else None
            )
            max_experience_years = (
                payload.experience_range.max_years
                if payload.experience_range is not None
                else None
            )
            current_values = (
                role.title,
                role.company,
                role.recruitment_type,
                role.location,
                role.min_experience_years,
                role.max_experience_years,
            )
            requested_values = (
                payload.title,
                payload.company,
                recruitment_type,
                payload.location,
                min_experience_years,
                max_experience_years,
            )
            if current_values != requested_values:
                (
                    role.title,
                    role.company,
                    role.recruitment_type,
                    role.location,
                    role.min_experience_years,
                    role.max_experience_years,
                ) = requested_values
                role.version += 1
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def set_current_role(
        self,
        user: User,
        role_id: UUID,
        payload: SetCurrentTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            await self._lock_user(user.id)
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            if role.preparation_status == "archived":
                raise self._state_conflict()

            current = await self._current_mapping(user.id, for_update=True)
            if current is None:
                self.session.add(CurrentTargetRole(user_id=user.id, role_id=role.id))
            elif current.role_id != role.id:
                current.role_id = role.id

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def update_preparation_status(
        self,
        user: User,
        role_id: UUID,
        payload: UpdatePreparationStatusRequest,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            requested_status = payload.preparation_status.value
            if role.preparation_status == "archived":
                raise self._state_conflict()
            if role.preparation_status != requested_status:
                role.preparation_status = requested_status
                role.version += 1

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def archive_role(
        self,
        user: User,
        role_id: UUID,
        payload: ArchiveTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            await self._lock_user(user.id)
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            if role.preparation_status != "archived":
                role.preparation_status = "archived"
                role.version += 1
                await self._replace_current_if_needed(user.id, role.id)

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def delete_role(
        self,
        user: User,
        role_id: UUID,
        version: int,
    ) -> RolesPageResponse:
        try:
            await self._lock_user(user.id)
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, version)
            await self._replace_current_if_needed(user.id, role.id)
            await self.session.delete(role)
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def save_job_description(
        self,
        user: User,
        role_id: UUID,
        payload: SaveJobDescriptionRequest,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            await self.save_job_description_in_transaction(role, payload.raw_text)

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def save_job_description_in_transaction(
        self,
        role: TargetRole,
        raw_text: str,
    ) -> None:
        """Save JD text without committing so import can apply atomically."""

        if (
            role.job_description_status == "saved"
            and role.raw_job_description == raw_text
        ):
            return
        role.job_description_status = "saved"
        role.raw_job_description = raw_text
        role.job_description_version = (role.job_description_version or 0) + 1
        role.job_description_parsing_run_id = None
        await self.session.execute(
            delete(JobDescriptionAnalysis).where(
                JobDescriptionAnalysis.role_id == role.id
            )
        )
        role.version += 1

    async def update_job_description_analysis_module(
        self,
        user: User,
        role_id: UUID,
        payload: UpdateJobDescriptionAnalysisModuleRequest,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            self._require_saved_job_description(role)
            if role.job_description_version != payload.job_description_version:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "job_description_version_conflict",
                )

            analysis = await self._locked_analysis(user.id, role.id)
            if (
                analysis is None
                or analysis.job_description_version != role.job_description_version
            ):
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "job_description_analysis_not_ready",
                )
            if analysis.analysis_version != payload.analysis_version:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "job_description_analysis_version_conflict",
                )

            if self._replace_analysis_module(analysis, payload):
                analysis.riva_summary = build_riva_summary(
                    responsibilities=analysis.responsibilities,
                    qualification_requirements=(analysis.qualification_requirements),
                    required_skills=analysis.required_skills,
                    preferred_qualifications=(analysis.preferred_qualifications),
                    soft_skills=analysis.soft_skills,
                    business_domains=analysis.business_domains,
                )
                analysis.analysis_version += 1
                role.version += 1

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def start_job_description_parsing(
        self,
        user: User,
        role_id: UUID,
        payload: StartJobDescriptionParsingRequest,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            self._require_saved_job_description(role)
            if role.job_description_version != payload.job_description_version:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "job_description_version_conflict",
                )

            if self._has_current_analysis(role):
                return await self._commit_page(user.id)

            run = self._current_parsing_run(role)
            if run is not None:
                if run.status in (
                    AgentRunStatus.QUEUED,
                    AgentRunStatus.RUNNING,
                ):
                    return await self._commit_page(user.id)
                if run.status is AgentRunStatus.SUCCEEDED:
                    raise APIError(
                        status.HTTP_409_CONFLICT,
                        "job_description_parsing_state_conflict",
                    )

            self._require_parsing_configuration()
            prompt = JOB_DESCRIPTION_PARSING_PROMPT
            run_payload = JobDescriptionParsingRunPayload(
                role_id=role.id,
                job_description_version=cast(int, role.job_description_version),
                interaction_language=interaction_language,
            )
            new_run = await self.agent_run_service_factory(
                self.session
            ).enqueue_in_transaction(
                user_id=user.id,
                agent_id="job-description-parser",
                prompt_id=prompt.prompt_id,
                prompt_version=prompt.version,
                output_schema_id=prompt.output_schema_id,
                model=self.llm_model,
                payload=run_payload.model_dump(
                    mode="json",
                    by_alias=True,
                    exclude_none=True,
                ),
                idempotency_key=(
                    f"job-description-parsing:{role.id}:"
                    f"{role.job_description_version}:{role.version}:"
                    f"{interaction_language}"
                ),
                max_attempts=3,
            )
            role.job_description_parsing_run_id = new_run.id
            role.job_description_parsing_run = new_run
            role.version += 1
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def get_job_description_parsing_status(
        self,
        user: User,
        role_id: UUID,
        query: JobDescriptionParsingStatusQuery,
    ) -> TargetRoleResponse:
        del query
        role = await self._role(user.id, role_id)
        profile = await self._profile(user.id)
        return self._role_response(role, profile)

    async def start_matching_analysis(
        self,
        user: User,
        role_id: UUID,
        payload: StartMatchingAnalysisRequest,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> RolesPageResponse:
        try:
            await self._lock_user(user.id)
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)

            profile = await self._locked_profile(user.id)
            if profile is None:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "matching_profile_not_found",
                )
            if not career_profile_completed(profile):
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "matching_profile_incomplete",
                )

            analysis = await self._locked_analysis(user.id, role.id)
            if not self._matching_job_description_ready(role, analysis):
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    "matching_job_description_analysis_not_ready",
                )
            role.job_description_analysis = analysis

            matching = await self._locked_matching_analysis(
                user.id,
                role.id,
            )
            role.matching_analysis = matching
            current_result = self._matching_analysis_is_current(
                role,
                profile,
                analysis,
                matching,
            )
            current_run = self._current_matching_run(
                role,
                profile,
                analysis,
            )

            if current_run is not None:
                run, _ = current_run
                if run.status in (
                    AgentRunStatus.QUEUED,
                    AgentRunStatus.RUNNING,
                ):
                    return await self._commit_page(user.id)
                if run.status is AgentRunStatus.SUCCEEDED:
                    if (
                        current_result
                        and matching is not None
                        and matching.source_agent_run_id == run.id
                    ):
                        return await self._commit_page(user.id)
                    raise APIError(
                        status.HTTP_409_CONFLICT,
                        "matching_analysis_state_conflict",
                    )
            elif current_result:
                return await self._commit_page(user.id)

            self._require_matching_configuration()
            prompt = MATCHING_ANALYSIS_PROMPT
            run_payload = MatchingAnalysisRunPayload(
                role_id=role.id,
                profile_id=profile.profile_id,
                profile_version=profile.version,
                job_description_version=cast(
                    int,
                    role.job_description_version,
                ),
                job_description_analysis_version=analysis.analysis_version,
                interaction_language=interaction_language,
            )
            idempotency_key = (
                f"matching-analysis:{role.id}:{profile.profile_id}:"
                f"{profile.version}:{role.job_description_version}:"
                f"{analysis.analysis_version}:{role.version}:"
                f"{interaction_language}"
            )

            new_run = await self.agent_run_service_factory(
                self.session
            ).enqueue_in_transaction(
                user_id=user.id,
                agent_id="matching-analyzer",
                prompt_id=prompt.prompt_id,
                prompt_version=prompt.version,
                output_schema_id=prompt.output_schema_id,
                model=self.llm_model,
                payload=run_payload.model_dump(mode="json", by_alias=True),
                idempotency_key=idempotency_key,
                max_attempts=3,
            )
            role.matching_analysis_run_id = new_run.id
            role.matching_analysis_run = new_run
            role.version += 1
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def get_matching_analysis_status(
        self,
        user: User,
        role_id: UUID,
        query: MatchingAnalysisStatusQuery,
    ) -> TargetRoleResponse:
        del query
        role = await self._role(user.id, role_id)
        profile = await self._profile(user.id)
        return self._role_response(role, profile)

    async def _roles_page(self, user_id: UUID) -> RolesPageResponse:
        roles = list(
            (
                await self.session.scalars(
                    select(TargetRole)
                    .options(
                        selectinload(TargetRole.job_description_analysis),
                        selectinload(TargetRole.job_description_parsing_run),
                        selectinload(TargetRole.matching_analysis),
                        selectinload(TargetRole.matching_analysis_run),
                    )
                    .where(TargetRole.user_id == user_id)
                    .order_by(TargetRole.created_at.asc(), TargetRole.id.asc())
                )
            ).all()
        )
        current_role_id = await self.session.scalar(
            select(CurrentTargetRole.role_id).where(
                CurrentTargetRole.user_id == user_id
            )
        )
        profile = await self._profile(user_id)
        profile_context = (
            MissingProfileContext(
                exists=False,
                version=None,
                completed=False,
            )
            if profile is None
            else ExistingProfileContext(
                exists=True,
                version=profile.version,
                completed=career_profile_completed(profile),
            )
        )
        return RolesPageResponse(
            roles=[self._role_response(role, profile) for role in roles],
            current_role_id=current_role_id,
            profile_context=profile_context,
        )

    async def _commit_page(self, user_id: UUID) -> RolesPageResponse:
        page = await self._roles_page(user_id)
        await self.session.commit()
        return page

    async def _profile(self, user_id: UUID) -> CareerProfile | None:
        return await self.session.scalar(
            select(CareerProfile)
            .options(
                selectinload(CareerProfile.education),
                selectinload(CareerProfile.work_experiences),
                selectinload(CareerProfile.project_experiences),
                selectinload(CareerProfile.skills),
            )
            .where(CareerProfile.user_id == user_id)
        )

    async def _locked_profile(self, user_id: UUID) -> CareerProfile | None:
        return await self.session.scalar(
            select(CareerProfile)
            .options(
                selectinload(CareerProfile.education),
                selectinload(CareerProfile.work_experiences),
                selectinload(CareerProfile.project_experiences),
                selectinload(CareerProfile.skills),
            )
            .where(CareerProfile.user_id == user_id)
            .with_for_update()
        )

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
        )

    async def _locked_role(
        self,
        user_id: UUID,
        role_id: UUID,
    ) -> TargetRole:
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.job_description_parsing_run),
                selectinload(TargetRole.matching_analysis),
                selectinload(TargetRole.matching_analysis_run),
            )
            .where(
                TargetRole.id == role_id,
                TargetRole.user_id == user_id,
            )
            .with_for_update()
        )
        if role is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "target_role_not_found",
            )
        return role

    async def _locked_analysis(
        self,
        user_id: UUID,
        role_id: UUID,
    ) -> JobDescriptionAnalysis | None:
        return await self.session.scalar(
            select(JobDescriptionAnalysis)
            .where(
                JobDescriptionAnalysis.role_id == role_id,
                JobDescriptionAnalysis.user_id == user_id,
            )
            .with_for_update()
        )

    async def _locked_matching_analysis(
        self,
        user_id: UUID,
        role_id: UUID,
    ) -> MatchingAnalysis | None:
        return await self.session.scalar(
            select(MatchingAnalysis)
            .where(
                MatchingAnalysis.role_id == role_id,
                MatchingAnalysis.user_id == user_id,
            )
            .with_for_update()
        )

    async def _role(self, user_id: UUID, role_id: UUID) -> TargetRole:
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.job_description_parsing_run),
                selectinload(TargetRole.matching_analysis),
                selectinload(TargetRole.matching_analysis_run),
            )
            .where(
                TargetRole.id == role_id,
                TargetRole.user_id == user_id,
            )
        )
        if role is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "target_role_not_found",
            )
        return role

    async def _current_mapping(
        self,
        user_id: UUID,
        *,
        for_update: bool = False,
    ) -> CurrentTargetRole | None:
        statement = select(CurrentTargetRole).where(
            CurrentTargetRole.user_id == user_id
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _replace_current_if_needed(
        self,
        user_id: UUID,
        excluded_role_id: UUID,
    ) -> None:
        current = await self._current_mapping(user_id, for_update=True)
        if current is None or current.role_id != excluded_role_id:
            return

        fallback_role_id = await self.session.scalar(
            select(TargetRole.id)
            .where(
                TargetRole.user_id == user_id,
                TargetRole.id != excluded_role_id,
                TargetRole.preparation_status == "preparing",
            )
            .order_by(TargetRole.created_at.asc(), TargetRole.id.asc())
            .limit(1)
        )
        if fallback_role_id is None:
            await self.session.delete(current)
        else:
            current.role_id = fallback_role_id

    @staticmethod
    def _require_version(role: TargetRole, requested_version: int) -> None:
        if role.version != requested_version:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "target_role_version_conflict",
            )

    @staticmethod
    def _state_conflict() -> APIError:
        return APIError(
            status.HTTP_409_CONFLICT,
            "target_role_state_conflict",
        )

    @staticmethod
    def _require_saved_job_description(role: TargetRole) -> None:
        if (
            role.job_description_status != "saved"
            or role.raw_job_description is None
            or role.job_description_version is None
        ):
            raise APIError(
                status.HTTP_409_CONFLICT,
                "job_description_missing",
            )

    def _require_parsing_configuration(self) -> None:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "job_description_parsing_unavailable",
            )

    def _require_matching_configuration(self) -> None:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "matching_analysis_unavailable",
            )

    @staticmethod
    def _matching_job_description_ready(
        role: TargetRole,
        analysis: JobDescriptionAnalysis | None,
    ) -> bool:
        return bool(
            role.job_description_status == "saved"
            and role.raw_job_description is not None
            and role.raw_job_description.strip()
            and role.job_description_version is not None
            and analysis is not None
            and analysis.job_description_version == role.job_description_version
        )

    @staticmethod
    def _matching_analysis_is_current(
        role: TargetRole,
        profile: CareerProfile | None,
        job_description_analysis: JobDescriptionAnalysis | None,
        matching_analysis: MatchingAnalysis | None,
    ) -> bool:
        return bool(
            profile is not None
            and job_description_analysis is not None
            and matching_analysis is not None
            and TargetRoleService._matching_job_description_ready(
                role,
                job_description_analysis,
            )
            and matching_analysis.profile_id == profile.profile_id
            and matching_analysis.profile_version == profile.version
            and matching_analysis.job_description_version
            == role.job_description_version
            and matching_analysis.job_description_analysis_version
            == job_description_analysis.analysis_version
        )

    @staticmethod
    def _replace_analysis_module(
        analysis: JobDescriptionAnalysis,
        payload: UpdateJobDescriptionAnalysisModuleRequest,
    ) -> bool:
        if payload.field == "responsibilities":
            value = list(payload.value)
            if analysis.responsibilities == value:
                return False
            analysis.responsibilities = value
            return True
        if payload.field == "preferredQualifications":
            value = list(payload.value)
            if analysis.preferred_qualifications == value:
                return False
            analysis.preferred_qualifications = value
            return True
        if payload.field == "softSkills":
            value = list(payload.value)
            if analysis.soft_skills == value:
                return False
            analysis.soft_skills = value
            return True
        if payload.field == "businessDomains":
            value = list(payload.value)
            if analysis.business_domains == value:
                return False
            analysis.business_domains = value
            return True
        if payload.field == "qualificationRequirements":
            value = payload.value.model_dump(mode="json", by_alias=False)
            if analysis.qualification_requirements == value:
                return False
            analysis.qualification_requirements = cast(dict[str, list[str]], value)
            return True
        if payload.field == "requiredSkills":
            value = payload.value.model_dump(mode="json", by_alias=False)
            if analysis.required_skills == value:
                return False
            analysis.required_skills = cast(dict[str, list[str]], value)
            return True
        raise AssertionError("Unsupported job description analysis field")

    @staticmethod
    def _has_current_analysis(role: TargetRole) -> bool:
        analysis = role.job_description_analysis
        return (
            analysis is not None
            and analysis.job_description_version == role.job_description_version
        )

    @staticmethod
    def _current_parsing_run(role: TargetRole) -> AgentRun | None:
        run = role.job_description_parsing_run
        if (
            run is None
            or role.job_description_parsing_run_id != run.id
            or run.user_id != role.user_id
        ):
            return None

        prompt = JOB_DESCRIPTION_PARSING_PROMPT
        if (
            run.agent_id != "job-description-parser"
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version
            not in JOB_DESCRIPTION_PARSING_ACCEPTED_PROMPT_VERSIONS
            or run.output_schema_id != prompt.output_schema_id
        ):
            return None
        try:
            payload = JobDescriptionParsingRunPayload.model_validate(run.payload)
        except ValidationError:
            return None
        if (
            payload.role_id != role.id
            or payload.job_description_version != role.job_description_version
        ):
            return None
        return run

    @staticmethod
    def _current_matching_run(
        role: TargetRole,
        profile: CareerProfile | None,
        job_description_analysis: JobDescriptionAnalysis | None,
    ) -> tuple[AgentRun, MatchingAnalysisRunPayload] | None:
        run = role.matching_analysis_run
        if (
            run is None
            or role.matching_analysis_run_id != run.id
            or run.user_id != role.user_id
            or profile is None
            or job_description_analysis is None
        ):
            return None

        prompt = MATCHING_ANALYSIS_PROMPT
        if (
            run.agent_id != "matching-analyzer"
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version not in MATCHING_ANALYSIS_ACCEPTED_PROMPT_VERSIONS
            or run.output_schema_id != prompt.output_schema_id
        ):
            return None
        try:
            payload = MatchingAnalysisRunPayload.model_validate(run.payload)
        except ValidationError:
            return None
        if (
            payload.role_id != role.id
            or payload.profile_id != profile.profile_id
            or payload.profile_version != profile.version
            or payload.job_description_version != role.job_description_version
            or payload.job_description_analysis_version
            != job_description_analysis.analysis_version
            or not TargetRoleService._matching_job_description_ready(
                role,
                job_description_analysis,
            )
        ):
            return None
        return run, payload

    @staticmethod
    def _role_response(
        role: TargetRole,
        profile: CareerProfile | None = None,
    ) -> TargetRoleResponse:
        experience_range = (
            None
            if (role.min_experience_years is None and role.max_experience_years is None)
            else TargetRoleExperienceRange(
                min_years=role.min_experience_years,
                max_years=role.max_experience_years,
            )
        )
        analysis = role.job_description_analysis
        current_analysis = (
            analysis
            if TargetRoleService._matching_job_description_ready(role, analysis)
            else None
        )
        run = TargetRoleService._current_parsing_run(role)
        if role.job_description_status == "missing":
            job_description = MissingJobDescriptionResponse(
                status="missing",
                raw_text=None,
                version=None,
                parsing_failure_reason=None,
            )
        elif current_analysis is not None:
            job_description = ReadyJobDescriptionResponse(
                status="ready",
                raw_text=role.raw_job_description,
                version=role.job_description_version,
                parsing_failure_reason=None,
            )
        elif run is not None and run.status in (
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
        ):
            job_description = ParsingJobDescriptionResponse(
                status="parsing",
                raw_text=role.raw_job_description,
                version=role.job_description_version,
                parsing_failure_reason=None,
            )
        elif run is not None and run.status is AgentRunStatus.FAILED:
            job_description = FailedJobDescriptionResponse(
                status="failed",
                raw_text=role.raw_job_description,
                version=role.job_description_version,
                parsing_failure_reason=PARSING_FAILURE_REASON,
            )
        else:
            job_description = SavedJobDescriptionResponse(
                status="saved",
                raw_text=role.raw_job_description,
                version=role.job_description_version,
                parsing_failure_reason=None,
            )
        analysis_response = (
            None
            if current_analysis is None
            else TargetRoleService._analysis_response(current_analysis)
        )
        matching_analysis_response = TargetRoleService._matching_response(
            role,
            profile,
            current_analysis,
        )
        return TargetRoleResponse(
            id=role.id,
            title=role.title,
            company=role.company,
            recruitment_type=role.recruitment_type,
            location=role.location,
            experience_range=experience_range,
            preparation_status=role.preparation_status,
            created_at=role.created_at,
            updated_at=role.updated_at,
            version=role.version,
            job_description=job_description,
            job_description_analysis=analysis_response,
            matching_analysis=matching_analysis_response,
        )

    @staticmethod
    def _matching_response(
        role: TargetRole,
        profile: CareerProfile | None,
        job_description_analysis: JobDescriptionAnalysis | None,
    ) -> (
        GeneratingMatchingAnalysisResponse
        | CurrentMatchingAnalysisResponse
        | StaleMatchingAnalysisResponse
        | FailedMatchingAnalysisResponse
        | None
    ):
        current_run = TargetRoleService._current_matching_run(
            role,
            profile,
            job_description_analysis,
        )
        if current_run is not None:
            run, payload = current_run
            if run.status in (
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            ):
                return GeneratingMatchingAnalysisResponse(
                    status="generating",
                    profile_version=payload.profile_version,
                    job_description_version=payload.job_description_version,
                    job_description_analysis_version=(
                        payload.job_description_analysis_version
                    ),
                    generated_at=None,
                    failure_reason=None,
                    result=None,
                )
            if run.status is AgentRunStatus.FAILED:
                return FailedMatchingAnalysisResponse(
                    status="failed",
                    profile_version=payload.profile_version,
                    job_description_version=payload.job_description_version,
                    job_description_analysis_version=(
                        payload.job_description_analysis_version
                    ),
                    generated_at=None,
                    failure_reason=MATCHING_FAILURE_REASON,
                    result=None,
                )

        analysis = role.matching_analysis
        if analysis is None:
            return None

        result = build_matching_analysis_result_response(analysis)
        if TargetRoleService._matching_analysis_is_current(
            role,
            profile,
            job_description_analysis,
            analysis,
        ):
            return CurrentMatchingAnalysisResponse(
                status="current",
                profile_version=analysis.profile_version,
                job_description_version=analysis.job_description_version,
                job_description_analysis_version=(
                    analysis.job_description_analysis_version
                ),
                generated_at=analysis.generated_at,
                failure_reason=None,
                result=result,
            )
        return StaleMatchingAnalysisResponse(
            status="stale",
            profile_version=analysis.profile_version,
            job_description_version=analysis.job_description_version,
            job_description_analysis_version=(
                analysis.job_description_analysis_version
            ),
            generated_at=analysis.generated_at,
            failure_reason=None,
            result=result,
        )

    @staticmethod
    def _matching_analysis_result_response(
        analysis: MatchingAnalysis,
    ) -> MatchingAnalysisResultResponse:
        return build_matching_analysis_result_response(analysis)

    @staticmethod
    def _analysis_response(
        analysis: JobDescriptionAnalysis,
    ) -> JobDescriptionAnalysisResponse:
        return JobDescriptionAnalysisResponse.model_validate(
            {
                "job_description_version": analysis.job_description_version,
                "analysis_version": analysis.analysis_version,
                "parsed_at": analysis.parsed_at,
                "riva_summary": analysis.riva_summary,
                "responsibilities": analysis.responsibilities,
                "qualification_requirements": (analysis.qualification_requirements),
                "required_skills": analysis.required_skills,
                "preferred_qualifications": (analysis.preferred_qualifications),
                "soft_skills": analysis.soft_skills,
                "business_domains": analysis.business_domains,
            }
        )
