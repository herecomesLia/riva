from pydantic import Field

from riva.errors import ErrorCode
from riva.schemas.base import ResponseModel


class ErrorIssue(ResponseModel):
    location: list[str | int]
    message: str


class ErrorBody(ResponseModel):
    code: ErrorCode
    message: str
    issues: list[ErrorIssue] = Field(default_factory=list)


class ErrorResponse(ResponseModel):
    error: ErrorBody
