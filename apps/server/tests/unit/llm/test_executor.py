import asyncio
from types import EllipsisType
from typing import cast
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.callbacks.manager import AsyncCallbackManager
from langchain_core.runnables import Runnable, RunnableConfig, RunnableLambda
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    RateLimitError,
)

from riva.llm import LLMExecutor
from riva.llm.errors import LLMRequestError, LLMUnavailableError


@pytest.mark.parametrize("entrypoint", ["invoke", "wrap", "scope"])
async def test_execution_entrypoints_propagate_config(entrypoint: str) -> None:
    async def read_config(input: str, config: RunnableConfig) -> RunnableConfig:
        return config

    runnable = RunnableLambda(read_config)
    executor = LLMExecutor(base_config={"metadata": {"capability": "job_description"}})
    config: RunnableConfig = {"metadata": {"request": "request-1"}}

    if entrypoint == "invoke":
        received = await executor.invoke(runnable, "input", config=config)
    elif entrypoint == "wrap":

        @executor.wrap(config=config)
        async def generate() -> RunnableConfig:
            return await runnable.ainvoke("input")

        received = await generate()
    else:
        async with executor.scope(config=config):
            received = await runnable.ainvoke("input")

    assert received["metadata"] == {
        "capability": "job_description",
        "request": "request-1",
    }


async def test_nested_scope_deduplicates_callbacks_and_restores_config() -> None:
    async def read_config(input: str, config: RunnableConfig) -> RunnableConfig:
        return config

    runnable = RunnableLambda(read_config)
    executor = LLMExecutor()
    callback = BaseCallbackHandler()
    before = await runnable.ainvoke("input")

    async with executor.scope(
        config={"callbacks": [callback], "metadata": {"scope": "outer"}}
    ):
        with pytest.raises(ValueError, match="generation failed"):
            async with executor.scope(config={"metadata": {"scope": "inner"}}):
                inner = await runnable.ainvoke("input")
                assert inner["metadata"]["scope"] == "inner"
                assert (
                    cast(AsyncCallbackManager, inner["callbacks"]).handlers.count(
                        callback
                    )
                    == 1
                )
                raise ValueError("generation failed")

        restored = await runnable.ainvoke("input")
        assert restored["metadata"]["scope"] == "outer"
        assert (
            cast(AsyncCallbackManager, restored["callbacks"]).handlers.count(callback)
            == 1
        )

    after = await runnable.ainvoke("input")
    assert after["metadata"] == before["metadata"]
    assert callback not in cast(AsyncCallbackManager, after["callbacks"]).handlers


@pytest.mark.parametrize(
    ("error_class", "status_code", "expected"),
    [
        (APIConnectionError, None, LLMUnavailableError),
        (APITimeoutError, None, LLMUnavailableError),
        (RateLimitError, 429, LLMUnavailableError),
        (InternalServerError, 500, LLMUnavailableError),
        (AuthenticationError, 401, LLMRequestError),
        (BadRequestError, 400, LLMRequestError),
    ],
)
async def test_provider_failure_normalization(
    error_class: type[APIConnectionError | APIStatusError],
    status_code: int | None,
    expected: type[Exception],
) -> None:
    request = httpx.Request("POST", "https://llm.test/v1/chat/completions")
    if issubclass(error_class, APIConnectionError):
        failure = error_class(request=request)
    else:
        assert status_code is not None
        failure = error_class(
            "private provider detail",
            response=httpx.Response(status_code, request=request),
            body={"error": "private provider detail"},
        )
    runnable = AsyncMock(spec=Runnable)
    runnable.ainvoke.side_effect = failure

    with pytest.raises(expected) as raised:
        await LLMExecutor().invoke(runnable, "input")

    assert raised.value.__cause__ is failure
    assert "private provider detail" not in str(raised.value)
    runnable.ainvoke.assert_awaited_once()


@pytest.mark.parametrize(
    "failure",
    [
        ValueError("parser failure"),
        TimeoutError("inner timeout"),
        asyncio.CancelledError(),
    ],
)
async def test_non_provider_failures_propagate_unchanged(
    failure: BaseException,
) -> None:
    runnable = AsyncMock(spec=Runnable)
    runnable.ainvoke.side_effect = failure

    with pytest.raises(type(failure)) as raised:
        await LLMExecutor(execution_timeout_seconds=30).invoke(runnable, "input")

    assert raised.value is failure


@pytest.mark.parametrize(
    ("default_timeout", "override", "expires"),
    [(0, ..., True), (None, 0, True), (0, None, False), (0, 30, False)],
)
async def test_execution_timeout_inheritance_and_override(
    default_timeout: float | None,
    override: float | None | EllipsisType,
    expires: bool,
) -> None:
    async def invoke(input: str, **kwargs: object) -> str:
        # Yield once so an immediate deadline can cancel the invocation.
        await asyncio.sleep(0)
        return input

    runnable = AsyncMock(spec=Runnable)
    runnable.ainvoke.side_effect = invoke
    executor = LLMExecutor(execution_timeout_seconds=default_timeout)

    if expires:
        with pytest.raises(LLMUnavailableError) as raised:
            await executor.invoke(runnable, "input", execution_timeout_seconds=override)
        assert isinstance(raised.value.__cause__, TimeoutError)
    else:
        assert (
            await executor.invoke(runnable, "input", execution_timeout_seconds=override)
            == "input"
        )
        # A per-call override must not change subsequent calls' default deadline.
        with pytest.raises(LLMUnavailableError):
            await executor.invoke(runnable, "input")
