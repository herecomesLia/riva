from riva.api.errors.openapi import error_responses
from riva.schemas import ErrorResponse


def test_error_responses_describes_single_status() -> None:
    assert error_responses(401) == {
        401: {
            "model": ErrorResponse,
            "description": "Unauthorized",
        }
    }


def test_error_responses_describes_multiple_independent_statuses() -> None:
    responses = error_responses(401, 403, 422)

    assert responses == {
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        422: {"model": ErrorResponse, "description": "Unprocessable Content"},
    }
    assert responses[401] is not responses[403]
    assert responses[403] is not responses[422]
