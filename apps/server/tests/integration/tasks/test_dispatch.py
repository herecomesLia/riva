from typing import cast
from uuid import UUID

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import Database
from riva.models import User
from riva.tasks import Task
from riva.tasks.core import (
    cancel_job,
    defer_job,
    get_job_status,
    retry_job,
)
from riva.tasks.errors import TaskError
from riva.tasks.registry import TaskSpec
from riva.tasks.types import JobStatus

TRANSACTIONAL_TASK = cast(
    Task,
    TaskSpec(
        name="test.transactional_dispatch",
        queue="test",
    ),
)


def _user(username: str) -> User:
    return User(
        username=username,
        password_hash="test-password-hash",
        display_name="Before",
    )


async def _job_status(database: Database, job_id: int) -> tuple[str, bool] | None:
    async with database.sessionmaker() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT status::text, abort_requested
                    FROM procrastinate.procrastinate_jobs
                    WHERE id = :job_id
                    """
                ),
                {"job_id": job_id},
            )
        ).one_or_none()
        return tuple(row) if row else None


async def _display_name(database: Database, user_id: UUID) -> str | None:
    async with database.sessionmaker() as session:
        return await session.scalar(select(User.display_name).where(User.id == user_id))


async def _create_user_and_job(
    database: Database,
    *,
    username: str,
) -> tuple[UUID, int]:
    async with database.sessionmaker() as session:
        user = _user(username)
        session.add(user)
        await session.flush()
        job_id = await defer_job(
            session,
            TRANSACTIONAL_TASK,
            user_id=str(user.id),
        )
        await session.commit()
        return user.id, job_id


async def test_defer_commits_with_business_write(database: Database) -> None:

    user_id, job_id = await _create_user_and_job(database, username="CommitDefer")

    assert await _display_name(database, user_id) == "Before"
    assert await _job_status(database, job_id) == ("todo", False)


async def _set_job_status(
    session: AsyncSession,
    job_id: int,
    status: str,
    *,
    abort_requested: bool = False,
) -> None:
    # Procrastinate's status triggers resolve types through search_path.
    search_path = await session.scalar(text("SHOW search_path"))
    await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
    await session.execute(
        text(
            "UPDATE procrastinate_jobs "
            "SET status = :status, abort_requested = :abort_requested WHERE id = :job_id"
        ),
        {"job_id": job_id, "status": status, "abort_requested": abort_requested},
    )
    await session.execute(
        text("SELECT set_config('search_path', :search_path, true)"),
        {"search_path": search_path},
    )


@pytest.mark.parametrize(
    ("status", "abort_requested", "expected"),
    [
        ("todo", False, JobStatus.QUEUED),
        ("doing", False, JobStatus.RUNNING),
        ("doing", True, JobStatus.ABORTING),
        ("succeeded", False, JobStatus.SUCCEEDED),
        ("failed", False, JobStatus.FAILED),
        ("aborting", False, JobStatus.ABORTING),
        ("aborted", False, JobStatus.ABORTED),
        ("cancelled", True, JobStatus.CANCELLED),
    ],
)
async def test_get_job_status_maps_uncommitted_state(
    database: Database,
    status: str,
    abort_requested: bool,
    expected: JobStatus,
) -> None:
    async with database.sessionmaker() as session:
        job_id = await defer_job(session, TRANSACTIONAL_TASK)
        await _set_job_status(session, job_id, status, abort_requested=abort_requested)
        search_path = await session.scalar(text("SHOW search_path"))

        assert await get_job_status(session, job_id) is expected
        assert await session.scalar(text("SHOW search_path")) == search_path


async def test_get_job_status_rejects_missing_job(database: Database) -> None:
    async with database.sessionmaker() as session:
        with pytest.raises(TaskError, match="Job -1 was not found"):
            await get_job_status(session, -1)


@pytest.mark.parametrize("commit", [True, False], ids=["commit", "rollback"])
async def test_retry_is_atomic_with_business_write(
    database: Database, commit: bool
) -> None:
    user_id, job_id = await _create_user_and_job(database, username="RetryJob")
    async with database.sessionmaker() as session:
        await _set_job_status(session, job_id, "failed")
        await session.commit()

        user = await session.get(User, user_id)
        assert user is not None
        user.display_name = "After"
        await session.flush()
        search_path = await session.scalar(text("SHOW search_path"))
        await retry_job(session, job_id)

        assert await get_job_status(session, job_id) is JobStatus.QUEUED
        assert await session.scalar(text("SHOW search_path")) == search_path
        if commit:
            await session.commit()
        else:
            await session.rollback()

    assert await _display_name(database, user_id) == ("After" if commit else "Before")
    assert await _job_status(database, job_id) == (
        "todo" if commit else "failed",
        False,
    )


async def test_defer_rolls_back_with_business_write(database: Database) -> None:
    async with database.sessionmaker() as session:
        user = _user("RollbackDefer")
        session.add(user)
        await session.flush()
        job_id = await defer_job(
            session,
            TRANSACTIONAL_TASK,
            user_id=str(user.id),
        )
        await session.rollback()

    assert await _display_name(database, user.id) is None
    assert await _job_status(database, job_id) is None


async def test_cancel_commits_with_business_write(database: Database) -> None:
    user_id, job_id = await _create_user_and_job(database, username="CommitCancel")

    async with database.sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user is not None
        user.display_name = "After"
        await session.flush()
        assert await cancel_job(session, job_id, abort=False)
        await session.commit()

    assert await _display_name(database, user_id) == "After"
    assert await _job_status(database, job_id) == ("cancelled", False)


async def test_cancel_rolls_back_with_business_write(database: Database) -> None:
    user_id, job_id = await _create_user_and_job(database, username="RollbackCancel")

    async with database.sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user is not None
        user.display_name = "After"
        await session.flush()
        assert await cancel_job(session, job_id, abort=True)
        await session.rollback()

    assert await _display_name(database, user_id) == "Before"
    assert await _job_status(database, job_id) == ("todo", False)
