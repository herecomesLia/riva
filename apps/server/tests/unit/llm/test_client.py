import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from openai import APIStatusError

from riva.core.config import HealthCheckSettings, LLMSettings
from riva.llm.client import LLMClient
from riva.llm.errors import LLMError, LLMNotConfiguredError
from riva.schemas.health import HealthStatus


def _configured_client(**overrides: object) -> LLMClient:
    values: dict[str, object] = {
        "base_url": "https://llm.test/v1",
        "models": {"default": {"id": "test-model"}},
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
    client = _configured_client()
    chat_model = object()
    chat_openai = MagicMock(return_value=chat_model)
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    first = client.chat_model()
    second = client.chat_model()

    assert first is second
    assert client.chat_model("reasoning") is first
    chat_openai.assert_called_once_with(
        model="test-model",
        use_responses_api=False,
        api_key="test-key",
        base_url="https://llm.test/v1",
        max_retries=0,
    )


def test_chat_model_requires_llm_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = LLMClient(LLMSettings())
    chat_openai = MagicMock()
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    with pytest.raises(LLMNotConfiguredError):
        _ = client.chat_model()

    chat_openai.assert_not_called()


def test_chat_model_wraps_initialization_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _configured_client()
    failure = RuntimeError("chat model initialization failed")
    chat_openai = MagicMock(side_effect=failure)
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", chat_openai)

    with pytest.raises(LLMError) as raised:
        _ = client.chat_model()

    assert raised.value.__cause__ is failure


async def test_ping_retrieves_configured_model_without_fallback() -> None:
    client = _configured_client()
    probe_client, retrieve, list_models = _probe_client()
    client._probe_client = probe_client

    await client.ping()

    retrieve.assert_awaited_once_with("test-model")
    list_models.assert_not_called()
    await client.close()


@pytest.mark.parametrize(
    ("reasoning_id", "responses"), [("reasoning-model", False), ("test-model", True)]
)
async def test_chat_slots_select_distinct_model_definitions(
    monkeypatch: pytest.MonkeyPatch, reasoning_id: str, responses: bool
) -> None:
    client = _configured_client(
        models={
            "default": {"id": "test-model"},
            "reasoning": {"id": reasoning_id, "use_responses_api": responses},
        }
    )
    models = [object(), object()]
    constructor = MagicMock(side_effect=models)
    monkeypatch.setattr("riva.llm.client.ChatOpenAI", constructor)
    probe, _, _ = _probe_client()
    client._probe_client = probe
    async with client:
        assert client.chat_model() is models[0]
        assert client.chat_model("default") is models[0]
        assert client.chat_model("reasoning") is models[1]
        assert client.chat_model("reasoning") is models[1]
    assert constructor.call_args_list[1].kwargs["model"] == reasoning_id
    assert constructor.call_args_list[1].kwargs["use_responses_api"] is responses
    await client.close()
    probe.close.assert_awaited_once_with()


@pytest.mark.parametrize("slot", [None, "default", "reasoning"])
async def test_ping_selects_slots_and_finishes_all_probes(slot: str | None) -> None:
    client = _configured_client(
        models={
            "default": {"id": "test-model"},
            "reasoning": {"id": "reasoning-model"},
        }
    )
    failure = _api_status_error(500)
    probe, retrieve, _ = _probe_client()

    async def retrieve_model(model_id: str) -> None:
        if model_id == "test-model":
            raise failure
        await asyncio.sleep(0)

    retrieve.side_effect = retrieve_model
    client._probe_client = probe
    async with client:
        if slot == "reasoning":
            await client.ping(slot)
        else:
            with pytest.raises(LLMError) as raised:
                await client.ping(slot)
            assert raised.value.__cause__ is failure
            assert "provider failure" not in str(raised.value)
    expected = (
        ["test-model", "reasoning-model"]
        if slot is None
        else ["test-model" if slot == "default" else "reasoning-model"]
    )
    assert [call.args[0] for call in retrieve.await_args_list] == expected


@pytest.mark.parametrize("ttl", [0, 30])
@pytest.mark.parametrize(
    ("reasoning_id", "failed_ids", "expected"),
    [
        (None, (), HealthStatus.ok),
        (None, ("test-model",), HealthStatus.unavailable),
        ("test-model", (), HealthStatus.ok),
        ("reasoning-model", (), HealthStatus.ok),
        ("reasoning-model", ("test-model",), HealthStatus.degraded),
        (
            "reasoning-model",
            ("test-model", "reasoning-model"),
            HealthStatus.unavailable,
        ),
    ],
)
async def test_health_aggregates_unique_ids_and_caches_each_probe(
    ttl: int,
    reasoning_id: str | None,
    failed_ids: tuple[str, ...],
    expected: HealthStatus,
) -> None:
    client = _configured_client(
        models={
            "default": {"id": "test-model"},
            "reasoning": {"id": reasoning_id, "use_responses_api": True},
        },
        health=HealthCheckSettings(timeout_seconds=1, ttl_seconds=ttl),
    )
    probe, retrieve, _ = _probe_client()

    async def retrieve_model(model_id: str) -> None:
        if model_id in failed_ids:
            raise _api_status_error(500)

    retrieve.side_effect = retrieve_model
    client._probe_client = probe
    ids = {"test-model", reasoning_id or "test-model"}
    async with client:
        for _ in range(2):
            assert await client.check_health() == expected
        assert retrieve.await_count == len(ids) * (1 if ttl else 2)
        retrieve.reset_mock()
        if failed_ids:
            with pytest.raises(LLMError):
                await client.ping()
        else:
            await client.ping()
        assert {call.args[0] for call in retrieve.await_args_list} == ids
        assert retrieve.await_count == len(ids)


async def test_health_bounds_each_probe_and_expires_cached_results() -> None:
    client = _configured_client(
        models={"default": {"id": "test-model"}, "reasoning": {"id": "slow-model"}},
        health=HealthCheckSettings(timeout_seconds=0.01, ttl_seconds=0.02),
    )
    probe, retrieve, _ = _probe_client()

    async def retrieve_model(model_id: str) -> None:
        if model_id == "slow-model":
            await asyncio.Event().wait()

    retrieve.side_effect = retrieve_model
    client._probe_client = probe
    async with client:
        assert await client.check_health() == HealthStatus.degraded
        retrieve.side_effect = None
        await asyncio.sleep(0.04)
        assert await client.check_health() == HealthStatus.ok
        assert retrieve.await_count == 4


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
    assert retrieve.await_count == 1
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
