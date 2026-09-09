import asyncio
from types import EllipsisType

from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.runnables.config import merge_configs
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
        """Omit timeout to inherit the default; pass None to disable it."""
        timeout = (
            self.execution_timeout_seconds
            if execution_timeout_seconds is ...
            else execution_timeout_seconds
        )
        deadline = asyncio.timeout(timeout)
        try:
            async with deadline:
                return await runnable.ainvoke(
                    input,
                    config=merge_configs(self.base_config, config),
                )
        except (APIConnectionError, RateLimitError, InternalServerError) as exc:
            raise LLMUnavailableError() from exc
        except APIStatusError as exc:
            raise LLMRequestError("LLM provider request failed.") from exc
        except TimeoutError as exc:
            if not deadline.expired():
                raise
            raise LLMUnavailableError() from exc
