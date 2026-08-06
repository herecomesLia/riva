import asyncio
from collections.abc import Callable
from datetime import timedelta
import signal
from typing import Any

import pytest

from riva.agents import (
    JobDescriptionParsingAgent,
    MatchingAnalysisAgent,
    ResumeParsingAgent,
)
from riva.core.config import Settings
from riva.integrations import LLMProviderConfigurationError, QwenProvider
from riva.workers import (
    AgentHandlerRegistry,
    DuplicateAgentHandlerError,
    JobDescriptionParsingHandler,
    MatchingAnalysisHandler,
    ResumeParsingWorkerHandler,
)
from riva.workers.bootstrap import (
    build_agent_handler_registry,
    install_signal_handlers,
    resolve_worker_id,
    run_worker,
)
from tests.helpers.llm import FakeLLMProvider


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


class StubHandler:
    agent_id = "job-description-parser"

    async def execute(self, _run):
        raise AssertionError("handler must not execute in bootstrap tests")


class MatchingStubHandler:
    agent_id = "matching-analyzer"

    async def execute(self, _run):
        raise AssertionError("handler must not execute in bootstrap tests")


def settings(**overrides: object) -> Settings:
    overrides.setdefault("worker_id", None)
    overrides.setdefault("llm_provider", None)
    overrides.setdefault("llm_model", None)
    overrides.setdefault("llm_api_key", None)
    overrides.setdefault("llm_base_url", None)
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
    registry = build_agent_handler_registry(
        settings(),
        object(),  # type: ignore[arg-type]
    )

    assert len(registry) == 0
    assert registry.agent_ids == ()


def test_registry_without_provider_does_not_build_agent_or_handler() -> None:
    provider_calls: list[Settings] = []
    session_factory = object()

    def provider_factory(current: Settings):
        provider_calls.append(current)
        return None

    def unexpected_factory(**_options: object):
        raise AssertionError("factory must not be called")

    current = settings()
    registry = build_agent_handler_registry(
        current,
        session_factory,  # type: ignore[arg-type]
        provider_factory=provider_factory,
        job_description_agent_factory=unexpected_factory,
        job_description_handler_factory=unexpected_factory,
        matching_agent_factory=unexpected_factory,
        matching_handler_factory=unexpected_factory,
    )

    assert provider_calls == [current]
    assert len(registry) == 0


def test_registry_builds_configured_handler_once_with_normalized_model() -> None:
    current = settings(
        llm_provider="qwen",
        llm_model="  qwen-test-model  ",
        llm_api_key="test-api-key",
        llm_base_url="https://example.invalid/compatible-mode/v1",
    )
    session_factory = object()
    provider = FakeLLMProvider([])
    provider_calls: list[Settings] = []
    job_description_agent_calls: list[dict[str, object]] = []
    matching_agent_calls: list[dict[str, object]] = []
    resume_parsing_agent_calls: list[dict[str, object]] = []
    job_description_handler_calls: list[dict[str, object]] = []
    matching_handler_calls: list[dict[str, object]] = []
    resume_parsing_handler_calls: list[dict[str, object]] = []
    job_description_handlers: list[JobDescriptionParsingHandler] = []
    matching_handlers: list[MatchingAnalysisHandler] = []
    resume_parsing_handlers: list[ResumeParsingWorkerHandler] = []

    def provider_factory(received: Settings):
        provider_calls.append(received)
        return provider

    def job_description_agent_factory(
        **options: object,
    ) -> JobDescriptionParsingAgent:
        job_description_agent_calls.append(options)
        return JobDescriptionParsingAgent(**options)  # type: ignore[arg-type]

    def matching_agent_factory(**options: object) -> MatchingAnalysisAgent:
        matching_agent_calls.append(options)
        return MatchingAnalysisAgent(**options)  # type: ignore[arg-type]

    def resume_parsing_agent_factory(
        **options: object,
    ) -> ResumeParsingAgent:
        resume_parsing_agent_calls.append(options)
        return ResumeParsingAgent(**options)  # type: ignore[arg-type]

    def job_description_handler_factory(
        **options: object,
    ) -> JobDescriptionParsingHandler:
        job_description_handler_calls.append(options)
        handler = JobDescriptionParsingHandler(**options)  # type: ignore[arg-type]
        job_description_handlers.append(handler)
        return handler

    def matching_handler_factory(
        **options: object,
    ) -> MatchingAnalysisHandler:
        matching_handler_calls.append(options)
        handler = MatchingAnalysisHandler(**options)  # type: ignore[arg-type]
        matching_handlers.append(handler)
        return handler

    def resume_parsing_handler_factory(
        **options: object,
    ) -> ResumeParsingWorkerHandler:
        resume_parsing_handler_calls.append(options)
        handler = ResumeParsingWorkerHandler(**options)  # type: ignore[arg-type]
        resume_parsing_handlers.append(handler)
        return handler

    registry = build_agent_handler_registry(
        current,
        session_factory,  # type: ignore[arg-type]
        provider_factory=provider_factory,
        job_description_agent_factory=job_description_agent_factory,
        job_description_handler_factory=job_description_handler_factory,
        matching_agent_factory=matching_agent_factory,
        matching_handler_factory=matching_handler_factory,
        resume_parsing_agent_factory=resume_parsing_agent_factory,
        resume_parsing_handler_factory=resume_parsing_handler_factory,
    )

    assert provider_calls == [current]
    assert job_description_agent_calls == [
        {"provider": provider, "model": "qwen-test-model"}
    ]
    assert matching_agent_calls == [
        {"provider": provider, "model": "qwen-test-model"}
    ]
    assert resume_parsing_agent_calls == [
        {"provider": provider, "model": "qwen-test-model"}
    ]
    assert len(job_description_handler_calls) == 1
    assert len(matching_handler_calls) == 1
    assert len(resume_parsing_handler_calls) == 1
    assert job_description_handler_calls[0]["session_factory"] is session_factory
    assert matching_handler_calls[0]["session_factory"] is session_factory
    assert resume_parsing_handler_calls[0]["session_factory"] is session_factory
    job_description_agent = job_description_handler_calls[0]["agent"]
    matching_agent = matching_handler_calls[0]["agent"]
    resume_parsing_agent = resume_parsing_handler_calls[0]["agent"]
    assert isinstance(job_description_agent, JobDescriptionParsingAgent)
    assert isinstance(matching_agent, MatchingAnalysisAgent)
    assert isinstance(resume_parsing_agent, ResumeParsingAgent)
    assert job_description_agent.provider is provider
    assert matching_agent.provider is provider
    assert resume_parsing_agent.provider is provider
    assert job_description_handlers[0].agent is job_description_agent
    assert matching_handlers[0].agent is matching_agent
    assert resume_parsing_handlers[0].agent is resume_parsing_agent
    assert registry.get("job-description-parser") is job_description_handlers[0]
    assert registry.get("matching-analyzer") is matching_handlers[0]
    assert registry.get("resume-parser") is resume_parsing_handlers[0]
    assert registry.agent_ids == (
        "job-description-parser",
        "matching-analyzer",
        "resume-parser",
    )


def test_registry_builds_production_qwen_handler_without_network() -> None:
    registry = build_agent_handler_registry(
        settings(
            llm_provider="qwen",
            llm_model="  qwen-test-model  ",
            llm_api_key="test-api-key",
            llm_base_url="https://example.invalid/compatible-mode/v1",
        ),
        object(),  # type: ignore[arg-type]
    )

    handler = registry.get("job-description-parser")
    assert isinstance(handler, JobDescriptionParsingHandler)
    assert isinstance(handler.agent, JobDescriptionParsingAgent)
    assert isinstance(handler.agent.provider, QwenProvider)
    assert handler.agent.model == "qwen-test-model"
    matching = registry.get("matching-analyzer")
    assert isinstance(matching, MatchingAnalysisHandler)
    assert isinstance(matching.agent, MatchingAnalysisAgent)
    assert isinstance(matching.agent.provider, QwenProvider)
    assert matching.agent.provider is handler.agent.provider
    assert matching.agent.model == "qwen-test-model"
    resume_parsing = registry.get("resume-parser")
    assert isinstance(resume_parsing, ResumeParsingWorkerHandler)
    assert isinstance(resume_parsing.agent, ResumeParsingAgent)
    assert resume_parsing.agent.provider is handler.agent.provider
    assert resume_parsing.agent.model == "qwen-test-model"
    assert registry.agent_ids == (
        "job-description-parser",
        "matching-analyzer",
        "resume-parser",
    )


def test_registry_returns_empty_when_injected_provider_factory_returns_none() -> None:
    registry = build_agent_handler_registry(
        settings(llm_model=None),
        object(),  # type: ignore[arg-type]
        provider_factory=lambda _settings: None,
        job_description_agent_factory=lambda **_options: pytest.fail(
            "agent constructed"
        ),
        job_description_handler_factory=lambda **_options: pytest.fail(
            "handler constructed"
        ),
        matching_agent_factory=lambda **_options: pytest.fail(
            "agent constructed"
        ),
        matching_handler_factory=lambda **_options: pytest.fail(
            "handler constructed"
        ),
    )

    assert len(registry) == 0


def test_registry_rejects_empty_model_after_provider_is_constructed() -> None:
    provider = FakeLLMProvider([])

    with pytest.raises(LLMProviderConfigurationError):
        build_agent_handler_registry(
            settings(llm_model="   "),
            object(),  # type: ignore[arg-type]
            provider_factory=lambda _settings: provider,
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"llm_provider": "unknown"},
        {
            "llm_provider": "qwen",
            "llm_model": "qwen-test-model",
            "llm_base_url": "https://example.invalid/v1",
        },
        {
            "llm_provider": "qwen",
            "llm_api_key": "test-api-key",
            "llm_base_url": "https://example.invalid/v1",
        },
        {
            "llm_provider": "qwen",
            "llm_model": "qwen-test-model",
            "llm_api_key": "test-api-key",
        },
        {
            "llm_provider": "qwen",
            "llm_model": "qwen-test-model",
            "llm_api_key": "test-api-key",
            "llm_base_url": "not-a-url?private=value",
        },
    ],
)
def test_registry_propagates_safe_provider_configuration_errors(
    overrides: dict[str, object],
) -> None:
    secret = "test-api-key"

    with pytest.raises(LLMProviderConfigurationError) as captured:
        build_agent_handler_registry(
            settings(**overrides),
            object(),  # type: ignore[arg-type]
        )

    assert secret not in str(captured.value)
    assert "private=value" not in str(captured.value)


def test_registry_does_not_swallow_duplicate_handler_error() -> None:
    def duplicate_handler_factory(**_options: object):
        raise DuplicateAgentHandlerError

    with pytest.raises(DuplicateAgentHandlerError):
        build_agent_handler_registry(
            settings(llm_model="qwen-test-model"),
            object(),  # type: ignore[arg-type]
            provider_factory=lambda _settings: FakeLLMProvider([]),
            matching_handler_factory=duplicate_handler_factory,
        )


def test_run_worker_composes_database_registry_and_runtime() -> None:
    async def run_test() -> None:
        events: list[str] = []
        databases: list[FakeDatabase] = []
        workers: list[FakeWorker] = []
        worker_options: list[dict[str, object]] = []
        registry_calls: list[tuple[Settings, object]] = []
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

        current = settings(
            worker_id="configured-worker",
            worker_lease_seconds=400,
            worker_heartbeat_seconds=50,
            worker_poll_seconds=2,
            worker_requeue_seconds=70,
            worker_retry_base_seconds=12,
            worker_retry_max_seconds=120,
            worker_requeue_batch_size=25,
        )

        def registry_factory(
            received_settings: Settings,
            session_factory: object,
        ) -> AgentHandlerRegistry:
            events.append("registry.create")
            registry_calls.append((received_settings, session_factory))
            return AgentHandlerRegistry()

        await run_worker(
            current,
            database_factory=database_factory,  # type: ignore[arg-type]
            registry_factory=registry_factory,  # type: ignore[arg-type]
            worker_factory=worker_factory,  # type: ignore[arg-type]
            signal_registrar=no_signals,
            logger=logger,
        )

        assert events == [
            "database.enter",
            "database.ping",
            "registry.create",
            "worker.create",
            "worker.run",
            "database.exit",
        ]
        database = databases[0]
        assert database.dispose_count == 1
        assert database.create_tables_count == 0
        assert database.reset_count == 0
        assert registry_calls == [(current, database.sessionmaker)]
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
        assert any(
            level == "warning"
            and event == "agent.worker.registry"
            and fields.get("status") == "empty"
            for level, event, fields in logger.events
        )

    asyncio.run(run_test())


def test_run_worker_logs_registered_handler() -> None:
    async def run_test() -> None:
        events: list[str] = []
        logger = FakeLogger()
        registry = AgentHandlerRegistry()
        registry.register(StubHandler())  # type: ignore[arg-type]
        registry.register(MatchingStubHandler())  # type: ignore[arg-type]

        await run_worker(
            settings(),
            database_factory=lambda url: FakeDatabase(  # type: ignore[arg-type]
                url,
                events,
            ),
            registry_factory=lambda _settings, _sessions: registry,
            worker_factory=lambda **_options: FakeWorker(
                events
            ),  # type: ignore[arg-type]
            signal_registrar=no_signals,
            logger=logger,
        )

        starting = next(
            fields
            for _, _, fields in logger.events
            if fields.get("status") == "starting"
        )
        assert starting["handler_count"] == 2
        assert starting["agent_ids"] == [
            "job-description-parser",
            "matching-analyzer",
        ]
        assert not any(
            level == "warning" and fields.get("status") == "empty"
            for level, _, fields in logger.events
        )

    asyncio.run(run_test())


def test_registry_failure_disposes_database_before_worker_starts() -> None:
    async def run_test() -> None:
        events: list[str] = []
        database = FakeDatabase("postgresql://unused", events)
        logger = FakeLogger()
        worker_created = False
        signal_cleanup_count = 0
        api_key = "registry-test-api-key"

        def registry_factory(
            _settings: Settings,
            _session_factory: object,
        ) -> AgentHandlerRegistry:
            events.append("registry.create")
            raise LLMProviderConfigurationError

        def worker_factory(**_options: object) -> FakeWorker:
            nonlocal worker_created
            worker_created = True
            return FakeWorker(events)

        def signal_registrar(_callback) -> Callable[[], None]:
            def cleanup() -> None:
                nonlocal signal_cleanup_count
                signal_cleanup_count += 1

            return cleanup

        with pytest.raises(LLMProviderConfigurationError):
            await run_worker(
                settings(
                    llm_provider="qwen",
                    llm_model="qwen-test-model",
                    llm_api_key=api_key,
                    llm_base_url="https://example.invalid/v1",
                ),
                database_factory=lambda _url: database,  # type: ignore[arg-type]
                registry_factory=registry_factory,  # type: ignore[arg-type]
                worker_factory=worker_factory,  # type: ignore[arg-type]
                signal_registrar=signal_registrar,
                hostname_factory=lambda: "registry-host",
                pid_factory=lambda: 9,
                logger=logger,
            )

        assert events == [
            "database.enter",
            "database.ping",
            "registry.create",
            "database.exit",
        ]
        assert database.dispose_count == 1
        assert worker_created is False
        assert signal_cleanup_count == 1
        assert not _worker_lifecycle_tasks()
        failure = next(
            fields
            for level, _, fields in logger.events
            if level == "exception"
        )
        assert failure == {
            "worker_id": "registry-host-9",
            "status": "failed",
            "error_code": "agent_worker_failed",
        }
        assert api_key not in repr(logger.events)

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
