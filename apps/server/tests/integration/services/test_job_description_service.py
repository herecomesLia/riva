from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import Database
from riva.models.role import JobDescription, Role
from riva.services.errors import ConflictError, NotFoundError
from riva.services.job_descriptions import JobDescriptionService
from riva.services.roles import RoleService
from riva.services.users import UserService


async def test_update_jd_preserves_untouched_modules_and_refreshes_parent_timestamp(
    db_session: AsyncSession,
    database: Database,
    user_service: UserService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = (await user_service.register("TestUser", "ValidPass123!")).user
    role_service = RoleService(db_session)
    role = await role_service.create(
        user,
        title="Backend Engineer",
        jd=JobDescription(
            responsibilities=["Old responsibility"],
            soft_skills=["Communication"],
            business_domains=["SaaS"],
        ),
    )
    role.updated_at = datetime(2025, 1, 1, tzinfo=UTC)
    await role_service.session.commit()
    next_updated_at = datetime(2025, 1, 2, tzinfo=UTC)
    monkeypatch.setattr(
        "riva.services.job_descriptions.utc_now", lambda: next_updated_at
    )

    await JobDescriptionService(role_service.session).update(
        role,
        responsibilities=["New responsibility"],
        soft_skills=[],
    )
    async with database.sessionmaker() as session:
        reloaded = await session.get(Role, role.id)

    assert reloaded is not None
    assert reloaded.jd.responsibilities == ["New responsibility"]
    assert reloaded.jd.soft_skills == []
    assert reloaded.jd.business_domains == ["SaaS"]
    assert reloaded.updated_at == next_updated_at
    assert reloaded.jd.updated_at == next_updated_at


async def test_active_extraction_blocks_manual_update_without_partial_writes(
    extraction_database: Database, extraction_role: UUID
) -> None:
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        service = JobDescriptionService(session)
        await service.extract_text(role, text="Build APIs")
        with pytest.raises(ConflictError):
            await service.update(role, responsibilities=["Manual"], soft_skills=[])
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        assert role.jd.responsibilities == ["Original"]
        assert role.jd.soft_skills == ["Teamwork"]


async def test_deleted_jd_is_not_found_after_role_was_loaded(
    extraction_database: Database, extraction_role: UUID
) -> None:
    async with (
        extraction_database.sessionmaker() as request,
        extraction_database.sessionmaker() as deleting,
    ):
        role = await request.get(Role, extraction_role)
        deleted = await deleting.get(Role, extraction_role)
        await deleting.delete(deleted)
        await deleting.commit()
        with pytest.raises(NotFoundError):
            await JobDescriptionService(request).update(
                role, responsibilities=["Manual"]
            )


@pytest.mark.parametrize("changes", [{}, {"responsibilities": ["Original"]}])
async def test_unchanged_jd_and_role_metadata_preserve_jd_version(
    extraction_database,
    extraction_role,
    changes,
):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        previous = role.jd.updated_at
        previous_role_updated_at = role.updated_at
        await JobDescriptionService(session).update(role, **changes)
        await session.refresh(role)
        assert role.updated_at == previous_role_updated_at
        from riva.models import User

        user = await session.get(User, role.user_id)
        await RoleService(session).update(user, role.id, title="New title")
        await session.refresh(role.jd)
        assert role.jd.updated_at == previous


@pytest.mark.parametrize("status", ["todo", "doing", "aborting"])
async def test_matching_rejects_active_extraction_without_changing_matching(
    extraction_database,
    extraction_role,
    status,
):
    from sqlalchemy import text

    from riva.models import User
    from riva.models.career_profile import CareerProfile
    from riva.services.errors import ConflictError
    from riva.tasks import TaskErrorCode

    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        user = await session.get(User, role.user_id)
        session.add(CareerProfile(user_id=user.id))
        role.matching.error_code = TaskErrorCode.INVALID_OUTPUT
        await JobDescriptionService(session).extract_text(role, text="JD")
        previous_version = role.jd.updated_at
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = :status WHERE id = :id"),
            {"status": status, "id": role.jd.extraction_job_id},
        )
        await session.commit()
        with pytest.raises(ConflictError):
            await RoleService(session).start_matching_analysis(user, role.id)
        await session.rollback()
        role = await session.get(Role, extraction_role)
        assert role.matching.job_id is None
        assert role.matching.error_code is TaskErrorCode.INVALID_OUTPUT
        assert role.jd.updated_at == previous_version


async def test_matching_requires_profile_before_dispatch(
    extraction_database, extraction_role
):
    from riva.models import User

    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        user = await session.get(User, role.user_id)
        with pytest.raises(NotFoundError, match="Career profile"):
            await RoleService(session).start_matching_analysis(user, role.id)
        await session.rollback()
        role = await session.get(Role, extraction_role)
        assert role.matching.job_id is None
