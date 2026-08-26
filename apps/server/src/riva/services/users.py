import hashlib
import hmac
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.config import Settings
from riva.models import AuthSession, User
from riva.services.errors import (
    AccountDisabledError,
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)
from riva.utils import utc_now

_password_hasher = PasswordHasher()


@dataclass(frozen=True)
class AuthenticationResult:
    user: User
    token: str


@dataclass(frozen=True)
class CurrentSession:
    user: User
    refreshed: bool = False


class UserService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    async def register(self, username: str, password: str) -> AuthenticationResult:
        normalized_username = _normalize_username(username)
        now = utc_now()
        user = User(
            username=username,
            normalized_username=normalized_username,
            password_hash=_hash_password(password),
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
            raise UsernameTakenError() from exc

        return AuthenticationResult(user=user, token=token)

    async def login(
        self,
        username: str,
        password: str,
        *,
        current_token: str | None = None,
    ) -> AuthenticationResult:
        normalized_username = _normalize_username(username)

        result = await self.session.execute(
            select(User).where(User.normalized_username == normalized_username)
        )
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise InvalidCredentialsError()
        if not _verify_password(user.password_hash, password):
            raise InvalidCredentialsError()

        now = utc_now()
        if current_token:
            await self._revoke_token(current_token, now)

        token, auth_session = self._new_session(user, now)
        self.session.add(auth_session)
        await self.session.commit()
        return AuthenticationResult(user=user, token=token)

    async def get_current_session(self, token: str) -> CurrentSession:
        now = utc_now()
        auth_session = await self._session_by_token(token)
        if auth_session is None or auth_session.revoked_at is not None:
            raise InvalidSessionError()

        user = auth_session.user
        if auth_session.expires_at <= now or (
            user.password_changed_at is not None
            and auth_session.created_at < user.password_changed_at
        ):
            auth_session.revoked_at = now
            await self.session.commit()
            raise SessionExpiredError()

        if not user.is_active:
            auth_session.revoked_at = now
            await self.session.commit()
            raise AccountDisabledError()

        refreshed = False
        refresh_after = timedelta(
            seconds=self.settings.session_refresh_interval_seconds
        )
        if auth_session.last_seen_at + refresh_after <= now:
            auth_session.last_seen_at = now
            auth_session.expires_at = self._expires_at(now)
            refreshed = True
            await self.session.commit()

        return CurrentSession(user=user, refreshed=refreshed)

    async def logout(self, token: str | None) -> None:
        if token is None:
            return

        if await self._revoke_token(token, utc_now()):
            await self.session.commit()

    async def update_profile(
        self,
        user: User,
        changes: Mapping[str, str | None],
    ) -> User:
        if not changes:
            return user

        for field in ("display_name", "avatar_url"):
            if field in changes:
                setattr(user, field, changes[field])

        await self.session.commit()
        return user

    def _new_session(self, user: User, now: datetime) -> tuple[str, AuthSession]:
        token = _generate_session_token()
        return token, AuthSession(
            user=user,
            token_digest=_digest_session_token(token, self.settings.session_digest_key),
            created_at=now,
            last_seen_at=now,
            expires_at=self._expires_at(now),
        )

    async def _session_by_token(self, token: str) -> AuthSession | None:
        token_digest = _digest_session_token(token, self.settings.session_digest_key)
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
    ) -> bool:
        auth_session = await self._session_by_token(token)
        if auth_session is None:
            return False
        if auth_session.revoked_at is None:
            auth_session.revoked_at = now
        return True

    def _expires_at(self, now: datetime) -> datetime:
        return now + timedelta(seconds=self.settings.session_idle_timeout_seconds)


def _normalize_username(username: str) -> str:
    return username.lower()


def _hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def _verify_password(password_hash: str, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except InvalidHashError, VerificationError, VerifyMismatchError:
        return False


def _generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def _digest_session_token(token: str, digest_key: str) -> str:
    return hmac.new(
        digest_key.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
