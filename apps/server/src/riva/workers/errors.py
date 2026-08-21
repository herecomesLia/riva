import re

_ERROR_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class AgentExecutionError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        if not _ERROR_CODE_PATTERN.fullmatch(code):
            raise ValueError("code must be a safe stable identifier")
        self.code = code
        self.retryable = retryable
        super().__init__("Agent execution failed.")


class AgentHandlerNotFoundError(AgentExecutionError):
    def __init__(self) -> None:
        super().__init__("agent_handler_not_found", retryable=False)


class DuplicateAgentHandlerError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("An agent handler with this agent_id is already registered.")
