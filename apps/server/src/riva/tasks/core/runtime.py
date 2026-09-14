import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import TYPE_CHECKING, Any, LiteralString

import procrastinate
import psycopg
import structlog
from procrastinate.jobs import Job
from procrastinate.tasks import configure_task
from procrastinate.types import JSONValue
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from riva.core.config import TaskSettings
from riva.tasks.core.app import TASK_SCHEMA, app
from riva.tasks.errors import TaskError, TaskStateError
from riva.tasks.registry import Task
from riva.tasks.types import TaskStatus
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.db import Database


class _JobStore:
    """Procrastinate 3.9 adapter; callers own the transaction.

    Upgrade checklist: jobs/events/workers columns, event triggers, retry/finish
    queries and their attempts increments, and external-connection support.
    Event IDs define order: event timestamps use transaction NOW(), so timestamps
    alone cannot order multiple transitions in the same transaction.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def query(self, query: LiteralString, **params: Any) -> list[dict[str, Any]]:
        async with _task_connection(self.session) as connection:
            return await app.connector.execute_query_all_async_with_connection(
                connection, query=query, **params
            )

    async def get(self, job_id: int, *, lock: bool = False) -> dict[str, Any]:
        query = "SELECT * FROM procrastinate_jobs WHERE id = %(job_id)s"
        if lock:
            query += " FOR UPDATE"
        rows = await self.query(query, job_id=job_id)
        if not rows:
            raise TaskError(f"Job {job_id} was not found.")
        return rows[0]

    async def get_enqueue_event(self, job_id: int) -> dict[str, Any]:
        rows = await self.query(
            """
            SELECT type, at FROM procrastinate_events
            WHERE job_id = %(job_id)s
              AND type IN ('deferred', 'retried', 'deferred_for_retry')
            ORDER BY id DESC LIMIT 1
            """,
            job_id=job_id,
        )
        if not rows:
            raise TaskError(f"Job {job_id} has no enqueue event.")
        return rows[0]

    async def count_recoveries(self, job_id: int) -> int:
        # retry=False makes doing -> todo an infrastructure recovery. Native
        # failed -> todo emits 'retried', starting a new user execution cycle.
        rows = await self.query(
            """
            SELECT count(*) AS count FROM procrastinate_events
            WHERE job_id = %(job_id)s AND type = 'deferred_for_retry'
              AND id > (
                  SELECT COALESCE(max(id), 0) FROM procrastinate_events
                  WHERE job_id = %(job_id)s AND type IN ('deferred', 'retried')
              )
            """,
            job_id=job_id,
        )
        return rows[0]["count"]

    async def list_active_job_ids(self) -> list[int]:
        rows = await self.query(
            "SELECT id FROM procrastinate_jobs WHERE status IN ('todo', 'doing') ORDER BY id"
        )
        return [row["id"] for row in rows]

    async def lock_active_job(self, job_id: int) -> dict[str, Any] | None:
        rows = await self.query(
            """
            SELECT * FROM procrastinate_jobs
            WHERE id = %(job_id)s AND status IN ('todo', 'doing')
            FOR UPDATE SKIP LOCKED
            """,
            job_id=job_id,
        )
        return rows[0] if rows else None

    async def get_worker_heartbeat(self, worker_id: int | None) -> datetime | None:
        rows = await self.query(
            "SELECT last_heartbeat FROM procrastinate_workers WHERE id = %(worker_id)s",
            worker_id=worker_id,
        )
        return rows[0]["last_heartbeat"] if rows else None

    async def now(self) -> datetime:
        return (await self.query("SELECT clock_timestamp() AS now"))[0]["now"]

    async def start(self, task: Task, **kwargs: JSONValue) -> int:
        async with _task_connection(self.session) as connection:
            return await configure_task(
                name=task.name,
                queue=task.queue,
                job_manager=app.job_manager,
                connection=connection,
            ).defer_async(**kwargs)

    async def abort(self, job_id: int) -> None:
        await self.query(
            procrastinate.sql.queries["cancel_job"],
            job_id=job_id,
            abort=True,
            delete_job=False,
        )

    async def retry(self, job_id: int) -> None:
        await self.query(
            procrastinate.sql.queries["retry_job"],
            job_id=job_id,
            retry_at=utc_now(),
            new_priority=None,
            new_queue_name=None,
            new_lock=None,
        )

    async def finish(self, job_id: int, status: str) -> None:
        # Native finish increments attempts on doing -> terminal. Subsequent worker
        # acknowledgement is stale and must not finish this job a second time.
        await self.query(
            procrastinate.sql.queries["finish_job"],
            job_id=job_id,
            status=status,
            delete_job=False,
        )


class TaskController:
    """Transactional lifecycle operations; business locks and commits belong to Service."""

    def __init__(self, session: AsyncSession):
        self.store = _JobStore(session)

    async def start(self, task: Task, **kwargs: JSONValue) -> int:
        return await self.store.start(task, **kwargs)

    async def get_status(self, job_id: int | None) -> TaskStatus:
        if job_id is None:
            return TaskStatus.IDLE
        # Keep status and enqueue-event reads coherent with supervisor transitions.
        job = await self.store.get(job_id, lock=True)
        if job["status"] == "todo":
            enqueue = await self.store.get_enqueue_event(job_id)
            return (
                TaskStatus.RUNNING
                if enqueue["type"] == "deferred_for_retry"
                else TaskStatus.QUEUED
            )
        if job["status"] == "doing":
            return TaskStatus.ABORTING if job["abort_requested"] else TaskStatus.RUNNING
        if job["status"] == "aborting":
            return TaskStatus.ABORTING
        return {
            "failed": TaskStatus.FAILED,
            "succeeded": TaskStatus.IDLE,
            "aborted": TaskStatus.IDLE,
            "cancelled": TaskStatus.IDLE,
        }[job["status"]]

    async def is_active(self, job_id: int | None) -> bool:
        return await self.get_status(job_id) in {
            TaskStatus.QUEUED,
            TaskStatus.RUNNING,
            TaskStatus.ABORTING,
        }

    async def retry(self, job_id: int | None) -> None:
        if job_id is None:
            raise TaskStateError("There is no task to retry.")
        job = await self.store.get(job_id, lock=True)
        if job["status"] != "failed":
            raise TaskStateError("Only failed tasks can be retried.")
        await self.store.retry(job_id)

    async def abort(self, job_id: int | None) -> None:
        if job_id is None:
            raise TaskStateError("There is no task to abort.")
        job = await self.store.get(job_id, lock=True)
        if job["status"] == "aborting" or (
            job["status"] == "doing" and job["abort_requested"]
        ):
            return
        if job["status"] not in {"todo", "doing"}:
            raise TaskStateError("Only active tasks can be aborted.")
        await self.store.abort(job_id)


class TaskAttempt:
    def __init__(self, job: Job):
        self.job = job

    async def is_current(self, session: AsyncSession, job_id: int | None) -> bool:
        """Check ownership without locking; this does not authorize writes."""
        if job_id != self.job.id:
            return False
        return await self._check_job(session, lock=False)

    async def lock_for_write(self, session: AsyncSession, job_id: int | None) -> bool:
        # Caller holds the business state lock first. Keep both locks through commit;
        # supervisor/worker only lock jobs, never business rows in reverse order.
        if job_id != self.job.id:
            return False
        return await self._check_job(session, lock=True)

    async def _check_job(self, session: AsyncSession, *, lock: bool) -> bool:
        assert self.job.id is not None
        job = await _JobStore(session).get(self.job.id, lock=lock)
        return (
            job["attempts"] == self.job.attempts
            and job["status"] == "doing"
            and not job["abort_requested"]
        )

    async def finish(self, session: AsyncSession, *, failed: bool = False) -> None:
        # Must follow a successful lock_for_write in this transaction, retaining
        # the business row lock. This rechecks only the job, not business ownership.
        # Business writes and the native terminal transition commit together.
        assert self.job.id is not None
        if not await self._check_job(session, lock=True):
            raise TaskError(
                "This execution no longer owns the task; roll back its writes."
            )
        await _JobStore(session).finish(
            self.job.id, "failed" if failed else "succeeded"
        )


class TaskSupervisor:
    def __init__(self, database: Database, settings: TaskSettings):
        # Reconciliation owns independent transactions, never a request-bound
        # connection/session factory (including savepoint-bound test sessions).
        self.sessions = async_sessionmaker(database.engine, expire_on_commit=False)
        self.settings = settings

    async def sweep(self) -> None:
        # Snapshot IDs only; each candidate is re-read under a nonblocking row lock.
        # This also keeps one slow job from holding every candidate lock.
        async with self.sessions() as session:
            ids = await _JobStore(session).list_active_job_ids()
        for job_id in ids:
            async with self.sessions() as session:
                store = _JobStore(session)
                job = await store.lock_active_job(job_id)
                if job is None:
                    continue
                await self._reconcile(store, job)
                await session.commit()

    async def _reconcile(self, store: _JobStore, job: dict[str, Any]) -> None:
        now = await store.now()
        if job["status"] == "todo":
            enqueue = await store.get_enqueue_event(job["id"])
            start = max(enqueue["at"], job["scheduled_at"] or enqueue["at"])
            timeout = (
                self.settings.recovery_timeout_seconds
                if enqueue["type"] == "deferred_for_retry"
                else self.settings.queue_timeout_seconds
            )
            if (now - start).total_seconds() > timeout:
                await store.finish(job["id"], "failed")
                structlog.get_logger(__name__).warning(
                    "task.queue_timeout", job_id=job["id"]
                )
            return
        # Matches Procrastinate 3.9 stalled detection: missing worker (FK SET NULL)
        # or expired heartbeat. A healthy execution has no recovery time limit.
        heartbeat = await store.get_worker_heartbeat(job["worker_id"])
        if (
            heartbeat is not None
            and (now - heartbeat).total_seconds() <= self.settings.stall_timeout_seconds
        ):
            return
        recoveries = await store.count_recoveries(job["id"])
        if job["abort_requested"]:
            await store.finish(job["id"], "aborted")
        elif recoveries >= self.settings.max_recovery_attempts:
            await store.finish(job["id"], "failed")
        else:
            await store.retry(job["id"])
        structlog.get_logger(__name__).warning(
            "task.stalled",
            job_id=job["id"],
            attempts=job["attempts"],
            recoveries=recoveries,
        )

    @asynccontextmanager
    async def run(self) -> AsyncGenerator[None]:
        # TaskGroup propagates supervisor failures; never leave a silently dead
        # reconciler behind while the API continues serving indefinitely.
        async with asyncio.TaskGroup() as group:
            task = group.create_task(self._run(), name="task-supervisor")
            try:
                yield
            finally:
                task.cancel()

    async def _run(self) -> None:
        while True:
            await self.sweep()
            await asyncio.sleep(1)


@asynccontextmanager
async def _task_connection(
    session: AsyncSession,
) -> AsyncGenerator[psycopg.AsyncConnection]:
    # Procrastinate 3.9 retry/finish/cancel APIs do not accept external connections.
    # Use its SQL queries on SQLAlchemy's psycopg connection so business writes and
    # transitions share a transaction. Triggers resolve names using search_path.
    connection = await session.connection()
    original = await connection.scalar(text("SHOW search_path"))
    await connection.execute(text(f"SET LOCAL search_path TO {TASK_SCHEMA}, public"))
    raw = await connection.get_raw_connection()
    driver = raw.driver_connection
    if not isinstance(driver, psycopg.AsyncConnection):
        raise TaskError("Transactional task operations require psycopg.")
    try:
        yield driver
    finally:
        # A failed SQL statement leaves PostgreSQL unable to restore search_path;
        # rollback restores SET LOCAL automatically without masking the SQL error.
        if driver.info.transaction_status != psycopg.pq.TransactionStatus.INERROR:
            await connection.execute(
                text("SELECT set_config('search_path', :path, true)"),
                {"path": original},
            )
