from http.cookies import Morsel, SimpleCookie

from fastapi import Response

from riva.api.cookies import delete_session_cookie, set_session_cookie
from riva.core.config import SameSitePolicy, SessionSettings
from tests.support.settings import make_test_settings


def _cookie(response: Response, name: str) -> Morsel:
    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    return cookies[name]


def test_set_session_cookie_uses_secure_defaults() -> None:
    settings = make_test_settings()
    response = Response()

    set_session_cookie(response, "session-token", settings)

    cookie = _cookie(response, settings.session.cookie_name)
    assert cookie.value == "session-token"
    assert cookie["max-age"] == "604800"
    assert cookie["httponly"] is True
    assert cookie["secure"] is True
    assert cookie["samesite"] == "lax"
    assert cookie["path"] == "/"


def test_set_session_cookie_uses_custom_settings() -> None:
    settings = make_test_settings(
        session=SessionSettings(
            digest_key="test-digest-key",
            cookie_name="custom_session",
            cookie_secure=False,
            cookie_samesite=SameSitePolicy.STRICT,
            cookie_path="/api",
            idle_timeout_seconds=60,
        )
    )
    response = Response()

    set_session_cookie(response, "session-token", settings)

    cookie = _cookie(response, "custom_session")
    assert cookie.value == "session-token"
    assert cookie["max-age"] == "60"
    assert cookie["httponly"] is True
    assert cookie["secure"] == ""
    assert cookie["samesite"] == "strict"
    assert cookie["path"] == "/api"


def test_delete_session_cookie_uses_matching_settings() -> None:
    settings = make_test_settings(
        session=SessionSettings(
            digest_key="test-digest-key",
            cookie_name="custom_session",
            cookie_samesite=SameSitePolicy.STRICT,
            cookie_path="/api",
        )
    )
    response = Response()

    delete_session_cookie(response, settings)

    cookie = _cookie(response, "custom_session")
    assert cookie.value == ""
    assert cookie["max-age"] == "0"
    assert cookie["expires"]
    assert cookie["secure"] is True
    assert cookie["samesite"] == "strict"
    assert cookie["path"] == "/api"
