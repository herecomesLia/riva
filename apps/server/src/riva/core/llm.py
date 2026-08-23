from fastapi import Request, status

from riva.core.errors import APIError
from riva.integrations import (
    LLMProvider,
    LLMProviderConfigurationError,
    build_llm_provider,
)


def get_llm_provider(request: Request) -> LLMProvider | None:
    settings = request.app.state.settings
    if not settings.llm_provider or not settings.llm_model:
        return None
    try:
        return build_llm_provider(settings)
    except LLMProviderConfigurationError:
        raise APIError(status.HTTP_503_SERVICE_UNAVAILABLE, "llm_unavailable") from None


__all__ = ["get_llm_provider"]
