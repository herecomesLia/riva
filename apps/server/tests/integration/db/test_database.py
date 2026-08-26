from sqlalchemy import func, select

from riva.db import Database
from riva.models import User


def _user(username: str) -> User:
    return User(
        username=username,
        normalized_username=username.lower(),
        password_hash="test-password-hash",
        display_name=username,
    )


async def test_reset_removes_persisted_data_and_recreates_schema(
    database: Database,
) -> None:
    async with database.sessionmaker() as session:
        session.add(_user("BeforeReset"))
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(User)) == 1

    await database.reset()

    async with database.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0
        session.add(_user("AfterReset"))
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(User)) == 1
