from riva.models.user import User


def make_user(username: str = "TestUser") -> User:
    return User(
        username=username,
        password_hash="test-password-hash",
        display_name="Test User",
    )


def test_changing_username_updates_normalized_username() -> None:
    user = make_user()

    user.username = "NewUser"

    assert user.username == "NewUser"
    assert user.normalized_username == "newuser"
