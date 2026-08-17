from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
)


class EvalModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


def _non_empty(value: str, field_name: str) -> str:
    if not value.strip():
        raise ValueError(f"{field_name} must not be empty")
    return value


class EvalAssertionModel(EvalModel):
    path: StrictStr = Field(min_length=1)

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError("path must be a simple JSON Pointer starting with '/'")
        if value != value.strip():
            raise ValueError("path must not contain leading or trailing whitespace")
        for token in value.split("/")[1:]:
            index = 0
            while index < len(token):
                if token[index] != "~":
                    index += 1
                    continue
                if index + 1 >= len(token) or token[index + 1] not in {"0", "1"}:
                    raise ValueError("path contains an invalid JSON Pointer escape")
                index += 2
        return value


class ExactAssertion(EvalAssertionModel):
    operator: Literal["exact"]
    expected: Any


class ContainsAssertion(EvalAssertionModel):
    operator: Literal["contains"]
    expected: Any


class ContainsAllAssertion(EvalAssertionModel):
    operator: Literal["containsAll"]
    expected: list[Any]


class NotContainsAssertion(EvalAssertionModel):
    operator: Literal["notContains"]
    forbidden: list[Any]


class ItemCountAssertion(EvalAssertionModel):
    operator: Literal["itemCount"]
    min: StrictInt | None = Field(default=None, ge=0)
    max: StrictInt | None = Field(default=None, ge=0)

    def model_post_init(self, __context: Any) -> None:
        if self.min is None and self.max is None:
            raise ValueError("itemCount requires min or max")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("itemCount min must not exceed max")


class NumberRangeAssertion(EvalAssertionModel):
    operator: Literal["numberRange"]
    min: StrictInt | StrictFloat | None = Field(default=None)
    max: StrictInt | StrictFloat | None = Field(default=None)

    def model_post_init(self, __context: Any) -> None:
        if self.min is None and self.max is None:
            raise ValueError("numberRange requires min or max")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("numberRange min must not exceed max")


AgentEvalAssertion = Annotated[
    ExactAssertion
    | ContainsAssertion
    | ContainsAllAssertion
    | NotContainsAssertion
    | ItemCountAssertion
    | NumberRangeAssertion,
    Field(discriminator="operator"),
]


class AgentEvalCase(EvalModel):
    id: StrictStr = Field(min_length=1)
    agent_id: StrictStr = Field(alias="agentId", min_length=1)
    prompt_version: StrictStr = Field(alias="promptVersion", min_length=1)
    input: dict[str, Any]
    assertions: list[AgentEvalAssertion]
    tags: list[StrictStr] = Field(default_factory=list)

    def model_post_init(self, __context: Any) -> None:
        _non_empty(self.id, "id")
        _non_empty(self.agent_id, "agentId")
        _non_empty(self.prompt_version, "promptVersion")


class AgentEvalCaseResult(EvalModel):
    case_id: StrictStr = Field(alias="caseId", min_length=1)
    agent_id: StrictStr = Field(alias="agentId", min_length=1)
    prompt_version: StrictStr = Field(alias="promptVersion", min_length=1)
    passed: bool
    failed_assertions: list[StrictStr] = Field(
        alias="failedAssertions",
        default_factory=list,
    )
    input_tokens: StrictInt = Field(alias="inputTokens", default=0, ge=0)
    output_tokens: StrictInt = Field(alias="outputTokens", default=0, ge=0)


class AgentEvalRunResult(EvalModel):
    agent_id: StrictStr = Field(alias="agentId", min_length=1)
    total: StrictInt = Field(ge=0)
    passed: StrictInt = Field(ge=0)
    failed: StrictInt = Field(ge=0)
    pass_rate: float = Field(alias="passRate", ge=0, le=1)
    input_tokens: StrictInt = Field(alias="inputTokens", ge=0)
    output_tokens: StrictInt = Field(alias="outputTokens", ge=0)
    cases: list[AgentEvalCaseResult]


__all__ = [
    "AgentEvalAssertion",
    "AgentEvalCase",
    "AgentEvalCaseResult",
    "AgentEvalRunResult",
    "ContainsAllAssertion",
    "ContainsAssertion",
    "ExactAssertion",
    "ItemCountAssertion",
    "NotContainsAssertion",
    "NumberRangeAssertion",
]
