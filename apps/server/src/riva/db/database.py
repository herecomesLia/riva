from typing import Self

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.schema import CreateSchema, DropSchema

from riva.db.base import Base
from riva.db.errors import DatabaseUnavailableError


def load_models() -> None:
    import riva.models  # noqa: F401


class Database:
    def __init__(self, database_url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
        )
        self.sessionmaker: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine,
            expire_on_commit=False,
        )

    async def dispose(self) -> None:
        await self.engine.dispose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.dispose()

    async def ping(self) -> None:
        try:
            async with self.sessionmaker() as session:
                await session.execute(text("SELECT 1"))
        except Exception as exc:
            raise DatabaseUnavailableError("Database ping failed.") from exc

    async def create_tables(self) -> None:
        load_models()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def drop_tables(self) -> None:
        load_models()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)

    async def reset(self) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(DropSchema("public", cascade=True, if_exists=True))
            await connection.execute(CreateSchema("public"))
        await self.create_tables()
