import procrastinate
import structlog
from procrastinate.jobs import Job, Status
from procrastinate.manager import JobManager

from riva.core.config import Settings
from riva.tasks.core.app import app, create_task_connector
from riva.tasks.core.context import task_resources
from riva.tasks.errors import TaskError
from riva.tasks.registry import configure_task_registry


class FencedJobManager(JobManager):
    async def finish_job(self, job: Job, status: Status, delete_job: bool) -> None:
        # Procrastinate 3.9 Worker calls this method with its original Job snapshot.
        # Native finish only checks id/status, so it cannot fence recovered attempts.
        # On upgrade verify this hook, connector.pool and finish_job SQL semantics.
        connector = self.connector
        if not isinstance(connector, procrastinate.PsycopgConnector):
            raise TypeError("Fenced task completion requires PsycopgConnector.")
        async with (
            connector.pool.connection() as connection,
            connection.transaction(),
        ):
            rows = await connector.execute_query_all_async_with_connection(
                connection,
                query="SELECT attempts, status, abort_requested FROM procrastinate_jobs WHERE id = %(job_id)s FOR UPDATE",
                job_id=job.id,
            )
            # Native finish increments attempts. This also makes duplicate
            # acknowledgement after atomic business completion a stale no-op.
            if (
                not rows
                or rows[0]["attempts"] != job.attempts
                or rows[0]["status"] != "doing"
            ):
                structlog.get_logger(__name__).info(
                    "task.stale_completion", job_id=job.id, attempts=job.attempts
                )
                return
            # In 3.9 this flag is set by application cancellation and cleared
            # by finish. Read it while locked, before the terminal transition.
            if rows[0]["abort_requested"]:
                status = Status.ABORTED
            elif status is Status.ABORTED:
                status = Status.FAILED
            # Retain failed jobs for user retry, regardless of a worker's
            # delete policy. Successful/explicitly cancelled jobs may be deleted.
            await connector.execute_query_all_async_with_connection(
                connection,
                query=procrastinate.sql.queries["finish_job"],
                job_id=job.id,
                status=status.value,
                delete_job=delete_job and status is not Status.FAILED,
            )


# Procrastinate 3.9 exposes a mutable job_manager, also used by replace_connector.
# Install before task registration so every worker uses fenced terminal writes.
app.job_manager = FencedJobManager(connector=app.connector)


async def run_worker(
    settings: Settings,
    *,
    concurrency: int | None = None,
    queues: tuple[str, ...] | None = None,
) -> None:
    configure_task_registry(app)
    connector = create_task_connector(settings.database.url)
    with app.replace_connector(connector):
        async with app.open_async():
            if not await app.check_connection_async():
                raise TaskError(
                    "Background task schema is not initialized. Run `riva db setup`."
                )
            async with task_resources(settings) as resources:
                await app.run_worker_async(
                    queues=queues,
                    concurrency=(
                        settings.tasks.concurrency
                        if concurrency is None
                        else concurrency
                    ),
                    shutdown_graceful_timeout=settings.tasks.shutdown_timeout_seconds,
                    stalled_worker_timeout=settings.tasks.stall_timeout_seconds,
                    additional_context={"resources": resources},
                )
