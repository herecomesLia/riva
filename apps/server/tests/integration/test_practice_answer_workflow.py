import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeEvaluation,
    PracticeSession,
    QuestionCard,
    User,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.evaluation import EvaluationRunPayload
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.services.practice_sessions import (
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_question_generation_idempotency_key,
    practice_follow_up_idempotency_key,
)
from riva.services.evaluation_generation import practice_evaluation_idempotency_key
from riva.services.question_generation import QuestionGenerationService
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    FollowUpHandler,
    PracticeEvaluationHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


def question_response(
    project_id: UUID,
    *,
    question_type: str = "behavioral",
    difficulty: str = "basic",
) -> dict[str, object]:
    return {
        "prompt": "Tell me how you improved reliability.",
        "question_type": question_type,
        "difficulty": difficulty,
        "assessed_capabilities": ["Ownership"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "Untrusted label",
                "reason": "Relevant evidence.",
            }
        ],
        "answer_hints": ["Name the metric."],
        "answer_framework": ["Context", "Result"],
        "follow_up_directions": ["Probe attribution."],
        "scoring_focus": ["Evidence"],
    }


def build_question_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        QuestionGenerationHandler(
            session_factory=database.sessionmaker,
            agent=QuestionGenerationAgent(
                provider,
                model="fake-question-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-answer-question-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


def build_follow_up_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        FollowUpHandler(
            session_factory=database.sessionmaker,
            agent=FollowUpAgent(
                provider,
                model="fake-follow-up-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-answer-follow-up-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


def build_evaluation_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        PracticeEvaluationHandler(
            session_factory=database.sessionmaker,
            agent=PracticeEvaluationAgent(
                provider,
                model="fake-evaluation-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-answer-evaluation-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


def evaluation_response() -> dict[str, object]:
    return {
        "overallScore": 80,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 80,
                "explanation": f"Evidence supports {dimension}.",
            }
            for dimension in (
                "relevance",
                "structure",
                "specificity",
                "communication",
            )
        ],
        "focusAssessments": [
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "The answer provides evidence.",
            }
        ],
    }


async def seed_answering_session(
    database: Database,
) -> tuple[User, PracticeSession, PracticeAttempt, QuestionCard]:
    owner, role, _, project_id = await seed_context(database)
    async with database.sessionmaker() as session:
        question_run = await QuestionGenerationService(
            session,
            llm_model="fake-question-model",
        ).enqueue_generation(
            user_id=owner.id,
            target_role_id=role.id,
            question_type=QuestionCardQuestionType.BEHAVIORAL,
            difficulty=QuestionCardDifficulty.BASIC,
            interaction_language="en",
            idempotency_key=f"practice-answer-question:{role.id}",
        )

    assert await build_question_worker(
        database,
        FakeLLMProvider(
            [question_response(project_id)],
            provider="fake-question-provider",
            usage=LLMUsage(input_tokens=10, output_tokens=10),
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        card = await session.scalar(
            select(QuestionCard).where(
                QuestionCard.source_agent_run_id == question_run.id
            )
        )
        assert card is not None
        practice_session = PracticeSession(
            id=uuid4(),
            user_id=owner.id,
            target_role_id=role.id,
            language="en",
            version=2,
            status="active",
            initial_question_type="behavioral",
            initial_difficulty="basic",
            source="personalized",
            prioritize_weaknesses=False,
            started_at=START,
            created_at=START,
            updated_at=START,
        )
        attempt = PracticeAttempt(
            id=uuid4(),
            user_id=owner.id,
            session_id=practice_session.id,
            attempt_number=1,
            question_type="behavioral",
            difficulty="basic",
            status="answering",
            question_generation_run_id=question_run.id,
            question_card_id=card.id,
            created_at=START,
            updated_at=START,
        )
        question_run = await session.get(AgentRun, question_run.id)
        assert question_run is not None
        question_run.idempotency_key = practice_question_generation_idempotency_key(
            practice_session.id,
            attempt.id,
        )
        session.add_all([practice_session, attempt])
        await session.commit()
    return owner, practice_session, attempt, card


async def submit_answer(
    database: Database,
    *,
    owner_id: UUID,
    practice_session: PracticeSession,
    card: QuestionCard,
) -> tuple[PracticeSession, PracticeAttempt, AgentRun]:
    async with database.sessionmaker() as session:
        context = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
            clock=lambda: START,
        ).submit_primary_answer(
            user_id=owner_id,
            session_id=practice_session.id,
            expected_version=2,
            question_id=card.id,
            content="  I reduced failures by 20%.  ",
        )
        return (
            context.session,
            context.attempt,
            context.follow_up_generation_run,
        )


def test_practice_primary_answer_submit_is_atomic_and_idempotent() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = (
                    await seed_answering_session(database)
                )
                submitted_session, submitted_attempt, run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )

                assert submitted_session.version == 3
                assert submitted_attempt.status == "answering"
                async with database.sessionmaker() as session:
                    answers = list(
                        (
                            await session.scalars(
                                select(PracticeAnswer).where(
                                    PracticeAnswer.attempt_id == attempt.id
                                )
                            )
                        ).all()
                    )
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.idempotency_key
                                    == practice_follow_up_idempotency_key(
                                        attempt.id,
                                        1,
                                    ),
                                )
                            )
                        ).all()
                    )
                    assert len(answers) == 1
                    assert answers[0].content == "I reduced failures by 20%."
                    assert len(runs) == 1
                    assert runs[0].id == run.id
                    assert runs[0].status is AgentRunStatus.QUEUED

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).submit_primary_answer(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=2,
                        question_id=card.id,
                        content="I reduced failures by 20%.",
                    )
                    assert replay.session.version == 3
                    assert replay.main_answer.id == answers[0].id
                    assert replay.follow_up_generation_run.id == run.id
            finally:
                await database.reset()

    asyncio.run(run_test())


@pytest.mark.parametrize(
    "response",
    [
        {
            "action": "askFollowUp",
            "prompt": "What metric changed?",
            "focus": "Evidence",
            "answer_hints": ["Name the metric."],
            "answer_framework": ["Baseline", "Result"],
        },
        {"action": "complete"},
    ],
)
def test_practice_follow_up_refresh_reconciles_canonical_result(
    response: dict[str, object],
) -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, _, card = (
                    await seed_answering_session(database)
                )
                _, _, run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )
                assert await build_follow_up_worker(
                    database,
                    FakeLLMProvider([response]),
                ).process_one()

                async with database.sessionmaker() as session:
                    refreshed = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                    )
                    assert refreshed.session.version == 4
                    decision = await session.scalar(
                        select(PracticeFollowUpDecision).where(
                            PracticeFollowUpDecision.source_agent_run_id
                            == run.id
                        )
                    )
                    question = await session.scalar(
                        select(PracticeFollowUpQuestion).where(
                            PracticeFollowUpQuestion.source_agent_run_id
                            == run.id
                        )
                    )
                    assert decision is not None
                    if response["action"] == "askFollowUp":
                        assert refreshed.attempt.status == "answeringFollowUp"
                        assert decision.action == "askFollowUp"
                        assert question is not None
                        assert refreshed.follow_up_question is not None
                        assert refreshed.follow_up_question.id == question.id
                    else:
                        assert refreshed.attempt.status == "evaluating"
                        assert decision.action == "complete"
                        assert question is None
                        assert refreshed.follow_up_question is None
                    evaluation_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "practice-evaluator",
                                    AgentRun.idempotency_key
                                    == practice_evaluation_idempotency_key(
                                        refreshed.attempt.id
                                    ),
                                )
                            )
                        ).all()
                    )
                    if response["action"] == "askFollowUp":
                        assert evaluation_runs == []
                    else:
                        assert len(evaluation_runs) == 1
                        evaluation_run = evaluation_runs[0]
                        assert evaluation_run.status is AgentRunStatus.QUEUED
                        assert evaluation_run.prompt_id == (
                            PRACTICE_EVALUATION_PROMPT.prompt_id
                        )
                        assert EvaluationRunPayload.model_validate(
                            evaluation_run.payload
                        ).follow_up_completion_reason.value == (
                            "noFollowUpRequired"
                        )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_complete_refresh_runs_evaluation_and_get_stays_evaluating() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, _, card = (
                    await seed_answering_session(database)
                )
                _, _, follow_up_run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )
                assert await build_follow_up_worker(
                    database,
                    FakeLLMProvider([{"action": "complete"}]),
                ).process_one()

                async with database.sessionmaker() as session:
                    refreshed = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                    )
                    assert refreshed.attempt.status == "evaluating"
                    assert refreshed.session.version == 4
                    evaluation_run_id = (
                        refreshed.evaluation_generation_run.id
                    )  # type: ignore[attr-defined]

                async with database.sessionmaker() as session:
                    current = await PracticeSessionService(
                        session,
                    ).get_session_context(
                        user_id=owner.id,
                        session_id=practice_session.id,
                    )
                    assert current.attempt.status == "evaluating"
                    assert current.session.version == 4
                    assert current.evaluation_generation_run.id == evaluation_run_id  # type: ignore[attr-defined]
                    assert current.evaluation is None  # type: ignore[attr-defined]

                assert await build_evaluation_worker(
                    database,
                    FakeLLMProvider([evaluation_response()]),
                ).process_one()

                async with database.sessionmaker() as session:
                    evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id
                            == refreshed.attempt.id
                        )
                    )
                    stored_run = await session.get(
                        AgentRun,
                        evaluation_run_id,
                    )
                    assert evaluation is not None
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED

                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                    )
                    assert replay.session.version == 4
                    assert replay.attempt.status == "evaluating"
                    assert replay.evaluation_generation_run.id == evaluation_run_id  # type: ignore[attr-defined]
                    assert replay.evaluation is evaluation  # type: ignore[attr-defined]
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_refresh_replays_without_second_version_increment() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, _, card = (
                    await seed_answering_session(database)
                )
                _, _, run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )
                await build_follow_up_worker(
                    database,
                    FakeLLMProvider(
                        [
                            {
                                "action": "askFollowUp",
                                "prompt": "What metric changed?",
                                "focus": "Evidence",
                                "answer_hints": ["Name the metric."],
                                "answer_framework": ["Baseline", "Result"],
                            }
                        ]
                    ),
                ).process_one()

                async with database.sessionmaker() as session:
                    first = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                    )
                    first_question_id = first.follow_up_question.id  # type: ignore[union-attr]
                    assert first.session.version == 4

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                    )
                    assert replay.session.version == 4
                    assert replay.attempt.status == "answeringFollowUp"
                    assert replay.follow_up_question is not None
                    assert replay.follow_up_question.id == first_question_id
                    assert await session.scalar(
                        select(func.count()).select_from(PracticeFollowUpDecision)
                    ) == 1
                    assert await session.scalar(
                        select(func.count()).select_from(PracticeFollowUpQuestion)
                    ) == 1
                    stored_run = await session.get(AgentRun, run.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_primary_answer_rolls_back_against_real_database() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = (
                    await seed_answering_session(database)
                )

                class FailingFollowUpService:
                    async def enqueue_generation_in_transaction(
                        self,
                        **kwargs: object,
                    ) -> AgentRun:
                        raise RuntimeError("follow-up enqueue failed")

                with pytest.raises(RuntimeError, match="enqueue failed"):
                    async with database.sessionmaker() as session:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-follow-up-model",
                            follow_up_generation_service_factory=lambda _session, **kwargs: FailingFollowUpService(),  # type: ignore[arg-type]
                            clock=lambda: START,
                        ).submit_primary_answer(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=2,
                            question_id=card.id,
                            content="A valid answer",
                        )

                async with database.sessionmaker() as session:
                    assert await session.scalar(
                        select(func.count())
                        .select_from(PracticeAnswer)
                        .where(PracticeAnswer.attempt_id == attempt.id)
                    ) == 0
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        attempt.id,
                    )
                    assert stored_session is not None
                    assert stored_session.version == 2
                    assert stored_attempt is not None
                    assert stored_attempt.status == "answering"
                    assert await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "follow-up-generator",
                        )
                    ) == 0
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_evaluation_enqueue_rolls_back_without_removing_follow_up() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = (
                    await seed_answering_session(database)
                )
                _, _, follow_up_run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )
                assert await build_follow_up_worker(
                    database,
                    FakeLLMProvider([{"action": "complete"}]),
                ).process_one()

                class FailingEvaluationService:
                    async def enqueue_generation_in_transaction(
                        self,
                        **kwargs: object,
                    ) -> AgentRun:
                        raise RuntimeError("evaluation enqueue failed")

                with pytest.raises(RuntimeError, match="evaluation enqueue failed"):
                    async with database.sessionmaker() as session:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-evaluation-model",
                            evaluation_generation_service_factory=lambda _session, **kwargs: FailingEvaluationService(),  # type: ignore[arg-type]
                            clock=lambda: START,
                        ).refresh_follow_up_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=3,
                        )

                async with database.sessionmaker() as session:
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        attempt.id,
                    )
                    assert stored_session is not None
                    assert stored_session.version == 3
                    assert stored_attempt is not None
                    assert stored_attempt.status == "answering"
                    assert await session.scalar(
                        select(func.count())
                        .select_from(PracticeFollowUpDecision)
                        .where(
                            PracticeFollowUpDecision.source_agent_run_id
                            == follow_up_run.id
                        )
                    ) == 1
                    assert await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "practice-evaluator",
                        )
                    ) == 0
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_failed_refresh_does_not_change_session() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = (
                    await seed_answering_session(database)
                )
                _, _, run = await submit_answer(
                    database,
                    owner_id=owner.id,
                    practice_session=practice_session,
                    card=card,
                )
                async with database.sessionmaker() as session:
                    failed = await session.get(AgentRun, run.id)
                    assert failed is not None
                    failed.status = AgentRunStatus.FAILED
                    failed.attempt_count = 1
                    failed.started_at = START
                    failed.finished_at = START
                    failed.error_code = "provider_unavailable"
                    failed.lease_owner = None
                    failed.lease_token = None
                    failed.lease_expires_at = None
                    failed.result = None
                    failed.provider = None
                    failed.input_tokens = None
                    failed.output_tokens = None
                    await session.commit()

                with pytest.raises(PracticeSessionStateError) as error:
                    async with database.sessionmaker() as session:
                        await PracticeSessionService(
                            session,
                            clock=lambda: START,
                        ).refresh_follow_up_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=3,
                        )
                assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_FAILED

                async with database.sessionmaker() as session:
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        attempt.id,
                    )
                    assert stored_session is not None
                    assert stored_session.version == 3
                    assert stored_attempt is not None
                    assert stored_attempt.status == "answering"
            finally:
                await database.reset()

    asyncio.run(run_test())
