from riva.errors import AppError, ErrorCode


class APIRequestError(AppError):
    pass


class AuthRequiredError(APIRequestError):
    code = ErrorCode.AUTH_NOT_AUTHENTICATED
    _default_message = "Authentication is required."


class CsrfFailedError(APIRequestError):
    code = ErrorCode.REQUEST_CSRF_FAILED
    _default_message = "CSRF validation failed."


class APINotImplementedError(APIRequestError):
    code = ErrorCode.REQUEST_NOT_IMPLEMENTED
    _default_message = "This operation is not implemented."
