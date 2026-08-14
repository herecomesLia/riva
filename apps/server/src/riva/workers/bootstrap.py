import asyncio
from collections.abc import Callable
from datetime import timedelta
import os
import signal
import socket
from typing import Any

import structlog

from riva.agents import (
    FollowUpAgent,
    JobDescriptionParsingAgent,
    MatchingAnalysisAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReferenceAnswerAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
    ResumeParsingAgent,
)
from riva.core.config import Settings
from riva.db import Database
from riva.integrations import (
    LLMProvider,
    LLMProviderConfigurationError,
    build_llm_provider,
)
from riva.workers.handlers import AgentHandlerRegistry
from riva.workers.follow_up import FollowUpHandler
from riva.workers.job_description_parsing import (
    JobDescriptionParsingHandler,
)
from riva.workers.matching_analysis import MatchingAnalysisHandler
from riva.workers.practice_evaluation import PracticeEvaluationHandler
from riva.workers.practice_recommendation import PracticeRecommendationHandler
from riva.workers.practice_review import PracticeReviewHandler
from riva.workers.practice_reference_answer import PracticeReferenceAnswerHandler
from riva.workers.question_generation import QuestionGenerationHandler
from riva.workers.resume_parsing import ResumeParsingWorkerHandler
from riva.workers.runtime import AgentWorker, SessionFactory


DatabaseFactory = Callable[[str], Database]
ProviderFactory = Callable[[Settings], LLMProvider | None]
JobDescriptionAgentFactory = Callable[..., JobDescriptionParsingAgent]
JobDescriptionHandlerFactory = Callable[..., JobDescriptionParsingHandler]
MatchingAgentFactory = Callable[..., MatchingAnalysisAgent]
MatchingHandlerFactory = Callable[..., MatchingAnalysisHandler]
QuestionGenerationAgentFactory = Callable[..., QuestionGenerationAgent]
QuestionGenerationHandlerFactory = Callable[..., QuestionGenerationHandler]
FollowUpAgentFactory = Callable[..., FollowUpAgent]
FollowUpHandlerFactory = Callable[..., FollowUpHandler]
PracticeEvaluationAgentFactory = Callable[..., PracticeEvaluationAgent]
PracticeEvaluationHandlerFactory = Callable[..., PracticeEvaluationHandler]
PracticeRecommendationAgentFactory = Callable[..., PracticeRecommendationAgent]
PracticeRecommendationHandlerFactory = Callable[..., PracticeRecommendationHandler]
PracticeReviewAgentFactory = Callable[..., PracticeReviewAgent]
PracticeReviewHandlerFactory = Callable[..., PracticeReviewHandler]
PracticeReferenceAnswerAgentFactory = Callable[..., PracticeReferenceAnswerAgent]
PracticeReferenceAnswerHandlerFactory = Callable[..., PracticeReferenceAnswerHandler]
ResumeParsingAgentFactory = Callable[..., ResumeParsingAgent]
ResumeParsingHandlerFactory = Callable[..., ResumeParsingWorkerHandler]
RegistryFactory = Callable[
    [Settings, SessionFactory],
    AgentHandlerRegistry,
]
WorkerFactory = Callable[..., AgentWorker]
SignalCallback = Callable[[signal.Signals], None]
SignalRegistrar = Callable[[SignalCallback], Callable[[], None]]


def build_agent_handler_registry(
    settings: Settings,
    session_factory: SessionFactory,
    *,
    provider_factory: ProviderFactory = build_llm_provider,
    job_description_agent_factory: JobDescriptionAgentFactory = (
        JobDescriptionParsingAgent
    ),
    job_description_handler_factory: JobDescriptionHandlerFactory = (
        JobDescriptionParsingHandler
    ),
    matching_agent_factory: MatchingAgentFactory = MatchingAnalysisAgent,
    matching_handler_factory: MatchingHandlerFactory = MatchingAnalysisHandler,
    question_generation_agent_factory: QuestionGenerationAgentFactory = (
        QuestionGenerationAgent
    ),
    question_generation_handler_factory: QuestionGenerationHandlerFactory = (
        QuestionGenerationHandler
    ),
    follow_up_agent_factory: FollowUpAgentFactory = FollowUpAgent,
    follow_up_handler_factory: FollowUpHandlerFactory = FollowUpHandler,
    practice_evaluation_agent_factory: PracticeEvaluationAgentFactory = (
        PracticeEvaluationAgent
    ),
    practice_evaluation_handler_factory: PracticeEvaluationHandlerFactory = (
        PracticeEvaluationHandler
    ),
    practice_recommendation_agent_factory: PracticeRecommendationAgentFactory = (
        PracticeRecommendationAgent
    ),
    practice_recommendation_handler_factory: PracticeRecommendationHandlerFactory = (
        PracticeRecommendationHandler
    ),
    practice_review_agent_factory: PracticeReviewAgentFactory = PracticeReviewAgent,
    practice_review_handler_factory: PracticeReviewHandlerFactory = (
        PracticeReviewHandler
    ),
    practice_reference_answer_agent_factory: PracticeReferenceAnswerAgentFactory = (
        PracticeReferenceAnswerAgent
    ),
    practice_reference_answer_handler_factory: PracticeReferenceAnswerHandlerFactory = (
        PracticeReferenceAnswerHandler
    ),
    resume_parsing_agent_factory: ResumeParsingAgentFactory = ResumeParsingAgent,
    resume_parsing_handler_factory: ResumeParsingHandlerFactory = (
        ResumeParsingWorkerHandler
    ),
) -> AgentHandlerRegistry:
    registry = AgentHandlerRegistry()
    provider = provider_factory(settings)
    if provider is None:
        return registry

    model = (settings.llm_model or "").strip()
    if not model:
        raise LLMProviderConfigurationError from None

    job_description_agent = job_description_agent_factory(
        provider=provider,
        model=model,
    )
    job_description_handler = job_description_handler_factory(
        session_factory=session_factory,
        agent=job_description_agent,
    )
    matching_agent = matching_agent_factory(provider=provider, model=model)
    matching_handler = matching_handler_factory(
        session_factory=session_factory,
        agent=matching_agent,
    )
    question_generation_agent = question_generation_agent_factory(
        provider=provider,
        model=model,
    )
    question_generation_handler = question_generation_handler_factory(
        session_factory=session_factory,
        agent=question_generation_agent,
    )
    follow_up_agent = follow_up_agent_factory(
        provider=provider,
        model=model,
    )
    follow_up_handler = follow_up_handler_factory(
        session_factory=session_factory,
        agent=follow_up_agent,
    )
    practice_evaluation_agent = practice_evaluation_agent_factory(
        provider=provider,
        model=model,
    )
    practice_evaluation_handler = practice_evaluation_handler_factory(
        session_factory=session_factory,
        agent=practice_evaluation_agent,
    )
    practice_recommendation_agent = practice_recommendation_agent_factory(
        provider=provider,
        model=model,
    )
    practice_recommendation_handler = practice_recommendation_handler_factory(
        session_factory=session_factory,
        agent=practice_recommendation_agent,
    )
    practice_review_agent = practice_review_agent_factory(
        provider=provider,
        model=model,
    )
    practice_review_handler = practice_review_handler_factory(
        session_factory=session_factory,
        agent=practice_review_agent,
    )
    practice_reference_answer_agent = practice_reference_answer_agent_factory(
        provider=provider,
        model=model,
    )
    practice_reference_answer_handler = (
        practice_reference_answer_handler_factory(
            session_factory=session_factory,
            agent=practice_reference_answer_agent,
        )
    )
    resume_parsing_agent = resume_parsing_agent_factory(
        provider=provider,
        model=model,
    )
    resume_parsing_handler = resume_parsing_handler_factory(
        session_factory=session_factory,
        agent=resume_parsing_agent,
    )
    registry.register(job_description_handler)
    registry.register(matching_handler)
    registry.register(question_generation_handler)
    registry.register(follow_up_handler)
    registry.register(practice_evaluation_handler)
    registry.register(practice_recommendation_handler)
    registry.register(practice_review_handler)
    registry.register(practice_reference_answer_handler)
    registry.register(resume_parsing_handler)
    return registry


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
            registry = registry_factory(settings, database.sessionmaker)
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
