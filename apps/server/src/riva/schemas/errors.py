from pydantic import Field

from riva.errors import ErrorCode
from riva.schemas.base import ResponseModel


class ErrorIssue(ResponseModel):
    location: list[str | int] = Field(
        description="Path to the invalid value, including request source such as body, field names and array indices."
    )
    message: str


class ErrorBody(ResponseModel):
    code: ErrorCode = Field(description="Stable machine-readable error code.")
    message: str = Field(
        description="Human-readable explanation; not a stable identifier for programmatic handling."
    )
    issues: list[ErrorIssue] = Field(
        default_factory=list,
        description="Field-level error details; empty when no field-level details are available.",
    )


class ErrorResponse(ResponseModel):
    error: ErrorBody
