from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from riva.core.config import LLMSettings
from riva.llm.errors import LLMUnavailableError


class LLMClient:
    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings
        self._chat_model: BaseChatModel | None = None

    def get_chat_model(self) -> BaseChatModel:
        if not self.settings.configured:
            raise LLMUnavailableError("LLM is not configured.")

        model = self.settings.model
        api_key = self.settings.api_key
        base_url = self.settings.base_url
        if model is None or api_key is None or base_url is None:
            raise LLMUnavailableError("LLM configuration is incomplete.")

        if self._chat_model is None:
            self._chat_model = ChatOpenAI(
                model=model,
                api_key=api_key,
                base_url=str(base_url),
                timeout=self.settings.timeout_seconds,
                max_retries=self.settings.max_retries,
            )
        return self._chat_model

    async def close(self) -> None:
        if self._chat_model is None:
            return

        root_client = getattr(self._chat_model, "root_client", None)
        root_async_client = getattr(self._chat_model, "root_async_client", None)
        try:
            if root_client is not None:
                root_client.close()
        finally:
            try:
                if root_async_client is not None:
                    await root_async_client.close()
            finally:
                self._chat_model = None
