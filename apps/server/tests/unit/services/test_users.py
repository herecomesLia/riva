import asyncio
from uuid import uuid4

from riva.models import User
from riva.services.users import UsersService


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


def test_update_profile_persists_only_supplied_fields() -> None:
    session = FakeSession()
    service = UsersService(session)  # type: ignore[arg-type]
    user = create_user()

    result = asyncio.run(
        service.update_profile(user, {"display_name": "Lia Chen"})
    )

    assert result is user
    assert user.display_name == "Lia Chen"
    assert user.avatar_url == "https://example.com/old.png"
    assert session.commit_count == 1
    assert session.refreshed == [user]


def test_update_profile_can_clear_avatar() -> None:
    session = FakeSession()
    service = UsersService(session)  # type: ignore[arg-type]
    user = create_user()

    asyncio.run(service.update_profile(user, {"avatar_url": None}))

    assert user.avatar_url is None


def test_empty_update_does_not_write() -> None:
    session = FakeSession()
    service = UsersService(session)  # type: ignore[arg-type]
    user = create_user()

    asyncio.run(service.update_profile(user, {}))

    assert session.commit_count == 0
    assert session.refreshed == []
