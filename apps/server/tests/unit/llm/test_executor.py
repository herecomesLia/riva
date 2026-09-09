import asyncio
from types import EllipsisType
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.runnables import Runnable
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
