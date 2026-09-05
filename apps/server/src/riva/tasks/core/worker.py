from riva.core.config import Settings
from riva.tasks.core.app import app, create_task_connector
from riva.tasks.registry import configure_task_registry


async def run_worker(
    settings: Settings,
    *,
    concurrency: int | None = None,
) -> None:
    configure_task_registry(app)
    connector = create_task_connector(settings.database_url)
    with app.replace_connector(connector):
        async with app.open_async():
            if not await app.check_connection_async():
                raise RuntimeError(
                    "Background task schema is not initialized. Run `riva db setup`."
                )
            await app.run_worker_async(
                concurrency=(
                    settings.tasks.concurrency if concurrency is None else concurrency
                ),
                shutdown_graceful_timeout=settings.tasks.shutdown_timeout_seconds,
            )
