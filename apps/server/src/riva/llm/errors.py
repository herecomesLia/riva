from riva.errors import DependencyUnavailableError, ErrorCode


class LLMError(RuntimeError):
    pass


class LLMNotConfiguredError(LLMError):
    pass


class LLMUnavailableError(DependencyUnavailableError):
    dependency = "llm"
    code = ErrorCode.DEPENDENCY_LLM_UNAVAILABLE
    _default_message = "LLM service is temporarily unavailable."
