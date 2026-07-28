from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.config import Settings
from riva.core.errors import APIError
from riva.core.security import (
    digest_session_token,
    generate_session_token,
    hash_password,
    normalize_username,
    validate_password,
    verify_password,
)
from riva.models import AuthSession, User


@dataclass(frozen=True)
class AuthResult:
    user: User
    token: str


@dataclass(frozen=True)
class CurrentSession:
    user: User
    token: str
    refreshed: bool = False


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    async def register(self, username: str, password: str) -> AuthResult:
        normalized_username = _normalize_registration_username(username)
        _validate_registration_password(password)
        now = _utc_now()
        user = User(
            username=username,
            normalized_username=normalized_username,
            password_hash=hash_password(password),
            display_name=username,
            created_at=now,
            updated_at=now,
        )
        token, auth_session = self._new_session(user, now)
        self.session.add(user)
        self.session.add(auth_session)

        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise APIError(status.HTTP_409_CONFLICT, "username_taken") from exc

        return AuthResult(user=user, token=token)

    async def login(
        self,
        username: str,
        password: str,
        *,
        current_token: str | None = None,
    ) -> AuthResult:
        try:
            normalized_username = normalize_username(username)
        except ValueError as exc:
            raise _invalid_credentials() from exc

        result = await self.session.execute(
            select(User).where(User.normalized_username == normalized_username)
        )
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise _invalid_credentials()
        if not verify_password(user.password_hash, password):
            raise _invalid_credentials()

        now = _utc_now()
        if current_token:
            await self._revoke_token(current_token, now, commit=False)

        token, auth_session = self._new_session(user, now)
        self.session.add(auth_session)
        await self.session.commit()
        return AuthResult(user=user, token=token)

    async def current_session(self, token: str) -> CurrentSession:
        now = _utc_now()
        auth_session = await self._session_by_token(token)
        if auth_session is None or auth_session.revoked_at is not None:
            raise APIError(
                status.HTTP_401_UNAUTHORIZED,
                "invalid_session",
                clear_session_cookie=True,
            )

        if auth_session.expires_at <= now:
            auth_session.revoked_at = now
            await self.session.commit()
            raise APIError(
                status.HTTP_401_UNAUTHORIZED,
                "session_expired",
                clear_session_cookie=True,
            )

        user = auth_session.user
        if not user.is_active:
            auth_session.revoked_at = now
            await self.session.commit()
            raise APIError(
                status.HTTP_403_FORBIDDEN,
                "account_disabled",
                clear_session_cookie=True,
            )

        if (
            user.password_changed_at is not None
            and auth_session.created_at < user.password_changed_at
        ):
            auth_session.revoked_at = now
            await self.session.commit()
            raise APIError(
                status.HTTP_401_UNAUTHORIZED,
                "session_expired",
                clear_session_cookie=True,
            )

        refreshed = False
        refresh_after = timedelta(seconds=self.settings.session_refresh_interval_seconds)
        if auth_session.last_seen_at + refresh_after <= now:
            auth_session.last_seen_at = now
            auth_session.expires_at = self._expires_at(now)
            refreshed = True
            await self.session.commit()

        return CurrentSession(user=user, token=token, refreshed=refreshed)

    async def logout(self, token: str | None) -> None:
        if token is None:
            return

        now = _utc_now()
        revoked = await self._revoke_token(token, now, commit=True)
        if not revoked:
            await self.session.rollback()

    def _new_session(self, user: User, now: datetime) -> tuple[str, AuthSession]:
        token = generate_session_token()
        return token, AuthSession(
            user=user,
            token_digest=digest_session_token(token, self.settings.session_digest_key),
            created_at=now,
            last_seen_at=now,
            expires_at=self._expires_at(now),
        )

    async def _session_by_token(self, token: str) -> AuthSession | None:
        token_digest = digest_session_token(token, self.settings.session_digest_key)
        result = await self.session.execute(
            select(AuthSession)
            .options(selectinload(AuthSession.user))
            .where(AuthSession.token_digest == token_digest)
        )
        return result.scalar_one_or_none()

    async def _revoke_token(
        self,
        token: str,
        now: datetime,
        *,
        commit: bool,
    ) -> bool:
        auth_session = await self._session_by_token(token)
        if auth_session is None:
            return False
        if auth_session.revoked_at is None:
            auth_session.revoked_at = now
        if commit:
            await self.session.commit()
        return True

    def _expires_at(self, now: datetime) -> datetime:
        return now + timedelta(seconds=self.settings.session_idle_timeout_seconds)


def _normalize_registration_username(username: str) -> str:
    try:
        return normalize_username(username)
    except ValueError as exc:
        raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_username") from exc


def _validate_registration_password(password: str) -> None:
    try:
        validate_password(password)
    except ValueError as exc:
        raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_password") from exc


def _invalid_credentials() -> APIError:
    return APIError(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")


def _utc_now() -> datetime:
    return datetime.now(UTC)
