import pytest
from fastapi import status

from riva.api.errors import service_error_to_api_error
from riva.services.errors import (
    AccountDisabledError,
    AuthenticationError,
    DataTooLargeError,
    DomainConflictError,
    ExternalDependencyError,
    InvalidDataError,
    InvalidSessionError,
    PermissionDeniedError,
    ResourceMissingError,
    SessionExpiredError,
)


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (AuthenticationError("authentication_failed"), status.HTTP_401_UNAUTHORIZED),
        (PermissionDeniedError("forbidden"), status.HTTP_403_FORBIDDEN),
        (ResourceMissingError("missing"), status.HTTP_404_NOT_FOUND),
        (DomainConflictError("conflict"), status.HTTP_409_CONFLICT),
        (InvalidDataError("invalid"), status.HTTP_422_UNPROCESSABLE_CONTENT),
        (DataTooLargeError("too_large"), status.HTTP_413_CONTENT_TOO_LARGE),
        (ExternalDependencyError("unavailable"), status.HTTP_503_SERVICE_UNAVAILABLE),
    ],
)
def test_service_error_mapping_is_owned_by_api(error, expected_status) -> None:
    mapped = service_error_to_api_error(error)

    assert mapped.status_code == expected_status
    assert mapped.error == error.error


@pytest.mark.parametrize(
    "error",
    [
        InvalidSessionError("invalid_session"),
        SessionExpiredError("session_expired"),
        AccountDisabledError("account_disabled"),
    ],
)
def test_session_errors_request_cookie_cleanup(error) -> None:
    assert service_error_to_api_error(error).clear_session_cookie is True
