from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import Database
from riva.models.target_role import JobDescription, TargetRole
from riva.services.errors import ConflictError, NotFoundError
from riva.services.job_descriptions import JobDescriptionService
from riva.services.target_roles import TargetRoleService
from riva.services.users import UserService


async def test_update_jd_preserves_untouched_modules_and_refreshes_parent_timestamp(
    db_session: AsyncSession,
    database: Database,
    user_service: UserService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = (await user_service.register("TestUser", "ValidPass123!")).user
    target_role_service = TargetRoleService(db_session)
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
    monkeypatch.setattr(
        "riva.services.job_descriptions.utc_now", lambda: next_updated_at
    )

    await JobDescriptionService(target_role_service.session).update(
        role,
        responsibilities=["New responsibility"],
        soft_skills=[],
    )
    async with database.sessionmaker() as session:
        reloaded = await session.get(TargetRole, role.id)

    assert reloaded is not None
    assert reloaded.jd.responsibilities == ["New responsibility"]
    assert reloaded.jd.soft_skills == []
    assert reloaded.jd.business_domains == ["SaaS"]
    assert reloaded.updated_at == next_updated_at


async def test_active_extraction_blocks_manual_update_without_partial_writes(
    extraction_database: Database, extraction_role: UUID
) -> None:
    async with extraction_database.sessionmaker() as session:
        role = await session.get(TargetRole, extraction_role)
        service = JobDescriptionService(session)
        await service.extract_text(role, text="Build APIs")
        with pytest.raises(ConflictError):
            await service.update(role, responsibilities=["Manual"], soft_skills=[])
    async with extraction_database.sessionmaker() as session:
        role = await session.get(TargetRole, extraction_role)
        assert role.jd.responsibilities == ["Original"]
        assert role.jd.soft_skills == ["Teamwork"]


async def test_deleted_jd_is_not_found_after_role_was_loaded(
    extraction_database: Database, extraction_role: UUID
) -> None:
    async with (
        extraction_database.sessionmaker() as request,
        extraction_database.sessionmaker() as deleting,
    ):
        role = await request.get(TargetRole, extraction_role)
        deleted = await deleting.get(TargetRole, extraction_role)
        await deleting.delete(deleted)
        await deleting.commit()
        with pytest.raises(NotFoundError):
            await JobDescriptionService(request).update(
                role, responsibilities=["Manual"]
            )
