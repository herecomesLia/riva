"""Integration coverage for the real UserService and PostgreSQL."""

import hashlib
import hmac
from datetime import timedelta

import pytest
from argon2 import PasswordHasher
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.config import Settings
from riva.models import AuthSession, User
from riva.services.errors import (
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)
from riva.services.users import UserService
from tests.support.clock import Clock

USERNAME = "TestUser"
PASSWORD = "ValidPass123!"


def _token_digest(token: str, settings: Settings) -> str:
    return hmac.new(
        settings.session.digest_key.encode(),
        token.encode(),
        hashlib.sha256,
    ).hexdigest()


async def _auth_session(
    session: AsyncSession,
    token: str,
    settings: Settings,
) -> AuthSession:
    result = await session.execute(
        select(AuthSession).where(
            AuthSession.token_digest == _token_digest(token, settings)
        )
    )
    return result.scalar_one()


class TestRegister:
    async def test_register_persists_user_and_digested_session_token(
        self,
        user_service: UserService,
        db_session: AsyncSession,
        settings: Settings,
        clock: Clock,
    ) -> None:
        result = await user_service.register(USERNAME, PASSWORD)

        user = await db_session.scalar(
            select(User).where(User.normalized_username == USERNAME.lower())
        )
        assert user is not None
        assert user.id == result.user.id
        assert user.username == USERNAME
        assert user.normalized_username == USERNAME.lower()
        assert user.display_name == USERNAME
        assert user.password_hash != PASSWORD
        assert PasswordHasher().verify(user.password_hash, PASSWORD)
        assert user.created_at == clock.now

        auth_session = await _auth_session(db_session, result.token, settings)
        assert auth_session.user_id == user.id
        assert auth_session.token_digest != result.token
        assert auth_session.token_digest == _token_digest(result.token, settings)
        assert auth_session.created_at == clock.now

    async def test_duplicate_username_rolls_back_and_session_remains_usable(
        self,
        user_service: UserService,
        db_session: AsyncSession,
    ) -> None:
        await user_service.register("TestUser", PASSWORD)

        with pytest.raises(UsernameTakenError):
            await user_service.register("testuser", PASSWORD)

        other = await user_service.register("OtherUser", PASSWORD)
        assert other.user.username == "OtherUser"
        assert await db_session.scalar(select(func.count()).select_from(User)) == 2


class TestLogin:
    async def test_login_is_case_insensitive_and_persists_a_new_session(
        self,
        user_service: UserService,
        db_session: AsyncSession,
        settings: Settings,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)

        logged_in = await user_service.login("tEsTuSeR", PASSWORD)

        assert logged_in.user.id == registered.user.id
        assert logged_in.token != registered.token
        assert (
            await db_session.scalar(select(func.count()).select_from(AuthSession)) == 2
        )
        login_session = await _auth_session(db_session, logged_in.token, settings)
        assert login_session.user_id == registered.user.id

    @pytest.mark.parametrize(
        ("username", "password"),
        [
            ("MissingUser", PASSWORD),
            (USERNAME, "WrongPass123!"),
        ],
    )
    async def test_login_hides_invalid_credential_reason(
        self,
        user_service: UserService,
        username: str,
        password: str,
    ) -> None:
        await user_service.register(USERNAME, PASSWORD)

        with pytest.raises(InvalidCredentialsError):
            await user_service.login(username, password)

    async def test_login_hides_invalid_password_hash(
        self,
        user_service: UserService,
        db_session: AsyncSession,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)
        registered.user.password_hash = "not-an-argon2-hash"
        await db_session.commit()

        with pytest.raises(InvalidCredentialsError):
            await user_service.login(USERNAME, PASSWORD)

    async def test_login_replaces_current_session(
        self,
        user_service: UserService,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)

        logged_in = await user_service.login(
            USERNAME,
            PASSWORD,
            current_token=registered.token,
        )

        with pytest.raises(InvalidSessionError):
            await user_service.get_current_session(registered.token)
        assert (await user_service.get_current_session(logged_in.token)).user.id == (
            registered.user.id
        )


class TestCurrentSession:
    async def test_new_session_is_valid_without_refresh(
        self,
        user_service: UserService,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)

        current = await user_service.get_current_session(registered.token)

        assert current.user.id == registered.user.id
        assert current.refreshed is False

    async def test_unknown_and_revoked_sessions_are_invalid(
        self,
        user_service: UserService,
    ) -> None:
        with pytest.raises(InvalidSessionError):
            await user_service.get_current_session("unknown-token")

        registered = await user_service.register(USERNAME, PASSWORD)
        await user_service.logout(registered.token)

        with pytest.raises(InvalidSessionError):
            await user_service.get_current_session(registered.token)

    async def test_session_expires_at_exact_idle_timeout(
        self,
        user_service: UserService,
        db_session: AsyncSession,
        settings: Settings,
        clock: Clock,
    ) -> None:
        settings.session.idle_timeout_seconds = 60
        registered = await user_service.register(USERNAME, PASSWORD)
        clock.advance(seconds=60)

        with pytest.raises(SessionExpiredError):
            await user_service.get_current_session(registered.token)

        auth_session = await _auth_session(db_session, registered.token, settings)
        assert auth_session.revoked_at == clock.now

    async def test_password_change_expires_and_revokes_session(
        self,
        user_service: UserService,
        db_session: AsyncSession,
        settings: Settings,
        clock: Clock,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)
        clock.advance(seconds=1)
        registered.user.password_changed_at = clock.now
        await db_session.commit()

        with pytest.raises(SessionExpiredError):
            await user_service.get_current_session(registered.token)

        auth_session = await _auth_session(db_session, registered.token, settings)
        assert auth_session.revoked_at == clock.now

    async def test_session_refreshes_at_exact_interval(
        self,
        user_service: UserService,
        db_session: AsyncSession,
        settings: Settings,
        clock: Clock,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)

        clock.advance(seconds=299)
        before_boundary = await user_service.get_current_session(registered.token)
        assert before_boundary.refreshed is False

        clock.advance(seconds=1)
        at_boundary = await user_service.get_current_session(registered.token)
        assert at_boundary.refreshed is True

        auth_session = await _auth_session(db_session, registered.token, settings)
        assert auth_session.last_seen_at == clock.now
        assert auth_session.expires_at == clock.now + timedelta(
            seconds=settings.session.idle_timeout_seconds
        )


class TestLogout:
    async def test_logout_is_idempotent(self, user_service: UserService) -> None:
        assert await user_service.logout(None) is None
        assert await user_service.logout("unknown-token") is None

        registered = await user_service.register(USERNAME, PASSWORD)
        assert await user_service.logout(registered.token) == registered.user.id
        assert await user_service.logout(registered.token) is None

        with pytest.raises(InvalidSessionError):
            await user_service.get_current_session(registered.token)


class TestUpdateUser:
    async def test_update_persists_changed_display_name(
        self,
        user_service: UserService,
        db_session: AsyncSession,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)

        await user_service.update(
            registered.user,
            display_name="New Name",
        )

        await db_session.refresh(registered.user)
        assert registered.user.display_name == "New Name"

    async def test_update_with_same_display_name_is_noop(
        self,
        user_service: UserService,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)
        original = (registered.user.display_name, registered.user.updated_at)

        updated = await user_service.update(
            registered.user,
            display_name=registered.user.display_name,
        )

        assert updated is registered.user
        assert (updated.display_name, updated.updated_at) == original

    async def test_update_without_display_name_is_noop(
        self,
        user_service: UserService,
    ) -> None:
        registered = await user_service.register(USERNAME, PASSWORD)
        original = (registered.user.display_name, registered.user.updated_at)

        updated = await user_service.update(registered.user)

        assert updated is registered.user
        assert (updated.display_name, updated.updated_at) == original
