from collections.abc import Mapping
from typing import Any
from uuid import UUID

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.models import Profile, User


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile(self, user: User) -> Profile:
        profile = await self._find_by_user_id(user.id)
        if profile is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "profile_not_found")
        return profile

    async def replace_profile(
        self,
        user: User,
        content: Mapping[str, Any],
    ) -> Profile:
        profile = await self._find_by_user_id(user.id)
        if profile is None:
            profile = Profile(user_id=user.id, **content)
            self.session.add(profile)
        else:
            for field, value in content.items():
                setattr(profile, field, value)
            profile.version += 1

        await self.session.commit()
        await self.session.refresh(profile)
        return profile

    async def _find_by_user_id(self, user_id: UUID) -> Profile | None:
        result = await self.session.execute(
            select(Profile).where(Profile.user_id == user_id)
        )
        return result.scalar_one_or_none()
