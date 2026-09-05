from uuid import UUID

from sqlalchemy import select, text

from riva.db import Database
from riva.models import User
from riva.tasks import Task, TaskSpec
from riva.tasks.core import cancel_job, defer_job, reset_task_schema


class TaskForTest(Task):
    TRANSACTIONAL_DISPATCH = TaskSpec(
        name="test.transactional_dispatch",
        queue="test",
    )


TRANSACTIONAL_TASK = TaskForTest.TRANSACTIONAL_DISPATCH


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


async def _job_metadata(
    database: Database,
    job_id: int,
) -> tuple[str, str] | None:
    async with database.sessionmaker() as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT task_name, queue_name
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
    await reset_task_schema(database)

    user_id, job_id = await _create_user_and_job(database, username="CommitDefer")

    assert await _display_name(database, user_id) == "Before"
    assert await _job_status(database, job_id) == ("todo", False)
    assert await _job_metadata(database, job_id) == (
        TRANSACTIONAL_TASK.name,
        TRANSACTIONAL_TASK.queue,
    )


async def test_defer_rolls_back_with_business_write(database: Database) -> None:
    await reset_task_schema(database)
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
    await reset_task_schema(database)
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
    await reset_task_schema(database)
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
