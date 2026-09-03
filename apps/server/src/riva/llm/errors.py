from riva.errors import DependencyUnavailableError, ErrorCode


class LLMUnavailableError(DependencyUnavailableError):
    dependency = "llm"
    code = ErrorCode.DEPENDENCY_LLM_UNAVAILABLE
    _default_message = "LLM service is temporarily unavailable."
