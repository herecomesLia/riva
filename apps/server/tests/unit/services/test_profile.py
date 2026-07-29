import asyncio
from typing import Any
from uuid import uuid4

import pytest

from riva.core.errors import APIError
from riva.models import Profile, User
from riva.services.profile import ProfileService


class FakeResult:
    def __init__(self, profile: Profile | None) -> None:
        self.profile = profile

    def scalar_one_or_none(self) -> Profile | None:
        return self.profile


class FakeSession:
    def __init__(self, profile: Profile | None = None) -> None:
        self.profile = profile
        self.added: list[Profile] = []
        self.commit_count = 0
        self.refreshed: list[Profile] = []

    async def execute(self, statement: Any) -> FakeResult:
        return FakeResult(self.profile)

    def add(self, profile: Profile) -> None:
        self.added.append(profile)

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, profile: Profile) -> None:
        self.refreshed.append(profile)


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def profile_content(summary: str) -> dict[str, Any]:
    return {
        "summary": summary,
        "education": [],
        "work_experiences": [],
        "project_experiences": [],
        "skills": [],
    }


def test_get_profile_returns_profile_owned_by_user() -> None:
    user = create_user()
    profile = Profile(user_id=user.id, **profile_content("Existing"))
    service = ProfileService(FakeSession(profile))  # type: ignore[arg-type]

    result = asyncio.run(service.get_profile(user))

    assert result is profile


def test_get_profile_raises_not_found() -> None:
    service = ProfileService(FakeSession())  # type: ignore[arg-type]

    with pytest.raises(APIError) as exc_info:
        asyncio.run(service.get_profile(create_user()))

    assert exc_info.value.status_code == 404
    assert exc_info.value.error == "profile_not_found"


def test_replace_profile_creates_missing_profile() -> None:
    user = create_user()
    session = FakeSession()
    service = ProfileService(session)  # type: ignore[arg-type]

    result = asyncio.run(
        service.replace_profile(user, profile_content("Created"))
    )

    assert result.user_id == user.id
    assert result.summary == "Created"
    assert session.added == [result]
    assert session.commit_count == 1
    assert session.refreshed == [result]


def test_replace_profile_updates_existing_profile_and_version() -> None:
    user = create_user()
    profile = Profile(
        user_id=user.id,
        version=3,
        **profile_content("Before"),
    )
    session = FakeSession(profile)
    service = ProfileService(session)  # type: ignore[arg-type]

    result = asyncio.run(
        service.replace_profile(user, profile_content("After"))
    )

    assert result is profile
    assert result.summary == "After"
    assert result.version == 4
    assert session.added == []
    assert session.commit_count == 1
