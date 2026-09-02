from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.db import Database
from riva.models import User
from riva.models.career_profile import (
    CareerProfile,
    EducationEntry,
    EmploymentType,
    ProjectEntry,
    WorkExperienceEntry,
)
from riva.services.career_profiles import CareerProfileService
from riva.services.errors import (
    ConflictError,
    DomainValidationError,
    NotFoundError,
)
from riva.services.users import UserService


@pytest.fixture
def career_profile_service(db_session: AsyncSession) -> CareerProfileService:
    return CareerProfileService(db_session)


def _education() -> EducationEntry:
    return EducationEntry(
        school="Example University",
        degree="Bachelor of Science",
        major="Computer Science",
        start_date="2018-09",
        end_date="2022-06",
    )


def _work_experience(*skills: str) -> WorkExperienceEntry:
    return WorkExperienceEntry(
        company="Example Company",
        title="Software Engineer",
        employment_type=EmploymentType.FULL_TIME,
        location="Remote",
        responsibilities=["Build reliable software"],
        achievements=["Improved system reliability"],
        skills=list(skills),
        start_date="2022-07",
        end_date=None,
    )


def _project() -> ProjectEntry:
    return ProjectEntry(
        name="Example Project",
        role="Maintainer",
        description=["A useful project"],
        achievements=["Delivered the first release"],
        tech_stack=["Python"],
        url="https://example.test/project",
        start_date="2023-01",
        end_date=None,
    )


async def _reload_user(database: Database, user_id: UUID) -> User | None:
    async with database.sessionmaker() as session:
        return await session.scalar(
            select(User)
            .options(selectinload(User.career_profile))
            .where(User.id == user_id)
        )


async def _reload_profile(database: Database, user_id: UUID) -> CareerProfile | None:
    async with database.sessionmaker() as session:
        return await session.get(CareerProfile, user_id)


async def _new_user(user_service: UserService) -> User:
    result = await user_service.register("TestUser", "ValidPass123!")
    user = await user_service.session.scalar(
        select(User)
        .options(selectinload(User.career_profile))
        .where(User.id == result.user.id)
    )
    assert user is not None
    return user


async def test_create_persists_and_reloads_typed_sections(
    career_profile_service: CareerProfileService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    education = _education()
    work_experience = _work_experience("Python", "FastAPI")
    project = _project()

    await career_profile_service.create(
        user,
        education=[education],
        work_experiences=[work_experience],
        projects=[project],
        skills=["Python", "FastAPI"],
    )

    reloaded_user = await _reload_user(database, user.id)

    assert reloaded_user is not None
    assert reloaded_user.career_profile is not None
    profile = reloaded_user.career_profile
    assert isinstance(profile.education[0], EducationEntry)
    assert isinstance(profile.work_experiences[0], WorkExperienceEntry)
    assert isinstance(profile.projects[0], ProjectEntry)
    assert profile.education[0] == education
    assert profile.work_experiences[0] == work_experience
    assert profile.projects[0] == project
    assert profile.skills == ["Python", "FastAPI"]


async def test_get_raises_when_profile_does_not_exist(
    career_profile_service: CareerProfileService,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)

    with pytest.raises(NotFoundError):
        await career_profile_service.get(user)


async def test_update_raises_when_profile_does_not_exist(
    career_profile_service: CareerProfileService,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)

    with pytest.raises(NotFoundError):
        await career_profile_service.update(user)


async def test_create_rejects_duplicate_profile(
    career_profile_service: CareerProfileService,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    await career_profile_service.create(user)

    with pytest.raises(ConflictError):
        await career_profile_service.create(user)


async def test_update_empty_list_clears_only_that_section(
    career_profile_service: CareerProfileService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    education = [_education()]
    projects = [_project()]
    skills = ["Python"]
    await career_profile_service.create(
        user,
        education=education,
        projects=projects,
        skills=skills,
    )

    await career_profile_service.update(user, projects=[])
    profile = await _reload_profile(database, user.id)

    assert profile is not None
    assert profile.projects == []
    assert profile.education == education
    assert profile.skills == skills


@pytest.mark.parametrize(
    "changes",
    [
        {"work_experiences": [_work_experience("Go")]},
        {"skills": ["Go"]},
        {
            "work_experiences": [_work_experience("Go")],
            "skills": ["Python"],
        },
    ],
)
async def test_update_rejects_skill_mismatch_without_partial_changes(
    career_profile_service: CareerProfileService,
    database: Database,
    user_service: UserService,
    changes: dict[str, object],
) -> None:
    user = await _new_user(user_service)
    education = [_education()]
    projects = [_project()]
    await career_profile_service.create(
        user,
        education=education,
        projects=projects,
        work_experiences=[_work_experience("Python")],
        skills=["Python"],
    )

    with pytest.raises(DomainValidationError):
        await career_profile_service.update(user, **changes)

    profile = await _reload_profile(database, user.id)

    assert profile is not None
    assert profile.education == education
    assert profile.projects == projects
    assert profile.work_experiences == [_work_experience("Python")]
    assert profile.skills == ["Python"]


async def test_update_accepts_consistent_work_experiences_and_skills(
    career_profile_service: CareerProfileService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    await career_profile_service.create(
        user,
        work_experiences=[_work_experience("Python")],
        skills=["Python"],
    )

    await career_profile_service.update(
        user,
        work_experiences=[_work_experience("Python", "Go")],
        skills=["Python", "Go"],
    )
    profile = await _reload_profile(database, user.id)

    assert profile is not None
    assert profile.work_experiences == [_work_experience("Python", "Go")]
    assert profile.skills == ["Python", "Go"]


async def test_create_rejects_skill_mismatch_without_creating_profile(
    career_profile_service: CareerProfileService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)

    with pytest.raises(DomainValidationError):
        await career_profile_service.create(
            user,
            work_experiences=[_work_experience("Python")],
            skills=[],
        )

    profile = await _reload_profile(database, user.id)

    assert profile is None
