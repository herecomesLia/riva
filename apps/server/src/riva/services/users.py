from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import User


class UsersService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def get_account(self, user: User) -> User:
        return user

    async def update_account(
        self,
        user: User,
        changes: Mapping[str, str | None],
    ) -> User:
        for field in ("display_name", "avatar_url"):
            if field in changes:
                setattr(user, field, changes[field])

        if changes:
            await self.session.commit()
            await self.session.refresh(user)

        return user
