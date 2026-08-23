import asyncio
import os
from uuid import UUID

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectSkill,
    CareerProfileWorkSkill,
    User,
)
from riva.schemas.profile import CareerProfilePutRequest
from riva.services.errors import DomainConflictError, ServiceError
from riva.services.profile.profile import CareerProfileService

pytestmark = pytest.mark.integration

USER_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER_USER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
EDUCATION_ID = "11111111-1111-4111-8111-111111111111"
WORK_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_ID = "33333333-3333-4333-8333-333333333333"
SKILL_ID = "44444444-4444-4444-8444-444444444444"


def payload_data(*, version: int | None, summary: str) -> dict[str, object]:
    return {
        "version": version,
        "summary": summary,
        "education": [
            {
                "id": EDUCATION_ID,
                "school": "Tongji University",
                "degree": "Master",
                "major": "Software Engineering",
                "startDate": "2018-09",
                "endDate": "2021-06",
                "isCurrent": False,
            }
        ],
        "workExperiences": [
            {
                "id": WORK_ID,
                "company": "Riva",
                "title": "Backend Engineer",
                "employmentType": "fullTime",
                "location": "Shanghai",
                "startDate": "2021-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": ["Build APIs"],
                "achievements": [],
                "skillIds": [SKILL_ID],
            }
        ],
        "projectExperiences": [
            {
                "id": PROJECT_ID,
                "name": "Career Profile",
                "role": "Developer",
                "startDate": "2026-07",
                "endDate": None,
                "responsibilities": ["Designed the API"],
                "achievements": [],
                "skillIds": [SKILL_ID],
                "projectUrl": None,
            }
        ],
        "skills": [{"id": SKILL_ID, "name": "Python"}],
    }


def user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


class FailingCareerProfileService(CareerProfileService):
    @staticmethod
    def _sync_education(profile, requested) -> None:
        raise RuntimeError("forced synchronization failure")


def test_profile_constraints_concurrency_isolation_and_rollback() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add(user(USER_ID, "profile-user"))
                    session.add(user(OTHER_USER_ID, "other-user"))
                    await session.commit()

                async with database.sessionmaker() as session:
                    created = await CareerProfileService(session).replace_profile(
                        user(USER_ID, "profile-user"),
                        CareerProfilePutRequest.model_validate(
                            payload_data(version=None, summary="Initial")
                        ),
                    )
                    assert created.version == 1

                async with database.sessionmaker() as session:
                    session.add(
                        CareerProfileEducation(
                            id=UUID("12111111-1111-4111-8111-111111111111"),
                            career_profile_id=created.profile_id,
                            position=0,
                            school="Duplicate position",
                            start_date="2020-01",
                            end_date="2021-01",
                            is_current=False,
                            source="userAdded",
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                async with database.sessionmaker() as session:
                    loaded = await CareerProfileService(session).get_profile(
                        user(USER_ID, "profile-user")
                    )
                    assert loaded is not None
                    assert [item.position for item in loaded.education] == [0]
                    assert loaded.work_experiences[0].skill_ids == [UUID(SKILL_ID)]
                    assert loaded.project_experiences[0].skill_ids == [UUID(SKILL_ID)]

                async with database.sessionmaker() as session:
                    isolated = await CareerProfileService(session).get_profile(
                        user(OTHER_USER_ID, "other-user")
                    )
                    assert isolated is None

                async def concurrent_update(summary: str):
                    async with database.sessionmaker() as session:
                        return await CareerProfileService(session).replace_profile(
                            user(USER_ID, "profile-user"),
                            CareerProfilePutRequest.model_validate(
                                payload_data(version=1, summary=summary)
                            ),
                        )

                results = await asyncio.gather(
                    concurrent_update("First"),
                    concurrent_update("Second"),
                    return_exceptions=True,
                )
                successes = [
                    result for result in results if isinstance(result, CareerProfile)
                ]
                conflicts = [
                    result for result in results if isinstance(result, ServiceError)
                ]
                assert len(successes) == 1
                assert len(conflicts) == 1
                assert isinstance(conflicts[0], DomainConflictError)
                assert successes[0].version == 2

                winning_summary = successes[0].summary
                async with database.sessionmaker() as session:
                    failing_payload = payload_data(
                        version=2,
                        summary="Must roll back",
                    )
                    with pytest.raises(
                        RuntimeError,
                        match="forced synchronization failure",
                    ):
                        await FailingCareerProfileService(session).replace_profile(
                            user(USER_ID, "profile-user"),
                            CareerProfilePutRequest.model_validate(failing_payload),
                        )

                async with database.sessionmaker() as session:
                    persisted = await CareerProfileService(session).get_profile(
                        user(USER_ID, "profile-user")
                    )
                    assert persisted is not None
                    assert persisted.version == 2
                    assert persisted.summary == winning_summary

                    education_count = await session.scalar(
                        select(func.count()).select_from(CareerProfileEducation)
                    )
                    work_link_count = await session.scalar(
                        select(func.count()).select_from(CareerProfileWorkSkill)
                    )
                    project_link_count = await session.scalar(
                        select(func.count()).select_from(CareerProfileProjectSkill)
                    )
                    assert education_count == 1
                    assert work_link_count == 1
                    assert project_link_count == 1

                    await session.execute(delete(User).where(User.id == USER_ID))
                    await session.commit()

                async with database.sessionmaker() as session:
                    profile_count = await session.scalar(
                        select(func.count()).select_from(CareerProfile)
                    )
                    education_count = await session.scalar(
                        select(func.count()).select_from(CareerProfileEducation)
                    )
                    assert profile_count == 0
                    assert education_count == 0
            finally:
                await database.drop_tables()

    asyncio.run(run())
