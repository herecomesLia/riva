import asyncio
from collections.abc import Callable
from datetime import timedelta
import signal
from typing import Any

import pytest

from riva.core.config import Settings
from riva.workers.bootstrap import (
    build_agent_handler_registry,
    install_signal_handlers,
    resolve_worker_id,
    run_worker,
)


class FakeDatabase:
    def __init__(
        self,
        database_url: str,
        events: list[str],
        *,
        ping_error: Exception | None = None,
    ) -> None:
        self.database_url = database_url
        self.events = events
        self.ping_error = ping_error
        self.sessionmaker = object()
        self.create_tables_count = 0
        self.reset_count = 0
        self.dispose_count = 0

    async def __aenter__(self) -> "FakeDatabase":
        self.events.append("database.enter")
        return self

    async def __aexit__(self, *args: object) -> None:
        self.events.append("database.exit")
        self.dispose_count += 1

    async def ping(self) -> None:
        self.events.append("database.ping")
        if self.ping_error is not None:
            raise self.ping_error


class FakeWorker:
    def __init__(
        self,
        events: list[str],
        *,
        error: Exception | None = None,
    ) -> None:
        self.events = events
        self.error = error
        self.stop_events: list[asyncio.Event] = []

    async def run(self, stop_event: asyncio.Event) -> None:
        self.events.append("worker.run")
        self.stop_events.append(stop_event)
        if self.error is not None:
            raise self.error


class LongWorker(FakeWorker):
    def __init__(self, events: list[str]) -> None:
        super().__init__(events)
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def run(self, stop_event: asyncio.Event) -> None:
        self.events.append("worker.run")
        self.stop_events.append(stop_event)
        self.started.set()
        await self.release.wait()


class FakeLogger:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, dict[str, object]]] = []

    def info(self, event: str, **fields: object) -> None:
        self.events.append(("info", event, fields))

    def warning(self, event: str, **fields: object) -> None:
        self.events.append(("warning", event, fields))

    def exception(self, event: str, **fields: object) -> None:
        self.events.append(("exception", event, fields))


def settings(**overrides: object) -> Settings:
    overrides.setdefault("worker_id", None)
    return Settings(
        database_url="postgresql+asyncpg://secret:password@localhost/private",
        session_digest_key="test-session-digest-key",
        **overrides,
    )


def no_signals(_callback) -> Callable[[], None]:
    return lambda: None


def test_resolve_worker_id_uses_configured_or_safe_process_identity() -> None:
    assert (
        resolve_worker_id(
            " configured-worker ",
            hostname_factory=lambda: "ignored",
            pid_factory=lambda: 1,
        )
        == "configured-worker"
    )

    generated = resolve_worker_id(
        "",
        hostname_factory=lambda: "host" * 100,
        pid_factory=lambda: 1234,
    )

    assert generated.endswith("-1234")
    assert len(generated) == 255


def test_default_registry_is_empty_without_fake_handlers() -> None:
    registry = build_agent_handler_registry(settings())

    assert len(registry) == 0
    assert registry.agent_ids == ()


def test_run_worker_composes_database_registry_and_runtime() -> None:
    async def run_test() -> None:
        events: list[str] = []
        databases: list[FakeDatabase] = []
        workers: list[FakeWorker] = []
        worker_options: list[dict[str, object]] = []
        logger = FakeLogger()

        def database_factory(database_url: str) -> FakeDatabase:
            database = FakeDatabase(database_url, events)
            databases.append(database)
            return database

        def worker_factory(**options: object) -> FakeWorker:
            events.append("worker.create")
            worker_options.append(options)
            worker = FakeWorker(events)
            workers.append(worker)
            return worker

        await run_worker(
            settings(
                worker_id="configured-worker",
                worker_lease_seconds=400,
                worker_heartbeat_seconds=50,
                worker_poll_seconds=2,
                worker_requeue_seconds=70,
                worker_retry_base_seconds=12,
                worker_retry_max_seconds=120,
                worker_requeue_batch_size=25,
            ),
            database_factory=database_factory,  # type: ignore[arg-type]
            worker_factory=worker_factory,  # type: ignore[arg-type]
            signal_registrar=no_signals,
            logger=logger,
        )

        assert events == [
            "database.enter",
            "database.ping",
            "worker.create",
            "worker.run",
            "database.exit",
        ]
        database = databases[0]
        assert database.dispose_count == 1
        assert database.create_tables_count == 0
        assert database.reset_count == 0
        assert worker_options[0]["session_factory"] is database.sessionmaker
        assert worker_options[0]["worker_id"] == "configured-worker"
        assert worker_options[0]["lease_duration"] == timedelta(seconds=400)
        assert worker_options[0]["heartbeat_interval"] == timedelta(seconds=50)
        assert worker_options[0]["requeue_batch_size"] == 25
        assert len(worker_options[0]["registry"]) == 0
        assert workers[0].stop_events

        log_text = repr(logger.events)
        assert "secret:password" not in log_text
        assert "private" not in log_text
        assert any(
            fields.get("status") == "starting"
            and fields.get("handler_count") == 0
            and fields.get("agent_ids") == []
            for _, _, fields in logger.events
        )
        assert any(
            fields.get("status") == "stopped"
            for _, _, fields in logger.events
        )

    asyncio.run(run_test())


def test_run_worker_disposes_database_and_logs_safe_failure() -> None:
    async def run_test() -> None:
        events: list[str] = []
        databases: list[FakeDatabase] = []
        logger = FakeLogger()

        def database_factory(database_url: str) -> FakeDatabase:
            database = FakeDatabase(database_url, events)
            databases.append(database)
            return database

        def worker_factory(**_options: object) -> FakeWorker:
            return FakeWorker(
                events,
                error=RuntimeError("private payload and result"),
            )

        with pytest.raises(RuntimeError, match="private payload"):
            await run_worker(
                settings(),
                database_factory=database_factory,  # type: ignore[arg-type]
                worker_factory=worker_factory,  # type: ignore[arg-type]
                signal_registrar=no_signals,
                hostname_factory=lambda: "test-host",
                pid_factory=lambda: 42,
                logger=logger,
            )

        assert databases[0].dispose_count == 1
        failure = next(
            fields
            for level, _, fields in logger.events
            if level == "exception"
        )
        assert failure == {
            "worker_id": "test-host-42",
            "status": "failed",
            "error_code": "agent_worker_failed",
        }
        assert "private payload" not in repr(logger.events)

    asyncio.run(run_test())


def test_database_ping_failure_disposes_without_creating_worker() -> None:
    async def run_test() -> None:
        events: list[str] = []
        database = FakeDatabase(
            "postgresql+asyncpg://secret@localhost/private",
            events,
            ping_error=RuntimeError("private database failure"),
        )
        worker_created = False
        logger = FakeLogger()

        def worker_factory(**_options: object) -> FakeWorker:
            nonlocal worker_created
            worker_created = True
            return FakeWorker(events)

        with pytest.raises(RuntimeError, match="private database failure"):
            await run_worker(
                settings(),
                database_factory=lambda _url: database,  # type: ignore[arg-type]
                worker_factory=worker_factory,  # type: ignore[arg-type]
                signal_registrar=no_signals,
                logger=logger,
            )

        assert events == [
            "database.enter",
            "database.ping",
            "database.exit",
        ]
        assert database.dispose_count == 1
        assert worker_created is False
        assert "private database failure" not in repr(logger.events)

    asyncio.run(run_test())


@pytest.mark.parametrize("received", [signal.SIGINT, signal.SIGTERM])
def test_signal_sets_stop_event_and_waits_for_current_worker(
    received: signal.Signals,
) -> None:
    async def run_test() -> None:
        events: list[str] = []
        worker = LongWorker(events)
        logger = FakeLogger()
        callback: list[Callable[[signal.Signals], None]] = []
        cleanup_count = 0

        def registrar(
            registered: Callable[[signal.Signals], None],
        ) -> Callable[[], None]:
            callback.append(registered)

            def cleanup() -> None:
                nonlocal cleanup_count
                cleanup_count += 1

            return cleanup

        task = asyncio.create_task(
            run_worker(
                settings(worker_id="signal-worker"),
                database_factory=lambda url: FakeDatabase(  # type: ignore[arg-type]
                    url,
                    events,
                ),
                worker_factory=lambda **_options: worker,  # type: ignore[arg-type]
                signal_registrar=registrar,
                logger=logger,
            )
        )
        await asyncio.wait_for(worker.started.wait(), timeout=1)
        callback[0](received)
        callback[0](signal.SIGTERM if received == signal.SIGINT else signal.SIGINT)
        await asyncio.sleep(0)

        assert worker.stop_events[0].is_set()
        assert task.done() is False

        worker.release.set()
        await asyncio.wait_for(task, timeout=1)

        stopping_logs = [
            fields
            for _, _, fields in logger.events
            if fields.get("status") == "stopping"
        ]
        assert stopping_logs == [
            {
                "worker_id": "signal-worker",
                "signal": received.name,
                "status": "stopping",
            }
        ]
        assert cleanup_count == 1
        assert not _worker_lifecycle_tasks()

    asyncio.run(run_test())


def test_signal_registration_falls_back_when_loop_unsupported(
    monkeypatch,
) -> None:
    callbacks: list[signal.Signals] = []
    installed: dict[signal.Signals, Any] = {}

    class UnsupportedLoop:
        def add_signal_handler(self, *args: object) -> None:
            raise NotImplementedError

        def remove_signal_handler(self, *args: object) -> None:
            pass

    monkeypatch.setattr(signal, "getsignal", lambda current: f"old-{current.name}")
    monkeypatch.setattr(
        signal,
        "signal",
        lambda current, handler: installed.__setitem__(current, handler),
    )

    remove = install_signal_handlers(
        callbacks.append,
        loop=UnsupportedLoop(),  # type: ignore[arg-type]
    )
    installed[signal.SIGINT](signal.SIGINT, None)
    installed[signal.SIGTERM](signal.SIGTERM, None)
    remove()

    assert callbacks == [signal.SIGINT, signal.SIGTERM]
    assert installed[signal.SIGINT] == "old-SIGINT"
    assert installed[signal.SIGTERM] == "old-SIGTERM"


def _worker_lifecycle_tasks() -> list[asyncio.Task[Any]]:
    return [
        task
        for task in asyncio.all_tasks()
        if not task.done()
        and task.get_name().startswith(
            ("agent-signal:", "agent-process:", "agent-recovery:")
        )
    ]
