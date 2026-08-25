from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from riva.api.cookies import delete_session_cookie


class DatabaseUnavailableError(RuntimeError):
    pass


class APIError(RuntimeError):
    def __init__(
        self,
        status_code: int,
        error: str,
        *,
        clear_session_cookie: bool = False,
    ) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.clear_session_cookie = clear_session_cookie


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    response = JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error},
    )
    if exc.clear_session_cookie:
        delete_session_cookie(response, request.app.state.settings)
    return response


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(APIError, api_error_handler)
