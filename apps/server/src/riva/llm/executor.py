import asyncio
from collections.abc import AsyncGenerator
from contextlib import AsyncContextDecorator, asynccontextmanager
from types import EllipsisType

from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.runnables.config import merge_configs, var_child_runnable_config
from openai import (
    APIConnectionError,
    APIStatusError,
    InternalServerError,
    RateLimitError,
)

from riva.llm.errors import LLMRequestError, LLMUnavailableError


class LLMExecutor:
    def __init__(
        self,
        *,
        execution_timeout_seconds: float | None = None,
        base_config: RunnableConfig | None = None,
    ) -> None:
        self.execution_timeout_seconds = execution_timeout_seconds
        self.base_config = merge_configs(base_config)

    async def invoke[Input, Output](
        self,
        runnable: Runnable[Input, Output],
        input: Input,
        *,
        config: RunnableConfig | None = None,
        execution_timeout_seconds: float | None | EllipsisType = ...,
    ) -> Output:
        async with self.scope(
            config=config, execution_timeout_seconds=execution_timeout_seconds
        ) as merged_config:
            return await runnable.ainvoke(input, config=merged_config)

    def wrap(
        self,
        *,
        config: RunnableConfig | None = None,
        execution_timeout_seconds: float | None | EllipsisType = ...,
    ) -> AsyncContextDecorator:
        """Decorate an async function with the execution scope."""
        return self.scope(
            config=config, execution_timeout_seconds=execution_timeout_seconds
        )

    @asynccontextmanager
    async def scope(
        self,
        *,
        config: RunnableConfig | None = None,
        execution_timeout_seconds: float | None | EllipsisType = ...,
    ) -> AsyncGenerator[RunnableConfig]:
        """Propagate merged config without creating a tracing run.

        Omit timeout to inherit the default; pass None to disable it.
        """
        timeout = (
            self.execution_timeout_seconds
            if execution_timeout_seconds is ...
            else execution_timeout_seconds
        )
        deadline = asyncio.timeout(timeout)
        inherited_config = var_child_runnable_config.get()
        # merge_configs reads the ambient config for each argument. Clear it
        # while merging so inherited callbacks are included only once.
        token = var_child_runnable_config.set(None)
        try:
            merged_config = merge_configs(inherited_config, self.base_config, config)
            var_child_runnable_config.set(merged_config)
            async with deadline:
                yield merged_config
        except (APIConnectionError, RateLimitError, InternalServerError) as exc:
            raise LLMUnavailableError() from exc
        except APIStatusError as exc:
            raise LLMRequestError("LLM provider request failed.") from exc
        except TimeoutError as exc:
            if not deadline.expired():
                raise
            raise LLMUnavailableError() from exc
        finally:
            var_child_runnable_config.reset(token)
