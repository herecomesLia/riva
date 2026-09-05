import pytest

from riva.models.user import User


def make_user(username: str = "TestUser") -> User:
    return User(
        username=username,
        password_hash="test-password-hash",
        display_name="Test User",
    )


def test_username_initializes_normalized_username() -> None:
    user = make_user()

    assert user.username == "TestUser"
    assert user.normalized_username == "testuser"


def test_changing_username_updates_normalized_username() -> None:
    user = make_user()

    user.username = "NewUser"

    assert user.username == "NewUser"
    assert user.normalized_username == "newuser"


def test_normalized_username_is_read_only() -> None:
    user = make_user()

    with pytest.raises(AttributeError):
        user.normalized_username = "manual"

    assert user.normalized_username == "testuser"
