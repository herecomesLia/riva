from urllib.parse import urlsplit

from fastapi import Depends, Request

from riva.api.deps import SettingsDep
from riva.api.errors import CsrfFailedError
from riva.core.config import Settings

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def csrf_protect(request: Request, settings: SettingsDep) -> None:
    if request.method.upper() not in UNSAFE_METHODS:
        return

    origin = request.headers.get("origin")
    if origin is not None:
        if _is_allowed_source(origin, request, settings):
            return
        raise CsrfFailedError()

    referer = request.headers.get("referer")
    if referer is not None and _is_allowed_source(referer, request, settings):
        return

    raise CsrfFailedError()


csrf_guard = Depends(csrf_protect)


def _is_allowed_source(source: str, request: Request, settings: Settings) -> bool:
    source_origin = _origin_from_url(source)
    if source_origin is None:
        return False

    return source_origin == _request_origin(request) or source_origin in {
        _origin_from_url(origin) for origin in settings.cors.allowed_origins
    }


def _request_origin(request: Request) -> str:
    host = request.headers.get("host") or request.url.netloc
    return f"{request.url.scheme}://{host}"


def _origin_from_url(value: str) -> str | None:
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"
