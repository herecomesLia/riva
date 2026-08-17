from datetime import datetime
from typing import Annotated

from pydantic import (
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

from riva.schemas.base import APIModel


class _StrictAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


NonNegativeInt = Annotated[StrictInt, Field(ge=0)]
Rate = Annotated[StrictInt | StrictFloat, Field(ge=0, le=1)] | None
Distribution = dict[StrictStr, NonNegativeInt]


class AgentRunStatusCounts(_StrictAPIModel):
    queued: NonNegativeInt
    running: NonNegativeInt
    succeeded: NonNegativeInt
    failed: NonNegativeInt


class AgentLatencySummary(_StrictAPIModel):
    count: NonNegativeInt
    average_ms: NonNegativeInt
    p50_ms: NonNegativeInt
    p95_ms: NonNegativeInt


class AgentTokenSummary(_StrictAPIModel):
    succeeded_run_count: NonNegativeInt
    input_tokens: NonNegativeInt
    output_tokens: NonNegativeInt
    total_tokens: NonNegativeInt
    average_total_tokens: NonNegativeInt


class AgentErrorCount(_StrictAPIModel):
    error_code: StrictStr = Field(min_length=1)
    count: NonNegativeInt


class AgentRuntimeSummary(_StrictAPIModel):
    agent_id: StrictStr = Field(min_length=1)
    total_runs: NonNegativeInt
    status_counts: AgentRunStatusCounts
    terminal_runs: NonNegativeInt
    terminal_success_rate: Rate
    started_runs: NonNegativeInt
    retried_runs: NonNegativeInt
    retry_rate: Rate
    pending_retry_runs: NonNegativeInt
    exhausted_failure_runs: NonNegativeInt
    first_queue_latency: AgentLatencySummary
    terminal_latency: AgentLatencySummary
    processing_span: AgentLatencySummary
    tokens: AgentTokenSummary
    terminal_errors: list[AgentErrorCount]
    prompt_versions: Distribution
    models: Distribution
    providers: Distribution


class AgentObservabilityReport(_StrictAPIModel):
    window_from: datetime
    window_to: datetime
    total_runs: NonNegativeInt
    status_counts: AgentRunStatusCounts
    terminal_runs: NonNegativeInt
    terminal_success_rate: Rate
    started_runs: NonNegativeInt
    retried_runs: NonNegativeInt
    retry_rate: Rate
    pending_retry_runs: NonNegativeInt
    exhausted_failure_runs: NonNegativeInt
    first_queue_latency: AgentLatencySummary
    terminal_latency: AgentLatencySummary
    processing_span: AgentLatencySummary
    tokens: AgentTokenSummary
    terminal_errors: list[AgentErrorCount]
    by_agent: list[AgentRuntimeSummary]

    @field_validator("window_from", "window_to")
    @classmethod
    def validate_window_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("window timestamps must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_window_order(self) -> "AgentObservabilityReport":
        if self.window_from >= self.window_to:
            raise ValueError("window_from must be before window_to")
        return self


__all__ = [
    "AgentErrorCount",
    "AgentLatencySummary",
    "AgentObservabilityReport",
    "AgentRunStatusCounts",
    "AgentRuntimeSummary",
    "AgentTokenSummary",
]
