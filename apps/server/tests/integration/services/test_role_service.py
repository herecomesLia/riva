from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.db import Database
from riva.models import User
from riva.models.role import (
    HardSkills,
    JobDescription,
    JobRequirements,
    RecruitmentTrack,
    Role,
)
from riva.services.errors import ConflictError, NotFoundError
from riva.services.role import RoleService
from riva.services.user import UserService


@pytest.fixture
def role_service(db_session: AsyncSession) -> RoleService:
    return RoleService(db_session)


async def _new_user(user_service: UserService, username: str = "TestUser") -> User:
    return (await user_service.register(username, "ValidPass123!")).user


async def _reload_role(database: Database, role_id: UUID) -> Role | None:
    async with database.sessionmaker() as session:
        return await session.scalar(
            select(Role).options(selectinload(Role.jd)).where(Role.id == role_id)
        )


async def _reload_user(database: Database, user_id: UUID) -> User:
    async with database.sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


async def test_create_always_persists_empty_jd(
    role_service: RoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)

    role = await role_service.create(user, title="Backend Engineer")
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.jd.responsibilities == []
    assert reloaded.jd.requirements == JobRequirements()
    assert reloaded.jd.hard_skills == HardSkills()
    assert reloaded.jd.soft_skills == []
    assert reloaded.jd.preferred_qualifications == []
    assert reloaded.jd.business_domains == []


async def test_complete_role_and_jd_round_trip_through_postgresql(
    role_service: RoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    jd = JobDescription(
        responsibilities=["Build APIs"],
        requirements=JobRequirements(
            education=["Bachelor's degree"],
            experience=["Three years"],
        ),
        hard_skills=HardSkills(
            programming_languages=["Python"],
            frameworks_and_libraries=["FastAPI"],
        ),
        soft_skills=["Communication"],
        preferred_qualifications=["Cloud experience"],
        business_domains=["SaaS"],
    )

    role = await role_service.create(
        user,
        title="Backend Engineer",
        company="Example Corp",
        recruitment_track=RecruitmentTrack.EXPERIENCED,
        location="Remote",
        jd=jd,
    )
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.title == "Backend Engineer"
    assert reloaded.company == "Example Corp"
    assert reloaded.recruitment_track is RecruitmentTrack.EXPERIENCED
    assert reloaded.location == "Remote"
    assert reloaded.jd.responsibilities == ["Build APIs"]
    assert reloaded.jd.requirements == jd.requirements
    assert reloaded.jd.hard_skills == jd.hard_skills
    assert reloaded.jd.soft_skills == ["Communication"]
    assert reloaded.jd.preferred_qualifications == ["Cloud experience"]
    assert reloaded.jd.business_domains == ["SaaS"]


async def test_list_is_owned_and_ordered_by_created_at_then_id_descending(
    role_service: RoleService,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    other_user = await _new_user(user_service, "OtherUser")
    older = await role_service.create(user, title="Older")
    tied_first = await role_service.create(user, title="Tied first")
    tied_second = await role_service.create(user, title="Tied second")
    await role_service.create(other_user, title="Other user's role")
    older.created_at = datetime(2025, 1, 1, tzinfo=UTC)
    tied_first.created_at = datetime(2025, 1, 2, tzinfo=UTC)
    tied_second.created_at = tied_first.created_at
    await role_service.session.commit()

    roles = await role_service.list(user)

    tied = sorted((tied_first, tied_second), key=lambda role: role.id, reverse=True)
    assert [role.id for role in roles] == [tied[0].id, tied[1].id, older.id]


async def test_get_hides_roles_owned_by_another_user(
    role_service: RoleService,
    user_service: UserService,
) -> None:
    owner = await _new_user(user_service)
    other_user = await _new_user(user_service, "OtherUser")
    role = await role_service.create(owner, title="Private role")

    with pytest.raises(NotFoundError):
        await role_service.get(other_user, role.id)


async def test_update_clears_nullable_field_without_changing_others(
    role_service: RoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    role = await role_service.create(
        user,
        title="Backend Engineer",
        company="Example Corp",
        recruitment_track=RecruitmentTrack.EXPERIENCED,
        location="Remote",
    )

    await role_service.update(user, role.id, company=None)
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.company is None
    assert reloaded.title == "Backend Engineer"
    assert reloaded.recruitment_track is RecruitmentTrack.EXPERIENCED
    assert reloaded.location == "Remote"


async def test_active_archive_restore_state_machine_has_no_partial_writes(
    role_service: RoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    active_role = await role_service.create(user, title="Active")
    other_role = await role_service.create(user, title="Other")

    await role_service.set_active(user, active_role.id)
    assert (await _reload_user(database, user.id)).active_role_id == active_role.id

    await role_service.archive(user, active_role.id)
    reloaded_active = await _reload_role(database, active_role.id)
    assert reloaded_active is not None
    assert reloaded_active.is_archived is True
    assert (await _reload_user(database, user.id)).active_role_id is None

    await role_service.archive(user, other_role.id)
    with pytest.raises(ConflictError):
        await role_service.set_active(user, other_role.id)

    await role_service.restore(user, other_role.id)
    await role_service.set_active(user, other_role.id)
    assert (await _reload_user(database, user.id)).active_role_id == other_role.id


async def test_delete_preserves_or_clears_active_role_and_removes_jd(
    role_service: RoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    ordinary_role = await role_service.create(user, title="Ordinary")
    active_role = await role_service.create(user, title="Active")
    await role_service.set_active(user, active_role.id)

    await role_service.delete(user, ordinary_role.id)
    assert (await _reload_user(database, user.id)).active_role_id == active_role.id
    assert await _reload_role(database, ordinary_role.id) is None
    async with database.sessionmaker() as session:
        assert await session.get(JobDescription, ordinary_role.id) is None

    await role_service.delete(user, active_role.id)
    assert (await _reload_user(database, user.id)).active_role_id is None
    assert await _reload_role(database, active_role.id) is None
    async with database.sessionmaker() as session:
        assert await session.get(JobDescription, active_role.id) is None
