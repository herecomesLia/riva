from riva.schemas.base import ResponseModel


class ErrorIssue(ResponseModel):
    location: list[str | int]
    message: str


class ErrorBody(ResponseModel):
    code: str
    message: str
    issues: list[ErrorIssue] | None = None


class ErrorResponse(ResponseModel):
    error: ErrorBody
    request_id: str
