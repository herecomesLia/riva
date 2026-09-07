import asyncio
from collections.abc import Awaitable, Callable
from typing import Self

from async_lru import alru_cache

from riva.core.config import HealthProbeSettings, HealthSettings
from riva.db import Database
from riva.db.errors import DatabaseUnavailableError
from riva.llm import LLMClient
from riva.llm.errors import LLMError


class HealthProbe:
    def __init__(
        self,
        ping: Callable[[], Awaitable[None]],
        settings: HealthProbeSettings,
        expected_error: type[Exception],
    ) -> None:
        self._ping = ping
        self._settings = settings
        self._expected_error = expected_error
        self._cached_check = (
            alru_cache(maxsize=1, ttl=settings.ttl_seconds)(self._check)
            if settings.ttl_seconds > 0
            else None
        )

    async def check(self) -> bool:
        if self._cached_check is not None:
            return await self._cached_check()
        return await self._check()

    async def _check(self) -> bool:
        try:
            async with asyncio.timeout(self._settings.timeout_seconds):
                await self._ping()
        except TimeoutError, self._expected_error:
            return False
        return True

    async def close(self) -> None:
        if self._cached_check is not None:
            try:
                await self._cached_check.cache_close()
            finally:
                self._cached_check.cache_clear()


class HealthChecker:
    def __init__(
        self, settings: HealthSettings, database: Database, llm: LLMClient
    ) -> None:
        self.database = HealthProbe(
            database.ping, settings.database, DatabaseUnavailableError
        )
        self.llm = HealthProbe(llm.ping, settings.llm, LLMError)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    async def close(self) -> None:
        try:
            await self.llm.close()
        finally:
            await self.database.close()
