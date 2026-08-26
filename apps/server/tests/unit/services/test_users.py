import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from riva.models import AuthSession, User
from riva.services.errors import (
    AccountDisabledError,
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)
from riva.services.users import (
    UserService,
    _digest_session_token,
    _generate_session_token,
    _hash_password,
    _verify_password,
)
from riva.utils import utc_now


class FakeSession:
    def __init__(self) -> None:
        self.commit_count = 0

    async def commit(self) -> None:
        self.commit_count += 1


class ServiceSession:
    def __init__(
        self,
        *,
        execute_result=None,
        commit_error: Exception | None = None,
    ) -> None:
        self.execute_result = execute_result
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0
        self.added: list[object] = []

    def add(self, value: object) -> None:
        self.added.append(value)

    async def execute(self, _statement):
        return self.execute_result

    async def commit(self) -> None:
        self.commit_count += 1
        if self.commit_error is not None:
            raise self.commit_error

    async def rollback(self) -> None:
        self.rollback_count += 1


class ScalarResult:
    def __init__(self, value) -> None:
        self.value = value

    def scalar_one_or_none(self):
        return self.value


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
        avatar_url="https://example.com/old.png",
    )


def test_password_hash_verifies_without_storing_plaintext() -> None:
    password = "Aa1!Bb2@"
    password_hash = _hash_password(password)

    assert password_hash != password
    assert _verify_password(password_hash, password) is True
    assert _verify_password(password_hash, "wrong password") is False


def test_password_hash_does_not_apply_registration_rules() -> None:
    password_hash = _hash_password("short")

    assert _verify_password(password_hash, "short") is True


def test_password_verification_rejects_invalid_hash() -> None:
    assert _verify_password("not-a-password-hash", "password") is False


def test_session_token_digest_is_stable_and_not_plaintext() -> None:
    token = _generate_session_token()
    digest = _digest_session_token(token, "test-session-digest-key")

    assert len(token) >= 32
    assert len(digest) == 64
    assert digest != token
    assert digest == _digest_session_token(token, "test-session-digest-key")


def test_register_duplicate_username_raises_username_taken_error(test_settings) -> None:
    session = ServiceSession(
        commit_error=IntegrityError("insert", {}, RuntimeError("duplicate"))
    )
    service = UserService(session, test_settings)  # type: ignore[arg-type]

    with pytest.raises(UsernameTakenError) as exc_info:
        asyncio.run(service.register("lia", "correct-password"))

    assert isinstance(exc_info.value.__cause__, IntegrityError)
    assert session.rollback_count == 1


def test_login_invalid_credentials_raise_invalid_credentials_error(
    test_settings,
) -> None:
    session = ServiceSession(execute_result=ScalarResult(None))
    service = UserService(session, test_settings)  # type: ignore[arg-type]

    with pytest.raises(InvalidCredentialsError):
        asyncio.run(service.login("missing-user", "wrong-password"))


@pytest.mark.parametrize("revoked", [False, True])
def test_missing_or_revoked_session_raises_invalid_session_error(
    test_settings,
    revoked: bool,
) -> None:
    now = utc_now()
    auth_session = AuthSession(revoked_at=now) if revoked else None
    session = ServiceSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    service._session_by_token = AsyncMock(return_value=auth_session)  # type: ignore[method-assign]

    with pytest.raises(InvalidSessionError):
        asyncio.run(service.get_current_session("invalid-token"))


@pytest.mark.parametrize("password_changed", [False, True])
def test_expired_or_invalidated_session_raises_session_expired_error(
    test_settings,
    password_changed: bool,
) -> None:
    now = utc_now()
    user = create_user()
    user.password_changed_at = now - timedelta(minutes=1) if password_changed else None
    auth_session = AuthSession(
        user=user,
        created_at=now - timedelta(minutes=2) if password_changed else now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=1)
        if password_changed
        else now - timedelta(minutes=1),
    )
    session = ServiceSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    service._session_by_token = AsyncMock(return_value=auth_session)  # type: ignore[method-assign]

    with pytest.raises(SessionExpiredError):
        asyncio.run(service.get_current_session("expired-token"))

    assert session.commit_count == 1


def test_disabled_account_raises_account_disabled_error(test_settings) -> None:
    now = utc_now()
    user = create_user()
    user.is_active = False
    auth_session = AuthSession(
        user=user,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=1),
    )
    session = ServiceSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    service._session_by_token = AsyncMock(return_value=auth_session)  # type: ignore[method-assign]

    with pytest.raises(AccountDisabledError):
        asyncio.run(service.get_current_session("disabled-token"))

    assert session.commit_count == 1


def test_update_profile_persists_only_supplied_fields(test_settings) -> None:
    session = FakeSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    user = create_user()

    result = asyncio.run(service.update_profile(user, {"display_name": "Lia Chen"}))

    assert result is user
    assert user.display_name == "Lia Chen"
    assert user.avatar_url == "https://example.com/old.png"
    assert session.commit_count == 1


def test_update_profile_can_clear_avatar(test_settings) -> None:
    session = FakeSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    user = create_user()

    asyncio.run(service.update_profile(user, {"avatar_url": None}))

    assert user.avatar_url is None


def test_empty_update_does_not_write(test_settings) -> None:
    session = FakeSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    user = create_user()

    asyncio.run(service.update_profile(user, {}))

    assert session.commit_count == 0
