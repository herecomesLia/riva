import asyncio
from typing import Self

from async_lru import alru_cache
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.schema import CreateSchema, DropSchema

from riva.core.config import DatabaseSettings
from riva.db.base import Base
from riva.db.errors import DatabaseUnavailableError
from riva.schemas.health import HealthStatus


def load_models() -> None:
    import riva.models  # noqa: F401


class Database:
    def __init__(self, settings: DatabaseSettings) -> None:
        self._settings = settings
        self._cached_health = (
            alru_cache(maxsize=1, ttl=settings.health.ttl_seconds)(self._check_health)
            if settings.health.ttl_seconds > 0
            else None
        )
        self.engine: AsyncEngine = create_async_engine(
            settings.url,
            pool_pre_ping=True,
        )
        self.sessionmaker: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine,
            expire_on_commit=False,
        )

    async def dispose(self) -> None:
        try:
            if self._cached_health is not None:
                try:
                    await self._cached_health.cache_close()
                finally:
                    self._cached_health.cache_clear()
        finally:
            await self.engine.dispose()

    async def check_health(self) -> HealthStatus:
        if self._cached_health is not None:
            return await self._cached_health()
        return await self._check_health()

    async def _check_health(self) -> HealthStatus:
        try:
            async with asyncio.timeout(self._settings.health.timeout_seconds):
                await self.ping()
        except TimeoutError, DatabaseUnavailableError:
            return HealthStatus.unavailable
        return HealthStatus.ok

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
