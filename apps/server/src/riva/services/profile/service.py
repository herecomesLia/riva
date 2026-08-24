from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.resumes.parser import ResumeParsingAgent
from riva.agents.resumes.types import ResumeParsingInput
from riva.core.language import InteractionLanguage
from riva.integrations.llm import LLMProvider
from riva.models import CareerProfile, User
from riva.services.errors import (
    DataTooLargeError,
    DomainConflictError,
    ExternalDependencyError,
    InvalidDataError,
)
from riva.services.profile.content import parse_content
from riva.services.profile.resume_import import (
    ResumeExtractionError,
    ResumeTextExtractor,
)
from riva.services.profile.types import (
    ProfileContent,
    ProfileResponse,
    SaveProfileRequest,
)


class ProfileService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        extractor: ResumeTextExtractor,
        llm_provider: LLMProvider | None,
        llm_model: str | None,
        max_upload_bytes: int,
        max_extracted_characters: int,
    ) -> None:
        self.session = session
        self.extractor = extractor
        self.llm_provider = llm_provider
        self.llm_model = llm_model
        self.max_upload_bytes = max_upload_bytes
        self.max_extracted_characters = max_extracted_characters

    async def get_profile(self, user: User) -> ProfileResponse | None:
        profile = await self._find_by_user_id(user.id)
        if profile is None:
            return None
        return ProfileResponse(
            version=profile.version,
            updated_at=profile.updated_at,
            content=parse_content(profile.content),
        )

    async def save(
        self,
        user: User,
        payload: SaveProfileRequest,
    ) -> ProfileResponse:
        skill_names = {skill.strip().casefold() for skill in payload.content.skills}
        if len(skill_names) != len(payload.content.skills):
            raise InvalidDataError("profile_skill_names_must_be_unique")
        for experience in (
            *payload.content.work_experiences,
            *payload.content.project_experiences,
        ):
            if any(
                skill.strip().casefold() not in skill_names
                for skill in experience.skills
            ):
                raise InvalidDataError("profile_experience_skill_not_found")

        await self._lock_user(user.id)
        profile = await self._find_by_user_id(user.id, for_update=True)
        self._validate_version(profile, payload.version)

        if profile is None:
            profile = CareerProfile(
                user_id=user.id,
                version=1,
                content=payload.content.model_dump(mode="json"),
            )
            self.session.add(profile)
        else:
            profile.version += 1
            profile.content = payload.content.model_dump(mode="json")

        await self.session.commit()
        await self.session.refresh(profile)
        return ProfileResponse(
            version=profile.version,
            updated_at=profile.updated_at,
            content=parse_content(profile.content),
        )

    async def import_from_resume(
        self,
        user: User,
        *,
        data: bytes,
        declared_media_type: str | None,
        interaction_language: InteractionLanguage,
    ) -> ProfileContent:
        if len(data) > self.max_upload_bytes:
            raise DataTooLargeError("resume_upload_too_large")
        if self.llm_provider is None or self.llm_model is None:
            raise ExternalDependencyError("llm_unavailable")

        current_profile = await self._find_by_user_id(user.id)
        current = (
            parse_content(current_profile.content)
            if current_profile
            else ProfileContent()
        )

        try:
            extracted = await self.extractor.extract(
                data,
                declared_media_type=declared_media_type,
                max_characters=self.max_extracted_characters,
            )
        except ResumeExtractionError as error:
            raise InvalidDataError(error.code) from None

        parsed = (
            await ResumeParsingAgent(self.llm_provider, self.llm_model).run(
                ResumeParsingInput(
                    resume_text=extracted,
                    interaction_language=interaction_language,
                )
            )
        ).output
        imported = ProfileContent.model_validate(parsed.model_dump())
        return _merge_profile_content(current, imported)

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
        )

    async def _find_by_user_id(
        self,
        user_id: UUID,
        *,
        for_update: bool = False,
    ) -> CareerProfile | None:
        statement = select(CareerProfile).where(CareerProfile.user_id == user_id)
        if for_update:
            statement = statement.with_for_update()
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    def _validate_version(
        profile: CareerProfile | None,
        requested_version: int | None,
    ) -> None:
        if (
            (profile is None and requested_version is not None)
            or (profile is not None and requested_version is None)
            or (
                profile is not None
                and requested_version is not None
                and profile.version != requested_version
            )
        ):
            raise DomainConflictError("profile_version_conflict")


def _merge_profile_content(
    current: ProfileContent,
    imported: ProfileContent,
) -> ProfileContent:
    skills = _merge_by_key(
        current.skills,
        imported.skills,
        key=lambda item: item.strip().casefold(),
    )
    education = _merge_by_key(
        current.education,
        imported.education,
        key=lambda item: (
            item.school.casefold(),
            (item.degree or "").casefold(),
            item.start_date,
            item.end_date,
        ),
    )
    work_experiences = _merge_by_key(
        current.work_experiences,
        imported.work_experiences,
        key=lambda item: (
            item.company.casefold(),
            item.title.casefold(),
            item.start_date,
            item.end_date,
        ),
    )
    project_experiences = _merge_by_key(
        current.project_experiences,
        imported.project_experiences,
        key=lambda item: (
            item.name.casefold(),
            item.start_date,
            item.end_date,
        ),
    )
    return ProfileContent(
        summary=current.summary or imported.summary,
        education=education,
        work_experiences=work_experiences,
        project_experiences=project_experiences,
        skills=skills,
    )


def _merge_by_key[T](
    current: Sequence[T],
    imported: Sequence[T],
    *,
    key,
) -> list[T]:
    merged = list(current)
    seen = {key(item) for item in current}
    for item in imported:
        item_key = key(item)
        if item_key not in seen:
            merged.append(item)
            seen.add(item_key)
    return merged
