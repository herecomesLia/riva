import asyncio
from typing import Self

from async_lru import alru_cache
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from openai import APIStatusError, AsyncOpenAI

from riva.core.config import LLMSettings
from riva.llm.errors import LLMError, LLMNotConfiguredError
from riva.schemas.health import HealthStatus


class LLMClient:
    def __init__(self, settings: LLMSettings) -> None:
        self._settings = settings
        self._cached_health = (
            alru_cache(maxsize=1, ttl=settings.health.ttl_seconds)(self._check_health)
            if settings.health.ttl_seconds > 0
            else None
        )
        self._chat_model: BaseChatModel | None = None
        self._probe_client: AsyncOpenAI | None = None

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    @property
    def chat_model(self) -> BaseChatModel:
        if self._chat_model is None:
            model, api_key, base_url = self._require_configured()
            try:
                self._chat_model = ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    base_url=base_url,
                    timeout=self._settings.timeout_seconds,
                    max_retries=self._settings.max_retries,
                )
            except Exception as exc:
                raise LLMError("Failed to initialize LLM chat model.") from exc
        return self._chat_model

    async def close(self) -> None:
        try:
            if self._cached_health is not None:
                try:
                    await self._cached_health.cache_close()
                finally:
                    self._cached_health.cache_clear()
        finally:
            await self._close_clients()

    async def check_health(self) -> HealthStatus:
        if self._cached_health is not None:
            return await self._cached_health()
        return await self._check_health()

    async def _check_health(self) -> HealthStatus:
        try:
            async with asyncio.timeout(self._settings.health.timeout_seconds):
                await self.ping()
        except TimeoutError, LLMError:
            return HealthStatus.unavailable
        return HealthStatus.ok

    async def _close_clients(self) -> None:
        probe_client = self._probe_client
        chat_model = self._chat_model
        self._probe_client = None
        self._chat_model = None

        try:
            if probe_client is not None:
                await probe_client.close()
        finally:
            if chat_model is not None:
                root_client = getattr(chat_model, "root_client", None)
                root_async_client = getattr(chat_model, "root_async_client", None)
                try:
                    if root_client is not None:
                        root_client.close()
                finally:
                    if root_async_client is not None:
                        await root_async_client.close()

    def _require_configured(self) -> tuple[str, str, str]:
        if not self._settings.configured:
            raise LLMNotConfiguredError("LLM is not configured.")

        model = self._settings.model
        api_key = self._settings.api_key
        base_url = self._settings.base_url
        if model is None or api_key is None or base_url is None:
            raise LLMNotConfiguredError("LLM configuration is incomplete.")
        return model, api_key.get_secret_value(), str(base_url)

    async def ping(self) -> None:
        if not self._settings.configured:
            raise LLMNotConfiguredError("LLM is not configured.")

        try:
            await self._ping_remote()
        except LLMError:
            raise
        except Exception as exc:
            raise LLMError("LLM ping failed.") from exc

    async def _ping_remote(self) -> None:
        model, _, _ = self._require_configured()
        client = self._get_probe_client()

        try:
            await client.models.retrieve(model)
            return
        except APIStatusError as exc:
            if exc.status_code not in {404, 405, 501}:
                raise

        # Compatibility fallback for providers that expose /models but not /models/{model}.
        async for available_model in client.models.list():
            if available_model.id == model:
                return

        raise LLMError(f"Configured model is unavailable: {model}")

    def _get_probe_client(self) -> AsyncOpenAI:
        if self._probe_client is None:
            _, api_key, base_url = self._require_configured()
            try:
                self._probe_client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                    timeout=None,  # check_health bounds the entire probe.
                    max_retries=0,
                )
            except Exception as exc:
                raise LLMError("Failed to initialize LLM probe client.") from exc
        return self._probe_client
