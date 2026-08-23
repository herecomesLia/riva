from collections.abc import Callable
from typing import cast
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.jobs.jd_parser import JobDescriptionParsingAgent
from riva.agents.jobs.matcher import MatchingAnalysisAgent
from riva.core.language import DEFAULT_INTERACTION_LANGUAGE, InteractionLanguage
from riva.integrations.llm import LLMProvider
from riva.models import (
    CareerProfile,
    CurrentTargetRole,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.services.errors import (
    DomainConflictError,
    ExternalDependencyError,
    ResourceMissingError,
    ServiceError,
)
from riva.services.jobs.jd_analysis import (
    JobDescriptionAnalysisService,
    JobDescriptionParsingStateError,
    build_riva_summary,
)
from riva.services.jobs.matching import (
    MatchingAnalysisService,
    MatchingAnalysisStateError,
)
from riva.services.jobs.matching_types import MatchingAnalysisResultResponse
from riva.services.jobs.role_types import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    CurrentMatchingAnalysisResponse,
    ExistingProfileContext,
    JobDescriptionAnalysisResponse,
    MissingJobDescriptionResponse,
    MissingProfileContext,
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
from riva.services.profile.completion import career_profile_completed


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
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        clock: Callable[[], object] | None = None,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.clock = clock

    async def get_roles_page(self, user: User) -> RolesPageResponse:
        return await self._roles_page(user.id)

    async def create_role(
        self, user: User, payload: CreateTargetRoleRequest
    ) -> RolesPageResponse:
        try:
            await self.create_role_in_transaction(user.id, payload)
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def create_role_in_transaction(
        self, user_id: UUID, payload: CreateTargetRoleRequest
    ) -> TargetRole:
        await self._lock_user(user_id)
        current = await self._current_mapping(user_id)
        has_active = await self.session.scalar(
            select(TargetRole.id)
            .where(
                TargetRole.user_id == user_id,
                TargetRole.preparation_status.in_(("preparing", "paused")),
            )
            .limit(1)
        )
        experience = payload.experience_range
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
            min_experience_years=experience.min_years if experience else None,
            max_experience_years=experience.max_years if experience else None,
            preparation_status=payload.preparation_status.value,
            job_description_status="missing",
            raw_job_description=None,
            job_description_version=None,
            version=1,
        )
        self.session.add(role)
        await self.session.flush()
        if current is None and has_active is None:
            self.session.add(CurrentTargetRole(user_id=user_id, role_id=role.id))
        return role

    async def update_role(
        self, user: User, role_id: UUID, payload: UpdateTargetRoleRequest
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            experience = payload.experience_range
            requested = (
                payload.title,
                payload.company,
                payload.recruitment_type.value if payload.recruitment_type else None,
                payload.location,
                experience.min_years if experience else None,
                experience.max_years if experience else None,
            )
            current = (
                role.title,
                role.company,
                role.recruitment_type,
                role.location,
                role.min_experience_years,
                role.max_experience_years,
            )
            if current != requested:
                (
                    role.title,
                    role.company,
                    role.recruitment_type,
                    role.location,
                    role.min_experience_years,
                    role.max_experience_years,
                ) = requested
                role.version += 1
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def set_current_role(
        self, user: User, role_id: UUID, payload: SetCurrentTargetRoleRequest
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
            else:
                current.role_id = role.id
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def update_preparation_status(
        self, user: User, role_id: UUID, payload: UpdatePreparationStatusRequest
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            if role.preparation_status == "archived":
                raise self._state_conflict()
            if role.preparation_status != payload.preparation_status.value:
                role.preparation_status = payload.preparation_status.value
                role.version += 1
            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def archive_role(
        self, user: User, role_id: UUID, payload: ArchiveTargetRoleRequest
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
        self, user: User, role_id: UUID, version: int
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
        self, user: User, role_id: UUID, payload: SaveJobDescriptionRequest
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
        self, role: TargetRole, raw_text: str
    ) -> None:
        if (
            role.job_description_status == "saved"
            and role.raw_job_description == raw_text
        ):
            return
        role.job_description_status = "saved"
        role.raw_job_description = raw_text
        role.job_description_version = (role.job_description_version or 0) + 1
        await self.session.execute(
            delete(JobDescriptionAnalysis).where(
                JobDescriptionAnalysis.role_id == role.id
            ),
        )
        await self.session.execute(
            delete(MatchingAnalysis).where(MatchingAnalysis.role_id == role.id)
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
                raise DomainConflictError("job_description_version_conflict")
            analysis = await self._locked_analysis(user.id, role.id)
            if (
                analysis is None
                or analysis.job_description_version != role.job_description_version
            ):
                raise DomainConflictError("job_description_analysis_not_ready")
            if analysis.analysis_version != payload.analysis_version:
                raise DomainConflictError("job_description_analysis_version_conflict")
            if self._replace_analysis_module(analysis, payload):
                analysis.riva_summary = build_riva_summary(
                    responsibilities=analysis.responsibilities,
                    qualification_requirements=analysis.qualification_requirements,
                    required_skills=analysis.required_skills,
                    preferred_qualifications=analysis.preferred_qualifications,
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
                raise DomainConflictError("job_description_version_conflict")
            if self._has_current_analysis(role):
                return await self._commit_page(user.id)
            self._require_llm("job_description_parsing_unavailable")
            service = JobDescriptionAnalysisService(self.session)
            parsing_input = await service.build_parsing_input(
                user_id=user.id,
                role_id=role.id,
                interaction_language=interaction_language,
            )
            output = (
                await JobDescriptionParsingAgent(self.llm_provider, self.llm_model).run(
                    parsing_input
                )
            ).output
            await service.persist_success(
                user_id=user.id, role_id=role.id, output=output
            )
            return await self._commit_page(user.id)
        except JobDescriptionParsingStateError as error:
            await self.session.rollback()
            raise DomainConflictError(error.code) from None
        except Exception:
            await self.session.rollback()
            raise

    async def start_matching_analysis(
        self,
        user: User,
        role_id: UUID,
        payload: StartMatchingAnalysisRequest,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            self._require_llm("matching_analysis_unavailable")
            service = MatchingAnalysisService(self.session)
            matching_input = await service.build_matching_input(
                user_id=user.id,
                role_id=role.id,
                interaction_language=interaction_language,
            )
            output = (
                await MatchingAnalysisAgent(self.llm_provider, self.llm_model).run(
                    matching_input
                )
            ).output
            await service.persist_success(
                user_id=user.id,
                role_id=role.id,
                interaction_language=interaction_language,
                output=output,
            )
            return await self._commit_page(user.id)
        except MatchingAnalysisStateError as error:
            await self.session.rollback()
            raise DomainConflictError(error.code) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _role_response_for_user(
        self, user_id: UUID, role_id: UUID
    ) -> TargetRoleResponse:
        role = await self._role(user_id, role_id)
        profile = await self._profile(user_id)
        return self._role_response(role, profile)

    async def _roles_page(self, user_id: UUID) -> RolesPageResponse:
        roles = (
            await self.session.scalars(
                select(TargetRole)
                .options(
                    selectinload(TargetRole.job_description_analysis),
                    selectinload(TargetRole.matching_analysis),
                )
                .where(TargetRole.user_id == user_id)
                .order_by(TargetRole.created_at.asc(), TargetRole.id.asc())
            )
        ).all()
        profile = await self._profile(user_id)
        current = await self._current_mapping(user_id)
        return RolesPageResponse(
            roles=[self._role_response(role, profile) for role in roles],
            current_role_id=current.role_id if current else None,
            profile_context=(
                MissingProfileContext(exists=False, version=None, completed=False)
                if profile is None
                else ExistingProfileContext(
                    exists=True,
                    version=profile.version,
                    completed=career_profile_completed(profile),
                )
            ),
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

    async def _locked_role(self, user_id: UUID, role_id: UUID) -> TargetRole:
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.matching_analysis),
            )
            .where(TargetRole.id == role_id, TargetRole.user_id == user_id)
            .with_for_update()
        )
        if role is None:
            raise ResourceMissingError("target_role_not_found")
        return role

    async def _role(self, user_id: UUID, role_id: UUID) -> TargetRole:
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.matching_analysis),
            )
            .where(TargetRole.id == role_id, TargetRole.user_id == user_id)
        )
        if role is None:
            raise ResourceMissingError("target_role_not_found")
        return role

    async def _locked_analysis(
        self, user_id: UUID, role_id: UUID
    ) -> JobDescriptionAnalysis | None:
        return await self.session.scalar(
            select(JobDescriptionAnalysis)
            .where(
                JobDescriptionAnalysis.role_id == role_id,
                JobDescriptionAnalysis.user_id == user_id,
            )
            .with_for_update()
        )

    async def _current_mapping(
        self, user_id: UUID, *, for_update: bool = False
    ) -> CurrentTargetRole | None:
        statement = select(CurrentTargetRole).where(
            CurrentTargetRole.user_id == user_id
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _replace_current_if_needed(
        self, user_id: UUID, excluded_role_id: UUID
    ) -> None:
        current = await self._current_mapping(user_id, for_update=True)
        if current is None or current.role_id != excluded_role_id:
            return
        fallback = await self.session.scalar(
            select(TargetRole.id)
            .where(
                TargetRole.user_id == user_id,
                TargetRole.id != excluded_role_id,
                TargetRole.preparation_status == "preparing",
            )
            .order_by(TargetRole.created_at.asc(), TargetRole.id.asc())
            .limit(1)
        )
        if fallback is None:
            await self.session.delete(current)
        else:
            current.role_id = fallback

    @staticmethod
    def _require_version(role: TargetRole, requested_version: int) -> None:
        if role.version != requested_version:
            raise DomainConflictError("target_role_version_conflict")

    @staticmethod
    def _state_conflict() -> ServiceError:
        return DomainConflictError("target_role_state_conflict")

    @staticmethod
    def _require_saved_job_description(role: TargetRole) -> None:
        if (
            role.job_description_status != "saved"
            or not role.raw_job_description
            or role.job_description_version is None
        ):
            raise DomainConflictError("job_description_missing")

    def _require_llm(self, error_code: str) -> None:
        if self.llm_provider is None or not self.llm_model:
            raise ExternalDependencyError(error_code)

    @staticmethod
    def _matching_job_description_ready(
        role: TargetRole, analysis: JobDescriptionAnalysis | None
    ) -> bool:
        return bool(
            role.job_description_status == "saved"
            and role.raw_job_description
            and role.job_description_version is not None
            and analysis is not None
            and analysis.job_description_version == role.job_description_version
        )

    @staticmethod
    def _has_current_analysis(role: TargetRole) -> bool:
        return TargetRoleService._matching_job_description_ready(
            role, role.job_description_analysis
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
        elif payload.field == "preferredQualifications":
            value = list(payload.value)
            if analysis.preferred_qualifications == value:
                return False
            analysis.preferred_qualifications = value
        elif payload.field == "softSkills":
            value = list(payload.value)
            if analysis.soft_skills == value:
                return False
            analysis.soft_skills = value
        elif payload.field == "businessDomains":
            value = list(payload.value)
            if analysis.business_domains == value:
                return False
            analysis.business_domains = value
        elif payload.field == "qualificationRequirements":
            value = payload.value.model_dump(mode="json", by_alias=False)
            if analysis.qualification_requirements == value:
                return False
            analysis.qualification_requirements = cast(dict[str, list[str]], value)
        elif payload.field == "requiredSkills":
            value = payload.value.model_dump(mode="json", by_alias=False)
            if analysis.required_skills == value:
                return False
            analysis.required_skills = cast(dict[str, list[str]], value)
        else:
            raise AssertionError("Unsupported job description analysis field")
        return True

    @staticmethod
    def _role_response(
        role: TargetRole, profile: CareerProfile | None
    ) -> TargetRoleResponse:
        experience = None
        if (
            role.min_experience_years is not None
            or role.max_experience_years is not None
        ):
            experience = TargetRoleExperienceRange(
                min_years=role.min_experience_years,
                max_years=role.max_experience_years,
            )
        analysis = role.job_description_analysis
        ready = TargetRoleService._matching_job_description_ready(role, analysis)
        job_description = (
            MissingJobDescriptionResponse(status="missing", raw_text=None, version=None)
            if role.job_description_status == "missing"
            else (
                ReadyJobDescriptionResponse(
                    status="ready",
                    raw_text=role.raw_job_description,
                    version=role.job_description_version,
                )
                if ready
                else SavedJobDescriptionResponse(
                    status="saved",
                    raw_text=role.raw_job_description,
                    version=role.job_description_version,
                )
            ),
        )
        analysis_response = (
            TargetRoleService._analysis_response(analysis)
            if ready and analysis
            else None
        )
        matching_response = None
        matching = role.matching_analysis
        if matching is not None:
            current = bool(
                ready
                and profile is not None
                and matching.profile_id == profile.profile_id
                and matching.profile_version == profile.version
                and matching.job_description_version == role.job_description_version
                and analysis is not None
                and matching.job_description_analysis_version
                == analysis.analysis_version
            )
            response_type = (
                CurrentMatchingAnalysisResponse
                if current
                else StaleMatchingAnalysisResponse
            )
            matching_response = response_type(
                status="current" if current else "stale",
                profile_version=matching.profile_version,
                job_description_version=matching.job_description_version,
                job_description_analysis_version=matching.job_description_analysis_version,
                generated_at=matching.generated_at,
                result=build_matching_analysis_result_response(matching),
            )
        return TargetRoleResponse(
            id=role.id,
            title=role.title,
            company=role.company,
            recruitment_type=role.recruitment_type,
            location=role.location,
            experience_range=experience,
            preparation_status=role.preparation_status,
            created_at=role.created_at,
            updated_at=role.updated_at,
            version=role.version,
            job_description=job_description,
            job_description_analysis=analysis_response,
            matching_analysis=matching_response,
        )

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
                "qualification_requirements": analysis.qualification_requirements,
                "required_skills": analysis.required_skills,
                "preferred_qualifications": analysis.preferred_qualifications,
                "soft_skills": analysis.soft_skills,
                "business_domains": analysis.business_domains,
            }
        )
