from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.db import Database
from riva.models import User
from riva.models.target_role import (
    HardSkills,
    JobDescription,
    JobRequirements,
    RecruitmentTrack,
    TargetRole,
)
from riva.services.errors import ConflictError, NotFoundError
from riva.services.target_roles import TargetRoleService
from riva.services.users import UserService


@pytest.fixture
def target_role_service(db_session: AsyncSession) -> TargetRoleService:
    return TargetRoleService(db_session)


async def _new_user(user_service: UserService, username: str = "TestUser") -> User:
    return (await user_service.register(username, "ValidPass123!")).user


async def _reload_role(database: Database, role_id: UUID) -> TargetRole | None:
    async with database.sessionmaker() as session:
        return await session.scalar(
            select(TargetRole)
            .options(selectinload(TargetRole.jd))
            .where(TargetRole.id == role_id)
        )


async def _reload_user(database: Database, user_id: UUID) -> User:
    async with database.sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


async def test_create_always_persists_empty_jd(
    target_role_service: TargetRoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)

    role = await target_role_service.create(user, title="Backend Engineer")
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.jd.responsibilities == []
    assert reloaded.jd.requirements == JobRequirements()
    assert reloaded.jd.hard_skills == HardSkills()
    assert reloaded.jd.soft_skills == []
    assert reloaded.jd.preferred_qualifications == []
    assert reloaded.jd.business_domains == []


async def test_complete_role_and_jd_round_trip_through_postgresql(
    target_role_service: TargetRoleService,
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

    role = await target_role_service.create(
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
    target_role_service: TargetRoleService,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    other_user = await _new_user(user_service, "OtherUser")
    older = await target_role_service.create(user, title="Older")
    tied_first = await target_role_service.create(user, title="Tied first")
    tied_second = await target_role_service.create(user, title="Tied second")
    await target_role_service.create(other_user, title="Other user's role")
    older.created_at = datetime(2025, 1, 1, tzinfo=UTC)
    tied_first.created_at = datetime(2025, 1, 2, tzinfo=UTC)
    tied_second.created_at = tied_first.created_at
    await target_role_service.session.commit()

    roles = await target_role_service.list(user)

    tied = sorted((tied_first, tied_second), key=lambda role: role.id, reverse=True)
    assert [role.id for role in roles] == [tied[0].id, tied[1].id, older.id]


async def test_get_hides_roles_owned_by_another_user(
    target_role_service: TargetRoleService,
    user_service: UserService,
) -> None:
    owner = await _new_user(user_service)
    other_user = await _new_user(user_service, "OtherUser")
    role = await target_role_service.create(owner, title="Private role")

    with pytest.raises(NotFoundError):
        await target_role_service.get(other_user, role.id)


async def test_update_clears_nullable_field_without_changing_others(
    target_role_service: TargetRoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    role = await target_role_service.create(
        user,
        title="Backend Engineer",
        company="Example Corp",
        recruitment_track=RecruitmentTrack.EXPERIENCED,
        location="Remote",
    )

    await target_role_service.update(user, role.id, company=None)
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.company is None
    assert reloaded.title == "Backend Engineer"
    assert reloaded.recruitment_track is RecruitmentTrack.EXPERIENCED
    assert reloaded.location == "Remote"


async def test_update_jd_preserves_untouched_modules_and_refreshes_parent_timestamp(
    target_role_service: TargetRoleService,
    database: Database,
    user_service: UserService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await _new_user(user_service)
    role = await target_role_service.create(
        user,
        title="Backend Engineer",
        jd=JobDescription(
            responsibilities=["Old responsibility"],
            soft_skills=["Communication"],
            business_domains=["SaaS"],
        ),
    )
    role.updated_at = datetime(2025, 1, 1, tzinfo=UTC)
    await target_role_service.session.commit()
    next_updated_at = datetime(2025, 1, 2, tzinfo=UTC)
    monkeypatch.setattr("riva.services.target_roles.utc_now", lambda: next_updated_at)

    await target_role_service.update_jd(
        user,
        role.id,
        responsibilities=["New responsibility"],
        soft_skills=[],
    )
    reloaded = await _reload_role(database, role.id)

    assert reloaded is not None
    assert reloaded.jd.responsibilities == ["New responsibility"]
    assert reloaded.jd.soft_skills == []
    assert reloaded.jd.business_domains == ["SaaS"]
    assert reloaded.updated_at == next_updated_at


async def test_active_archive_restore_state_machine_has_no_partial_writes(
    target_role_service: TargetRoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    active_role = await target_role_service.create(user, title="Active")
    other_role = await target_role_service.create(user, title="Other")

    await target_role_service.set_active(user, active_role.id)
    assert (
        await _reload_user(database, user.id)
    ).active_target_role_id == active_role.id

    await target_role_service.archive(user, active_role.id)
    reloaded_active = await _reload_role(database, active_role.id)
    assert reloaded_active is not None
    assert reloaded_active.is_archived is True
    assert (await _reload_user(database, user.id)).active_target_role_id is None

    await target_role_service.archive(user, other_role.id)
    with pytest.raises(ConflictError):
        await target_role_service.set_active(user, other_role.id)

    await target_role_service.restore(user, other_role.id)
    await target_role_service.set_active(user, other_role.id)
    assert (
        await _reload_user(database, user.id)
    ).active_target_role_id == other_role.id


async def test_delete_preserves_or_clears_active_role_and_removes_jd(
    target_role_service: TargetRoleService,
    database: Database,
    user_service: UserService,
) -> None:
    user = await _new_user(user_service)
    ordinary_role = await target_role_service.create(user, title="Ordinary")
    active_role = await target_role_service.create(user, title="Active")
    await target_role_service.set_active(user, active_role.id)

    await target_role_service.delete(user, ordinary_role.id)
    assert (
        await _reload_user(database, user.id)
    ).active_target_role_id == active_role.id
    assert await _reload_role(database, ordinary_role.id) is None
    async with database.sessionmaker() as session:
        assert await session.get(JobDescription, ordinary_role.id) is None

    await target_role_service.delete(user, active_role.id)
    assert (await _reload_user(database, user.id)).active_target_role_id is None
    assert await _reload_role(database, active_role.id) is None
    async with database.sessionmaker() as session:
        assert await session.get(JobDescription, active_role.id) is None
