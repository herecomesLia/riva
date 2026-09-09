import asyncio
from typing import Literal, Self, get_args

from async_lru import alru_cache
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from openai import APIStatusError, AsyncOpenAI

from riva.core.config import LLMModelSettings, LLMSettings
from riva.llm.errors import LLMError, LLMNotConfiguredError
from riva.schemas.health import HealthStatus

type LLMModelSlot = Literal["default", "reasoning"]


class LLMClient:
    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings
        self._cached_health = (
            alru_cache(maxsize=2, ttl=settings.health.ttl_seconds)(
                self._check_model_health
            )
            if settings.health.ttl_seconds > 0
            else None
        )
        self._chat_models: dict[tuple[str | None, bool], BaseChatModel] = {}
        self._probe_client: AsyncOpenAI | None = None

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    def chat_model(self, slot: LLMModelSlot = "default") -> BaseChatModel:
        api_key, base_url = self._require_configured()
        model = self._resolve_model(slot)
        key = (model.id, model.use_responses_api)
        if key not in self._chat_models:
            try:
                self._chat_models[key] = ChatOpenAI(
                    model=model.id,
                    use_responses_api=model.use_responses_api,
                    api_key=api_key,
                    base_url=base_url,
                    # Callers configure Runnable retries; avoid stacking SDK retries.
                    max_retries=0,
                )
            except Exception as exc:
                raise LLMError("Failed to initialize LLM chat model.") from exc
        return self._chat_models[key]

    def _resolve_model(self, slot: LLMModelSlot) -> LLMModelSettings:
        if slot not in get_args(LLMModelSlot.__value__):
            raise ValueError(f"Unknown LLM model slot: {slot}")
        return getattr(self.settings.models, slot)

    def _model_ids(self) -> list[str]:
        return list(
            dict.fromkeys(
                model.id
                for model in (
                    self.settings.models.default,
                    self.settings.models.reasoning,
                )
                if model.id is not None
            )
        )

    async def close(self) -> None:
        try:
            if self._cached_health is not None:
                try:
                    await self._cached_health.cache_close()
                finally:
                    self._cached_health.cache_clear()
        finally:
            self._chat_models.clear()
            probe_client = self._probe_client
            self._probe_client = None
            if probe_client is not None:
                await probe_client.close()

    async def check_health(self) -> HealthStatus:
        if not self.settings.configured:
            return HealthStatus.unavailable
        check = self._cached_health or self._check_model_health
        results = await asyncio.gather(
            *(check(model_id) for model_id in self._model_ids())
        )
        if all(results):
            return HealthStatus.ok
        if any(results):
            return HealthStatus.degraded
        return HealthStatus.unavailable

    async def _check_model_health(self, model_id: str) -> bool:
        try:
            async with asyncio.timeout(self.settings.health.timeout_seconds):
                await self._probe_model(model_id)
        except TimeoutError, LLMError:
            return False
        return True

    def _require_configured(self) -> tuple[str, str]:
        if not self.settings.configured:
            raise LLMNotConfiguredError("LLM is not configured.")

        api_key = self.settings.api_key
        base_url = self.settings.base_url
        if (
            self.settings.models.default.id is None
            or api_key is None
            or base_url is None
        ):
            raise LLMNotConfiguredError("LLM configuration is incomplete.")
        return api_key.get_secret_value(), str(base_url)

    async def ping(self, slot: LLMModelSlot | None = None) -> None:
        self._require_configured()
        model_ids = (
            self._model_ids() if slot is None else [self._resolve_model(slot).id]
        )
        results = await asyncio.gather(
            *(self._probe_model(model_id) for model_id in model_ids),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, BaseException):
                raise result

    async def _probe_model(self, model_id: str) -> None:
        try:
            await self._ping_remote(model_id)
        except LLMError:
            raise
        except Exception as exc:
            raise LLMError("LLM ping failed.") from exc

    async def _ping_remote(self, model_id: str) -> None:
        client = self._get_probe_client()

        try:
            await client.models.retrieve(model_id)
            return
        except APIStatusError as exc:
            if exc.status_code not in {404, 405, 501}:
                raise

        # Compatibility fallback for providers that expose /models but not /models/{model}.
        async for available_model in client.models.list():
            if available_model.id == model_id:
                return

        raise LLMError(f"Configured model is unavailable: {model_id}")

    def _get_probe_client(self) -> AsyncOpenAI:
        if self._probe_client is None:
            api_key, base_url = self._require_configured()
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
