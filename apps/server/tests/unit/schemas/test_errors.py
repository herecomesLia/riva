from riva.schemas.errors import ErrorBody, ErrorIssue, ErrorResponse


def test_error_response_serializes_request_id_and_excludes_missing_issues() -> None:
    response = ErrorResponse(
        error=ErrorBody(
            code="auth.invalid_credentials",
            message="Invalid username or password.",
        ),
        request_id="request-id-1",
    )

    assert response.model_dump(
        mode="json",
        by_alias=True,
        exclude_none=True,
    ) == {
        "error": {
            "code": "auth.invalid_credentials",
            "message": "Invalid username or password.",
        },
        "requestId": "request-id-1",
    }


def test_error_response_serializes_nested_issues() -> None:
    response = ErrorResponse(
        error=ErrorBody(
            code="request.validation_failed",
            message="Request validation failed.",
            issues=[
                ErrorIssue(
                    location=["body", "displayName"],
                    code="required",
                    message="Field is required.",
                )
            ],
        ),
        request_id="request-id-2",
    )

    assert response.model_dump(mode="json", by_alias=True) == {
        "error": {
            "code": "request.validation_failed",
            "message": "Request validation failed.",
            "issues": [
                {
                    "location": ["body", "displayName"],
                    "code": "required",
                    "message": "Field is required.",
                }
            ],
        },
        "requestId": "request-id-2",
    }
