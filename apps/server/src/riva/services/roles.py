from uuid import UUID

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.errors import APIError
from riva.models import (
    CareerProfile,
    CurrentTargetRole,
    TargetRole,
    User,
)
from riva.schemas.roles import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    ExistingProfileContext,
    MissingJobDescriptionResponse,
    MissingProfileContext,
    RolesPageResponse,
    SaveJobDescriptionRequest,
    SavedJobDescriptionResponse,
    SetCurrentTargetRoleRequest,
    TargetRoleExperienceRange,
    TargetRoleResponse,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)


def career_profile_completed(profile: CareerProfile) -> bool:
    return bool(profile.skills) and bool(
        profile.education
        or profile.work_experiences
        or profile.project_experiences
    )


class TargetRoleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_roles_page(self, user: User) -> RolesPageResponse:
        return await self._roles_page(user.id)

    async def create_role(
        self,
        user: User,
        payload: CreateTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            await self._lock_user(user.id)
            current = await self._current_mapping(user.id)
            has_active_role = await self.session.scalar(
                select(TargetRole.id)
                .where(
                    TargetRole.user_id == user.id,
                    TargetRole.preparation_status.in_(("preparing", "paused")),
                )
                .limit(1)
            )
            role = TargetRole(
                user_id=user.id,
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
                self.session.add(
                    CurrentTargetRole(user_id=user.id, role_id=role.id)
                )

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def update_role(
        self,
        user: User,
        role_id: UUID,
        payload: UpdateTargetRoleRequest,
    ) -> RolesPageResponse:
        try:
            role = await self._locked_role(user.id, role_id)
            self._require_version(role, payload.version)
            role.title = payload.title
            role.company = payload.company
            role.recruitment_type = (
                payload.recruitment_type.value
                if payload.recruitment_type is not None
                else None
            )
            role.location = payload.location
            role.min_experience_years = (
                payload.experience_range.min_years
                if payload.experience_range is not None
                else None
            )
            role.max_experience_years = (
                payload.experience_range.max_years
                if payload.experience_range is not None
                else None
            )
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
                self.session.add(
                    CurrentTargetRole(user_id=user.id, role_id=role.id)
                )
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
            if (
                role.job_description_status != "saved"
                or role.raw_job_description != payload.raw_text
            ):
                role.job_description_status = "saved"
                role.raw_job_description = payload.raw_text
                role.job_description_version = (
                    (role.job_description_version or 0) + 1
                )
                role.version += 1

            return await self._commit_page(user.id)
        except Exception:
            await self.session.rollback()
            raise

    async def _roles_page(self, user_id: UUID) -> RolesPageResponse:
        roles = list(
            (
                await self.session.scalars(
                    select(TargetRole)
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
            roles=[self._role_response(role) for role in roles],
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
    def _role_response(role: TargetRole) -> TargetRoleResponse:
        experience_range = (
            None
            if (
                role.min_experience_years is None
                and role.max_experience_years is None
            )
            else TargetRoleExperienceRange(
                min_years=role.min_experience_years,
                max_years=role.max_experience_years,
            )
        )
        job_description = (
            MissingJobDescriptionResponse(
                status="missing",
                raw_text=None,
                version=None,
                parsing_failure_reason=None,
            )
            if role.job_description_status == "missing"
            else SavedJobDescriptionResponse(
                status="saved",
                raw_text=role.raw_job_description,
                version=role.job_description_version,
                parsing_failure_reason=None,
            )
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
            job_description_analysis=None,
            matching_analysis=None,
        )
