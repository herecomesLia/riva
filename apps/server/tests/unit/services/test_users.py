import asyncio
from uuid import uuid4

from riva.models import User
from riva.services.users import (
    UserService,
    _digest_session_token,
    _generate_session_token,
    _hash_password,
    _verify_password,
)


class FakeSession:
    def __init__(self) -> None:
        self.commit_count = 0
        self.refreshed: list[User] = []

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, user: User) -> None:
        self.refreshed.append(user)


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


def test_update_profile_persists_only_supplied_fields(test_settings) -> None:
    session = FakeSession()
    service = UserService(session, test_settings)  # type: ignore[arg-type]
    user = create_user()

    result = asyncio.run(service.update_profile(user, {"display_name": "Lia Chen"}))

    assert result is user
    assert user.display_name == "Lia Chen"
    assert user.avatar_url == "https://example.com/old.png"
    assert session.commit_count == 1
    assert session.refreshed == [user]


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
    assert session.refreshed == []
