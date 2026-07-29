import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from riva.core.errors import APIError
from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    User,
)
from riva.schemas.profile import CareerProfilePutRequest
from riva.services.profile import CareerProfileService

EDUCATION_ID = UUID("11111111-1111-4111-8111-111111111111")
SECOND_EDUCATION_ID = UUID("12111111-1111-4111-8111-111111111111")
WORK_ID = UUID("22222222-2222-4222-8222-222222222222")
PROJECT_ID = UUID("33333333-3333-4333-8333-333333333333")
SKILL_ID = UUID("44444444-4444-4444-8444-444444444444")
SECOND_SKILL_ID = UUID("45444444-4444-4444-8444-444444444444")


class FakeResult:
    def __init__(self, profile: CareerProfile | None = None) -> None:
        self.profile = profile

    def scalar_one_or_none(self) -> CareerProfile | None:
        return self.profile


class FakeSession:
    def __init__(
        self,
        profile: CareerProfile | None = None,
        *,
        commit_error: Exception | None = None,
    ) -> None:
        self.profile = profile
        self.commit_error = commit_error
        self.added: list[CareerProfile] = []
        self.commit_count = 0
        self.rollback_count = 0
        self.execute_calls: list[Any] = []

    async def execute(self, statement: Any) -> FakeResult:
        self.execute_calls.append(statement)
        if "FROM users" in str(statement):
            return FakeResult()
        parameters = statement.compile().params.values()
        if self.profile is not None and self.profile.user_id in parameters:
            return FakeResult(self.profile)
        return FakeResult()

    def add(self, profile: CareerProfile) -> None:
        self.profile = profile
        self.added.append(profile)

    async def commit(self) -> None:
        if self.commit_error is not None:
            raise self.commit_error
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1

    async def refresh(
        self,
        profile: CareerProfile,
        attribute_names: list[str],
    ) -> None:
        if "updated_at" in attribute_names and profile.updated_at is None:
            profile.updated_at = datetime(2026, 7, 29, tzinfo=UTC)


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def payload(
    *,
    version: int | None,
    include_second_items: bool = False,
) -> CareerProfilePutRequest:
    education = [
        {
            "id": str(EDUCATION_ID),
            "school": "Tongji University",
            "degree": "Master",
            "major": "Software Engineering",
            "startDate": "2018-09",
            "endDate": "2021-06",
            "isCurrent": False,
        }
    ]
    skills = [{"id": str(SKILL_ID), "name": "Python"}]
    if include_second_items:
        education.append(
            {
                "id": str(SECOND_EDUCATION_ID),
                "school": "Fudan University",
                "degree": "Bachelor",
                "major": "Computer Science",
                "startDate": "2014-09",
                "endDate": "2018-06",
                "isCurrent": False,
            }
        )
        skills.append({"id": str(SECOND_SKILL_ID), "name": "SQL"})

    return CareerProfilePutRequest.model_validate(
        {
            "version": version,
            "summary": "Backend engineer",
            "education": education,
            "workExperiences": [
                {
                    "id": str(WORK_ID),
                    "company": "Riva",
                    "title": "Backend Engineer",
                    "employmentType": "fullTime",
                    "location": "Shanghai",
                    "startDate": "2021-07",
                    "endDate": None,
                    "isCurrent": True,
                    "responsibilities": ["Build APIs"],
                    "achievements": [],
                    "skillIds": [str(SKILL_ID)],
                }
            ],
            "projectExperiences": [
                {
                    "id": str(PROJECT_ID),
                    "name": "Career Profile",
                    "role": "Developer",
                    "startDate": "2026-07",
                    "endDate": None,
                    "responsibilities": ["Designed the API"],
                    "achievements": [],
                    "skillIds": [str(SKILL_ID)],
                    "projectUrl": None,
                }
            ],
            "skills": skills,
        }
    )


def test_get_profile_returns_only_current_users_profile() -> None:
    user = create_user()
    profile = CareerProfile(profile_id=uuid4(), user_id=user.id, version=1)
    session = FakeSession(profile)
    service = CareerProfileService(session)  # type: ignore[arg-type]

    assert asyncio.run(service.get_profile(user)) is profile
    assert asyncio.run(service.get_profile(create_user())) is None


def test_replace_profile_creates_complete_ordered_aggregate() -> None:
    user = create_user()
    session = FakeSession()
    service = CareerProfileService(session)  # type: ignore[arg-type]

    profile = asyncio.run(
        service.replace_profile(
            user,
            payload(version=None, include_second_items=True),
        )
    )

    assert profile.version == 1
    assert [item.id for item in profile.education] == [
        EDUCATION_ID,
        SECOND_EDUCATION_ID,
    ]
    assert [item.position for item in profile.education] == [0, 1]
    assert [skill.id for skill in profile.skills] == [SKILL_ID, SECOND_SKILL_ID]
    assert profile.work_experiences[0].skill_ids == [SKILL_ID]
    assert profile.project_experiences[0].skill_ids == [SKILL_ID]
    assert all(
        item.source == "userAdded"
        for item in (
            *profile.education,
            *profile.work_experiences,
            *profile.project_experiences,
            *profile.skills,
        )
    )
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert "FOR UPDATE" in str(session.execute_calls[0])


@pytest.mark.parametrize(
    "stored_version,requested_version",
    [
        (None, 1),
        (1, None),
        (2, 1),
    ],
)
def test_replace_profile_rejects_version_conflicts(
    stored_version: int | None,
    requested_version: int | None,
) -> None:
    user = create_user()
    profile = (
        None
        if stored_version is None
        else CareerProfile(
            profile_id=uuid4(),
            user_id=user.id,
            version=stored_version,
        )
    )
    session = FakeSession(profile)
    service = CareerProfileService(session)  # type: ignore[arg-type]

    with pytest.raises(APIError) as exc_info:
        asyncio.run(
            service.replace_profile(
                user,
                payload(version=requested_version),
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.error == "profile_version_conflict"
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_two_concurrent_stale_versions_cannot_both_succeed() -> None:
    user = create_user()
    profile = CareerProfile(profile_id=uuid4(), user_id=user.id, version=1)
    session = FakeSession(profile)
    service = CareerProfileService(session)  # type: ignore[arg-type]

    async def update_twice():
        return await asyncio.gather(
            service.replace_profile(user, payload(version=1)),
            service.replace_profile(user, payload(version=1)),
            return_exceptions=True,
        )

    results = asyncio.run(update_twice())

    assert sum(isinstance(result, CareerProfile) for result in results) == 1
    conflicts = [result for result in results if isinstance(result, APIError)]
    assert len(conflicts) == 1
    assert conflicts[0].error == "profile_version_conflict"
    assert profile.version == 2
    assert session.commit_count == 1


def test_replace_profile_updates_deletes_adds_and_reorders_children() -> None:
    user = create_user()
    session = FakeSession()
    service = CareerProfileService(session)  # type: ignore[arg-type]
    profile = asyncio.run(
        service.replace_profile(
            user,
            payload(version=None, include_second_items=True),
        )
    )
    profile.education[0].source = "resumeExtracted"
    profile.work_experiences[0].source = "resumeExtracted"
    profile.project_experiences[0].source = "userEdited"
    profile.skills[0].source = "resumeExtracted"

    update_data = payload(version=1, include_second_items=True).model_dump(
        mode="json",
        by_alias=True,
    )
    update_data["education"] = list(reversed(update_data["education"]))
    update_data["education"][1]["school"] = "Updated University"
    update_data["skills"] = list(reversed(update_data["skills"]))
    update_data["skills"][1]["name"] = "Python 3"
    update_data["workExperiences"][0]["responsibilities"] = ["Build APIs", "Review"]
    update_data["projectExperiences"] = []

    updated = asyncio.run(
        service.replace_profile(
            user,
            CareerProfilePutRequest.model_validate(update_data),
        )
    )

    assert updated.version == 2
    assert [item.id for item in updated.education] == [
        SECOND_EDUCATION_ID,
        EDUCATION_ID,
    ]
    assert [item.position for item in updated.education] == [0, 1]
    assert updated.education[1].source == "userEdited"
    assert updated.work_experiences[0].source == "userEdited"
    assert updated.skills[1].source == "userEdited"
    assert updated.project_experiences == []


def test_existing_user_added_and_user_edited_sources_are_preserved() -> None:
    user = create_user()
    session = FakeSession()
    service = CareerProfileService(session)  # type: ignore[arg-type]
    profile = asyncio.run(service.replace_profile(user, payload(version=None)))
    profile.education[0].source = "userAdded"
    profile.work_experiences[0].source = "userEdited"
    update_data = payload(version=1).model_dump(mode="json", by_alias=True)
    update_data["education"][0]["school"] = "Changed"
    update_data["workExperiences"][0]["title"] = "Changed"

    updated = asyncio.run(
        service.replace_profile(
            user,
            CareerProfilePutRequest.model_validate(update_data),
        )
    )

    assert updated.education[0].source == "userAdded"
    assert updated.work_experiences[0].source == "userEdited"


def test_replace_profile_rolls_back_any_transaction_failure() -> None:
    user = create_user()
    error = RuntimeError("commit failed")
    session = FakeSession(commit_error=error)
    service = CareerProfileService(session)  # type: ignore[arg-type]

    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(service.replace_profile(user, payload(version=None)))

    assert session.commit_count == 0
    assert session.rollback_count == 1
