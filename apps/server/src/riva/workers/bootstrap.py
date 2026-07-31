import asyncio
from collections.abc import Callable
from datetime import timedelta
import os
import signal
import socket
from typing import Any

import structlog

from riva.core.config import Settings
from riva.db import Database
from riva.workers.handlers import AgentHandlerRegistry
from riva.workers.runtime import AgentWorker


DatabaseFactory = Callable[[str], Database]
RegistryFactory = Callable[[Settings], AgentHandlerRegistry]
WorkerFactory = Callable[..., AgentWorker]
SignalCallback = Callable[[signal.Signals], None]
SignalRegistrar = Callable[[SignalCallback], Callable[[], None]]


def build_agent_handler_registry(_settings: Settings) -> AgentHandlerRegistry:
    return AgentHandlerRegistry()


def resolve_worker_id(
    configured_id: str | None,
    *,
    hostname_factory: Callable[[], str] = socket.gethostname,
    pid_factory: Callable[[], int] = os.getpid,
) -> str:
    if configured_id and configured_id.strip():
        return configured_id.strip()

    suffix = f"-{pid_factory()}"
    hostname = hostname_factory().strip() or "worker"
    return f"{hostname[: 255 - len(suffix)]}{suffix}"


def build_agent_worker(
    settings: Settings,
    database: Database,
    registry: AgentHandlerRegistry,
    worker_id: str,
    *,
    worker_factory: WorkerFactory = AgentWorker,
    logger: Any | None = None,
) -> AgentWorker:
    return worker_factory(
        worker_id=worker_id,
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(seconds=settings.worker_lease_seconds),
        heartbeat_interval=timedelta(
            seconds=settings.worker_heartbeat_seconds
        ),
        poll_interval=timedelta(seconds=settings.worker_poll_seconds),
        requeue_interval=timedelta(seconds=settings.worker_requeue_seconds),
        retry_base_delay=timedelta(
            seconds=settings.worker_retry_base_seconds
        ),
        retry_max_delay=timedelta(
            seconds=settings.worker_retry_max_seconds
        ),
        requeue_batch_size=settings.worker_requeue_batch_size,
        logger=logger,
    )


async def run_worker(
    settings: Settings,
    *,
    database_factory: DatabaseFactory = Database,
    registry_factory: RegistryFactory = build_agent_handler_registry,
    worker_factory: WorkerFactory = AgentWorker,
    stop_event: asyncio.Event | None = None,
    signal_registrar: SignalRegistrar | None = None,
    hostname_factory: Callable[[], str] = socket.gethostname,
    pid_factory: Callable[[], int] = os.getpid,
    logger: Any | None = None,
) -> None:
    worker_id = resolve_worker_id(
        settings.worker_id,
        hostname_factory=hostname_factory,
        pid_factory=pid_factory,
    )
    stop_event = stop_event or asyncio.Event()
    logger = logger or structlog.get_logger("riva.worker")
    received_signal: list[str | None] = [None]

    def request_stop(received: signal.Signals) -> None:
        if received_signal[0] is None:
            received_signal[0] = received.name
        stop_event.set()

    remove_signal_handlers: Callable[[], None] = lambda: None
    signal_log_task: asyncio.Task[None] | None = None

    try:
        remove_signal_handlers = (
            signal_registrar or install_signal_handlers
        )(request_stop)
        async with database_factory(settings.database_url) as database:
            await database.ping()
            registry = registry_factory(settings)
            worker = build_agent_worker(
                settings,
                database,
                registry,
                worker_id,
                worker_factory=worker_factory,
                logger=logger,
            )
            logger.info(
                "agent.worker.lifecycle",
                worker_id=worker_id,
                status="starting",
                lease_seconds=settings.worker_lease_seconds,
                heartbeat_seconds=settings.worker_heartbeat_seconds,
                poll_seconds=settings.worker_poll_seconds,
                requeue_seconds=settings.worker_requeue_seconds,
                requeue_batch_size=settings.worker_requeue_batch_size,
                handler_count=len(registry),
                agent_ids=list(registry.agent_ids),
            )
            if not registry:
                logger.warning(
                    "agent.worker.registry",
                    worker_id=worker_id,
                    status="empty",
                    agent_ids=[],
                )

            signal_log_task = asyncio.create_task(
                _log_stop_signal(
                    stop_event,
                    received_signal,
                    worker_id,
                    logger,
                ),
                name=f"agent-signal:{worker_id}",
            )
            await worker.run(stop_event)
            if stop_event.is_set():
                await signal_log_task

        logger.info(
            "agent.worker.lifecycle",
            worker_id=worker_id,
            status="stopped",
        )
    except Exception:
        logger.exception(
            "agent.worker.lifecycle",
            worker_id=worker_id,
            status="failed",
            error_code="agent_worker_failed",
        )
        raise
    finally:
        remove_signal_handlers()
        if signal_log_task is not None:
            if not signal_log_task.done():
                signal_log_task.cancel()
            await asyncio.gather(signal_log_task, return_exceptions=True)


def install_signal_handlers(
    callback: SignalCallback,
    *,
    loop: asyncio.AbstractEventLoop | None = None,
) -> Callable[[], None]:
    loop = loop or asyncio.get_running_loop()
    signals = (signal.SIGINT, signal.SIGTERM)
    registered: list[signal.Signals] = []

    try:
        for current in signals:
            loop.add_signal_handler(current, callback, current)
            registered.append(current)
    except (
        AttributeError,
        NotImplementedError,
        OSError,
        RuntimeError,
        ValueError,
    ):
        for current in registered:
            loop.remove_signal_handler(current)
        return _install_synchronous_signal_handlers(callback, signals)

    def remove() -> None:
        for current in registered:
            loop.remove_signal_handler(current)

    return remove


def _install_synchronous_signal_handlers(
    callback: SignalCallback,
    signals: tuple[signal.Signals, ...],
) -> Callable[[], None]:
    previous: dict[signal.Signals, Any] = {}

    try:
        for current in signals:
            previous[current] = signal.getsignal(current)
            signal.signal(
                current,
                lambda signum, _frame: callback(signal.Signals(signum)),
            )
    except (OSError, RuntimeError, ValueError):
        for current, handler in previous.items():
            try:
                signal.signal(current, handler)
            except (OSError, RuntimeError, ValueError):
                pass
        return lambda: None

    def remove() -> None:
        for current, handler in previous.items():
            try:
                signal.signal(current, handler)
            except (OSError, RuntimeError, ValueError):
                pass

    return remove


async def _log_stop_signal(
    stop_event: asyncio.Event,
    received_signal: list[str | None],
    worker_id: str,
    logger: Any,
) -> None:
    await stop_event.wait()
    if received_signal[0] is not None:
        logger.info(
            "agent.worker.lifecycle",
            worker_id=worker_id,
            signal=received_signal[0],
            status="stopping",
        )
