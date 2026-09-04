from types import SimpleNamespace

import pytest
from fastapi import Request

from riva.api.csrf import csrf_protect
from riva.api.errors import CsrfFailedError
from riva.core.config import CORSSettings, Settings
from tests.support.settings import make_test_settings


def _request(
    method: str,
    *,
    settings: Settings | None = None,
    headers: dict[str, str] | None = None,
) -> Request:
    request_headers = {"host": "testserver", **(headers or {})}
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": "/api/auth/login",
        "raw_path": b"/api/auth/login",
        "query_string": b"",
        "headers": [
            (name.lower().encode("latin-1"), value.encode("latin-1"))
            for name, value in request_headers.items()
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 443),
        "app": SimpleNamespace(
            state=SimpleNamespace(settings=settings or make_test_settings())
        ),
    }
    return Request(scope)


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
async def test_csrf_allows_safe_methods_without_source(method: str) -> None:
    await csrf_protect(_request(method))


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
async def test_csrf_checks_all_unsafe_methods(method: str) -> None:
    with pytest.raises(CsrfFailedError):
        await csrf_protect(_request(method))


async def test_csrf_allows_same_origin() -> None:
    request = _request("POST", headers={"origin": "https://testserver"})

    await csrf_protect(request)


async def test_csrf_allows_configured_cors_origin() -> None:
    settings = make_test_settings(
        cors=CORSSettings(allowed_origins=["https://client.test"])
    )
    request = _request(
        "POST",
        settings=settings,
        headers={"origin": "https://client.test"},
    )

    await csrf_protect(request)


async def test_csrf_uses_referer_as_fallback() -> None:
    settings = make_test_settings(
        cors=CORSSettings(allowed_origins=["https://client.test"])
    )
    request = _request(
        "POST",
        settings=settings,
        headers={"referer": "https://client.test/page/foo"},
    )

    await csrf_protect(request)


@pytest.mark.parametrize(
    "headers",
    [
        {"origin": "https://evil.test"},
        {"referer": "https://evil.test/page"},
        {"origin": "not-a-url"},
    ],
)
async def test_csrf_rejects_invalid_source(headers: dict[str, str]) -> None:
    with pytest.raises(CsrfFailedError):
        await csrf_protect(_request("POST", headers=headers))


async def test_csrf_does_not_fallback_when_origin_is_present() -> None:
    settings = make_test_settings(
        cors=CORSSettings(allowed_origins=["https://client.test"])
    )
    request = _request(
        "POST",
        settings=settings,
        headers={
            "origin": "https://evil.test",
            "referer": "https://client.test/page",
        },
    )

    with pytest.raises(CsrfFailedError):
        await csrf_protect(request)
