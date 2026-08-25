from riva.schemas.base import APIModel


class ErrorIssue(APIModel):
    location: list[str | int]
    code: str
    message: str


class ErrorBody(APIModel):
    code: str
    message: str
    issues: list[ErrorIssue] | None = None


class ErrorResponse(APIModel):
    error: ErrorBody
    request_id: str
