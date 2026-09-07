from collections.abc import AsyncIterator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from openai import APIStatusError

from riva.core.config import DatabaseSettings, HealthCheckSettings, LLMSettings
from riva.db import Database
from riva.db.errors import DatabaseUnavailableError
from riva.llm.client import LLMClient
from riva.llm.errors import LLMError, LLMNotConfiguredError
from riva.schemas.health import HealthStatus
from tests.support.settings import PLACEHOLDER_DATABASE_URL


def _configured_client(**overrides: object) -> LLMClient:
    values: dict[str, object] = {
        "base_url": "https://llm.test/v1",
        "model": "test-model",
        "api_key": "test-key",
    }
    values.update(overrides)
    return LLMClient(LLMSettings(**values))


async def _model_stream(model_ids: tuple[str, ...]) -> AsyncIterator[SimpleNamespace]:
    for model_id in model_ids:
        yield SimpleNamespace(id=model_id)


def _api_status_error(status_code: int) -> APIStatusError:
    request = httpx.Request("GET", "https://llm.test/v1/models/test-model")
    response = httpx.Response(status_code, request=request)
    return APIStatusError("provider failure", response=response, body=None)


def _probe_client(
    *,
    retrieve_side_effect: BaseException | None = None,
    model_ids: tuple[str, ...] = (),
) -> tuple[SimpleNamespace, AsyncMock, MagicMock]:
    retrieve = AsyncMock(side_effect=retrieve_side_effect)
    list_models = MagicMock(return_value=_model_stream(model_ids))
    models = SimpleNamespace(retrieve=retrieve, list=list_models)
    probe_client = SimpleNamespace(models=models, close=AsyncMock())
    return probe_client, retrieve, list_models


def test_chat_model_uses_runtime_configuration_and_is_reused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _configured_client(timeout_seconds=12, max_retries=3)
    chat_model = object()
    chat_openai = MagicMock(return_value=chat_model)
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    first = client.chat_model
    second = client.chat_model

    assert first is second
    chat_openai.assert_called_once_with(
        model="test-model",
        api_key="test-key",
        base_url="https://llm.test/v1",
        timeout=12,
        max_retries=3,
    )


def test_chat_model_requires_llm_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = LLMClient(LLMSettings())
    chat_openai = MagicMock()
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    with pytest.raises(LLMNotConfiguredError):
        _ = client.chat_model

    chat_openai.assert_not_called()


def test_chat_model_wraps_initialization_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _configured_client()
    failure = RuntimeError("chat model initialization failed")
    chat_openai = MagicMock(side_effect=failure)
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    with pytest.raises(LLMError) as raised:
        _ = client.chat_model

    assert raised.value.__cause__ is failure


async def test_ping_retrieves_configured_model_without_fallback() -> None:
    client = _configured_client()
    probe_client, retrieve, list_models = _probe_client()
    client._probe_client = probe_client

    await client.ping()

    retrieve.assert_awaited_once_with("test-model")
    list_models.assert_not_called()
    await client.close()


@pytest.mark.parametrize("status_code", [404, 405, 501])
async def test_ping_falls_back_to_model_list_for_compatibility_status(
    status_code: int,
) -> None:
    client = _configured_client()
    probe_client, retrieve, list_models = _probe_client(
        retrieve_side_effect=_api_status_error(status_code),
        model_ids=("test-model",),
    )
    client._probe_client = probe_client

    await client.ping()

    retrieve.assert_awaited_once_with("test-model")
    list_models.assert_called_once_with()
    await client.close()


async def test_ping_does_not_fallback_for_provider_failure() -> None:
    client = _configured_client()
    failure = _api_status_error(500)
    probe_client, retrieve, list_models = _probe_client(
        retrieve_side_effect=failure,
    )
    client._probe_client = probe_client

    with pytest.raises(LLMError) as raised:
        await client.ping()

    assert raised.value.__cause__ is failure
    assert await client.check_health() == HealthStatus.unavailable
    assert retrieve.await_count == 2
    retrieve.assert_awaited_with("test-model")
    list_models.assert_not_called()
    await client.close()


async def test_ping_fails_when_configured_model_is_not_listed() -> None:
    client = _configured_client()
    probe_client, retrieve, list_models = _probe_client(
        retrieve_side_effect=_api_status_error(404),
        model_ids=("model-a", "model-b"),
    )
    client._probe_client = probe_client

    with pytest.raises(LLMError, match="test-model"):
        await client.ping()

    retrieve.assert_awaited_once_with("test-model")
    list_models.assert_called_once_with()
    await client.close()


async def test_ping_reports_not_configured_without_remote_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = LLMClient(LLMSettings())
    async_openai = MagicMock()
    monkeypatch.setattr("riva.llm.client.AsyncOpenAI", async_openai)

    with pytest.raises(LLMNotConfiguredError):
        await client.ping()

    assert await client.check_health() == HealthStatus.unavailable
    async_openai.assert_not_called()
    await client.close()


async def test_context_manager_releases_initialized_clients() -> None:
    client = _configured_client()
    probe_close = AsyncMock()
    root_close = MagicMock()
    root_async_close = AsyncMock()
    client._probe_client = SimpleNamespace(close=probe_close)
    client._chat_model = SimpleNamespace(
        root_client=SimpleNamespace(close=root_close),
        root_async_client=SimpleNamespace(close=root_async_close),
    )

    async with client:
        pass

    probe_close.assert_awaited_once_with()
    root_close.assert_called_once_with()
    root_async_close.assert_awaited_once_with()


@pytest.mark.parametrize(
    ("database_ttl", "llm_ttl", "database_calls", "llm_calls"),
    [(5, 0, 1, 2), (0, 30, 2, 1)],
)
@pytest.mark.parametrize("available", [True, False])
async def test_health_respects_independent_cache_policies(
    database_ttl: int,
    llm_ttl: int,
    database_calls: int,
    llm_calls: int,
    available: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database = Database(
        DatabaseSettings(
            url=PLACEHOLDER_DATABASE_URL,
            health=HealthCheckSettings(timeout_seconds=2, ttl_seconds=database_ttl),
        )
    )
    llm = _configured_client(
        health=HealthCheckSettings(timeout_seconds=5, ttl_seconds=llm_ttl),
    )
    database_ping = AsyncMock(
        side_effect=None if available else DatabaseUnavailableError("unavailable")
    )
    llm_ping = AsyncMock(side_effect=None if available else LLMError("unavailable"))
    monkeypatch.setattr(database, "ping", database_ping)
    monkeypatch.setattr(llm, "ping", llm_ping)
    expected = HealthStatus.ok if available else HealthStatus.unavailable
    async with database, llm:
        for _ in range(2):
            assert await database.check_health() == expected
            assert await llm.check_health() == expected
        assert database_ping.await_count == database_calls
        assert llm_ping.await_count == llm_calls
