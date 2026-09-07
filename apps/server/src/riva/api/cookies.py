from fastapi import Response

from riva.core.config import Settings


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session.cookie_name,
        value=token,
        max_age=settings.session.idle_timeout_seconds,
        httponly=True,
        secure=settings.session.cookie_secure,
        samesite=settings.session.cookie_samesite.value,
        path=settings.session.cookie_path,
    )


def delete_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session.cookie_name,
        path=settings.session.cookie_path,
        secure=settings.session.cookie_secure,
        samesite=settings.session.cookie_samesite.value,
    )
