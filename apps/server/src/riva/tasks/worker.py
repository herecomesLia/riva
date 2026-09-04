from riva.core.config import Settings
from riva.tasks.app import create_task_app


async def run_worker(
    settings: Settings,
    *,
    concurrency: int | None = None,
) -> None:
    task_app = create_task_app(settings.database_url)
    async with task_app.open_async():
        if not await task_app.check_connection_async():
            raise RuntimeError(
                "Background task schema is not initialized. Run `riva db setup`."
            )
        await task_app.run_worker_async(
            concurrency=(
                settings.tasks.concurrency if concurrency is None else concurrency
            ),
            shutdown_graceful_timeout=settings.tasks.shutdown_timeout_seconds,
        )
