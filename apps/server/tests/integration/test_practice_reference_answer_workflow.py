import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select

from riva.agents import (
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReferenceAnswerAgent,
    PracticeReviewAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    PracticeSession,
)
from riva.schemas.practice_reference_answer import (
    PracticeReferenceAnswerTargetType,
)
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PRACTICE_SESSION_VERSION_CONFLICT,
    PracticeSessionService,
    PracticeSessionStateError,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    ReferenceAnswerGenerationService,
    practice_main_reference_answer_idempotency_key,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    PracticeReferenceAnswerHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
    build_follow_up_worker,
    build_question_worker,
    evaluation_response,
    question_response,
)
from tests.integration.test_practice_review_workflow import (
    build_worker as build_review_or_recommendation_worker,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


def build_reference_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        PracticeReferenceAnswerHandler(
            session_factory=database.sessionmaker,
            agent=PracticeReferenceAnswerAgent(
                provider,
                model="fake-reference-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-reference-answer-workflow-worker",
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


def main_reference_response() -> dict[str, object]:
    return {
        "targetType": "main",
        "kind": "personalizedExample",
        "answer": "A canonical reference answer.",
        "keyPoints": [
            "State the decision.",
            "Connect it to evidence.",
        ],
        "commonMistakes": ["Inventing an unsupported metric."],
    }


def follow_up_reference_response() -> dict[str, object]:
    return {
        "targetType": "followUp",
        "kind": "personalizedSupplement",
        "addressedGap": "The answer needs measurable attribution.",
        "answer": "Tie the decision to the measurable outcome.",
        "keyPoints": [
            "Name the baseline.",
            "Connect the result to your action.",
        ],
        "commonMistakes": ["Claiming a team result as personal impact."],
    }


def follow_up_question_response(order: int) -> dict[str, object]:
    return {
        "action": "askFollowUp",
        "prompt": f"What evidence supports follow-up {order}?",
        "focus": "Attribution evidence",
        "answer_hints": ["Name the metric."],
        "answer_framework": ["Baseline", "Result"],
    }


async def start_answering_session(
    database: Database,
) -> tuple[object, UUID, UUID, UUID]:
    owner, role, _profile, project_id = await seed_context(database)
    selection = PracticeSessionSelection(
        target_role_id=role.id,
        question_type=QuestionCardQuestionType.BEHAVIORAL,
        difficulty=QuestionCardDifficulty.BASIC,
        source="personalized",
        prioritize_weaknesses=False,
    )
    async with database.sessionmaker() as session:
        started = await PracticeSessionService(
            session,
            llm_model="fake-question-model",
            clock=lambda: START,
        ).start_session(
            user_id=owner.id,
            selection=selection,
            interaction_language="en",
        )
        session_id = started.session.id
        attempt_id = started.attempt.id

    assert started.session.version == 1
    assert started.attempt.status == "generatingQuestion"
    assert await build_question_worker(
        database,
        FakeLLMProvider(
            [question_response(project_id)],
            provider="fake-question-provider",
            usage=LLMUsage(input_tokens=10, output_tokens=10),
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        answering = await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_question_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=1,
        )
        assert answering.session.version == 2
        assert answering.attempt.status == "answering"
        assert answering.question_card is not None
        question_id = answering.question_card.id
    return owner, session_id, attempt_id, question_id


async def request_main_reference(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
    version: int,
    question_id: UUID,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            llm_model="fake-reference-model",
            clock=lambda: START,
        ).request_question_reference_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=version,
            question_id=question_id,
        )


async def refresh_main_reference(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
    version: int,
    question_id: UUID,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_question_reference_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=version,
            question_id=question_id,
        )


async def prepare_follow_up_question(
    database: Database,
) -> tuple[object, UUID, UUID, UUID, UUID]:
    owner, session_id, attempt_id, question_id = await start_answering_session(
        database
    )
    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
            clock=lambda: START,
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=session_id,
            expected_version=2,
            question_id=question_id,
            content="I owned the rollout and reduced failures by 20 percent.",
        )
        main_answer_id = submitted.main_answer.id
    assert submitted.session.version == 3

    assert await build_follow_up_worker(
        database,
        FakeLLMProvider(
            [follow_up_question_response(1)],
            provider="fake-follow-up-provider",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        answering_follow_up = await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=3,
        )
        assert answering_follow_up.session.version == 4
        assert answering_follow_up.attempt.status == "answeringFollowUp"
        assert answering_follow_up.follow_up_question is not None
        follow_up_question_id = answering_follow_up.follow_up_question.id
    return owner, session_id, attempt_id, question_id, follow_up_question_id


async def defer_non_reference_runs(
    database: Database,
    *,
    user_id: UUID,
) -> None:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.status == AgentRunStatus.QUEUED,
                        AgentRun.agent_id != "practice-reference-answer-generator",
                    )
                )
            ).all()
        )
        for run in runs:
            run.available_at = datetime.now(UTC) + timedelta(days=1)
        await session.commit()


async def load_reference_runs(
    database: Database,
    *,
    user_id: UUID,
) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        return list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "practice-reference-answer-generator",
                    )
                )
            ).all()
        )


def test_practice_reference_answer_main_request_worker_refresh_and_recovery() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, question_id = (
                    await start_answering_session(database)
                )
                requested = await request_main_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=2,
                    question_id=question_id,
                )
                assert requested.session.version == 3
                assert requested.attempt.status == "answering"
                assert requested.generation_state.status is (
                    PracticeReferenceAnswerLifecycleStatus.GENERATING
                )

                runs = await load_reference_runs(database, user_id=owner.id)
                assert len(runs) == 1
                reference_run = runs[0]
                assert reference_run.status is AgentRunStatus.QUEUED
                assert reference_run.idempotency_key == (
                    practice_main_reference_answer_idempotency_key(question_id)
                )
                assert reference_run.payload["targetType"] == "main"
                assert reference_run.payload["questionCardId"] == str(question_id)
                async with database.sessionmaker() as session:
                    frozen_context = await session.get(
                        PracticeQuestionReferenceContext,
                        question_id,
                    )
                    assert frozen_context is not None
                assert reference_run.payload["expectedKind"] == (
                    "personalizedExample"
                )
                assert reference_run.payload["referenceContext"] == (
                    frozen_context.frozen_context
                )

                async with database.sessionmaker() as session:
                    recovered_queued = await ReferenceAnswerGenerationService(
                        session
                    ).get_main_generation_state(
                        user_id=owner.id,
                        question_card_id=question_id,
                        submitted_at=None,
                    )
                    assert recovered_queued.status is (
                        PracticeReferenceAnswerLifecycleStatus.GENERATING
                    )

                provider = FakeLLMProvider(
                    [main_reference_response()],
                    provider="fake-reference-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=20),
                )
                assert await build_reference_worker(database, provider).process_one()

                refreshed = await refresh_main_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=3,
                    question_id=question_id,
                )
                assert refreshed.session.version == 3
                assert refreshed.attempt.id == attempt_id
                assert refreshed.generation_state.status is (
                    PracticeReferenceAnswerLifecycleStatus.REVEALED
                )
                assert refreshed.generation_state.output is not None
                assert refreshed.generation_state.output.answer == (
                    "A canonical reference answer."
                )
                assert refreshed.generation_state.viewed_before_submission is True

                async with database.sessionmaker() as session:
                    stored_session = await session.get(PracticeSession, session_id)
                    stored_attempt = await session.get(PracticeAttempt, attempt_id)
                    context = await session.get(
                        PracticeQuestionReferenceContext,
                        question_id,
                    )
                    artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.source_agent_run_id
                            == reference_run.id
                        )
                    )
                    assert stored_session is not None
                    assert stored_attempt is not None
                    assert context is not None
                    assert artifact is not None
                    assert stored_session.version == 3
                    assert stored_attempt.status == "answering"
                    assert artifact.target_type == (
                        PracticeReferenceAnswerTargetType.MAIN
                    )
                    assert artifact.generated_at.tzinfo is not None

                    recovered = await ReferenceAnswerGenerationService(
                        session
                    ).get_main_generation_state(
                        user_id=owner.id,
                        question_card_id=question_id,
                        submitted_at=None,
                    )
                    assert recovered.status is (
                        PracticeReferenceAnswerLifecycleStatus.REVEALED
                    )
                    assert recovered.artifact is not None
                    assert recovered.artifact.id == artifact.id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_reference_answer_worker_succeeds_after_main_answer_progress() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, _attempt_id, question_id = (
                    await start_answering_session(database)
                )
                await request_main_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=2,
                    question_id=question_id,
                )
                submitted_at = datetime.now(UTC) - timedelta(days=1)
                async with database.sessionmaker() as session:
                    submitted = await PracticeSessionService(
                        session,
                        llm_model="fake-follow-up-model",
                        clock=lambda: submitted_at,
                    ).submit_primary_answer(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=3,
                        question_id=question_id,
                        content="The main answer was submitted before the worker.",
                    )
                assert submitted.session.version == 4
                assert submitted.main_answer.submitted_at == submitted_at
                await defer_non_reference_runs(database, user_id=owner.id)

                with pytest.raises(PracticeSessionStateError) as error:
                    await refresh_main_reference(
                        database,
                        user_id=owner.id,
                        session_id=session_id,
                        version=3,
                        question_id=question_id,
                    )
                assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT

                provider = FakeLLMProvider(
                    [main_reference_response()],
                    provider="fake-reference-provider",
                )
                assert await build_reference_worker(database, provider).process_one()

                async with database.sessionmaker() as session:
                    state = await ReferenceAnswerGenerationService(
                        session
                    ).get_main_generation_state(
                        user_id=owner.id,
                        question_card_id=question_id,
                        submitted_at=submitted.main_answer.submitted_at,
                    )
                    artifact_count = await session.scalar(
                        select(func.count()).select_from(
                            PracticeReferenceAnswerArtifact
                        ).where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == question_id,
                            PracticeReferenceAnswerArtifact.target_type
                            == PracticeReferenceAnswerTargetType.MAIN,
                        )
                    )
                    assert state.status is (
                        PracticeReferenceAnswerLifecycleStatus.REVEALED
                    )
                    assert state.viewed_before_submission is False
                    assert artifact_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_reference_answer_follow_up_request_refresh_and_q2_not_requested() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    _attempt_id,
                    question_id,
                    q1_id,
                ) = await prepare_follow_up_question(database)
                requested = await request_follow_up_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=4,
                    question_id=question_id,
                    follow_up_question_id=q1_id,
                )
                assert requested.session.version == 5
                assert requested.attempt.status == "answeringFollowUp"
                assert requested.follow_up_question is not None
                assert requested.follow_up_question.id == q1_id
                assert requested.generation_state.status is (
                    PracticeReferenceAnswerLifecycleStatus.GENERATING
                )

                q1_runs = await load_reference_runs(database, user_id=owner.id)
                assert len(q1_runs) == 1
                q1_run = q1_runs[0]
                assert q1_run.payload["targetType"] == "followUp"
                assert q1_run.payload["questionCardId"] == str(question_id)
                assert q1_run.payload["followUpQuestionId"] == str(q1_id)
                assert q1_run.payload["attemptId"] == str(_attempt_id)
                assert q1_run.payload["mainAnswerId"]
                assert q1_run.payload["previousFollowUps"] == []
                assert q1_run.payload["expectedKind"] == "personalizedSupplement"
                async with database.sessionmaker() as session:
                    frozen_context = await session.get(
                        PracticeQuestionReferenceContext,
                        question_id,
                    )
                    assert frozen_context is not None
                    assert q1_run.payload["referenceContext"] == (
                        frozen_context.frozen_context
                    )

                assert await build_reference_worker(
                    database,
                    FakeLLMProvider(
                        [follow_up_reference_response()],
                        provider="fake-reference-provider",
                    ),
                ).process_one()
                refreshed = await refresh_follow_up_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=5,
                    question_id=question_id,
                    follow_up_question_id=q1_id,
                )
                assert refreshed.session.version == 5
                assert refreshed.generation_state.status is (
                    PracticeReferenceAnswerLifecycleStatus.REVEALED
                )
                assert refreshed.generation_state.viewed_before_submission is True

                async with database.sessionmaker() as session:
                    q1_answer_context = await PracticeSessionService(
                        session,
                        clock=lambda: datetime.now(UTC) + timedelta(days=1),
                    ).submit_follow_up_answer(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=question_id,
                        follow_up_question_id=q1_id,
                        content="The result was measured against the baseline.",
                    )
                assert q1_answer_context.session.version == 6
                assert q1_answer_context.attempt.status == "answering"

                assert await build_follow_up_worker(
                    database,
                    FakeLLMProvider(
                        [follow_up_question_response(2)],
                        provider="fake-follow-up-provider",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    q2_context = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                    )
                    assert q2_context.session.version == 7
                    assert q2_context.follow_up_question is not None
                    q2_id = q2_context.follow_up_question.id
                    q2_state = await ReferenceAnswerGenerationService(
                        session
                    ).get_follow_up_generation_state(
                        user_id=owner.id,
                        question_card_id=question_id,
                        follow_up_question_id=q2_id,
                        submitted_at=None,
                    )
                    artifact_count = await session.scalar(
                        select(func.count()).select_from(
                            PracticeReferenceAnswerArtifact
                        ).where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == question_id,
                            PracticeReferenceAnswerArtifact.target_type
                            == PracticeReferenceAnswerTargetType.FOLLOW_UP,
                        )
                    )
                    assert q2_state.status is (
                        PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED
                    )
                    assert artifact_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


async def request_follow_up_reference(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
    version: int,
    question_id: UUID,
    follow_up_question_id: UUID,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            llm_model="fake-reference-model",
            clock=lambda: START,
        ).request_follow_up_reference_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
        )


async def refresh_follow_up_reference(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
    version: int,
    question_id: UUID,
    follow_up_question_id: UUID,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_follow_up_reference_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
        )


def test_practice_reference_answer_follow_up_worker_after_progress_uses_enqueued_context() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    _attempt_id,
                    question_id,
                    q1_id,
                ) = await prepare_follow_up_question(database)
                requested = await request_follow_up_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=4,
                    question_id=question_id,
                    follow_up_question_id=q1_id,
                )
                assert requested.session.version == 5
                q1_prompt = requested.follow_up_question.prompt  # type: ignore[union-attr]
                q1_focus = requested.follow_up_question.focus  # type: ignore[union-attr]
                late_answer = "LATE Q1 ANSWER MUST NOT ENTER REFERENCE INPUT."
                async with database.sessionmaker() as session:
                    submitted = await PracticeSessionService(
                        session,
                        clock=lambda: datetime.now(UTC) - timedelta(days=1),
                    ).submit_follow_up_answer(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=question_id,
                        follow_up_question_id=q1_id,
                        content=late_answer,
                    )
                assert submitted.session.version == 6
                await defer_non_reference_runs(database, user_id=owner.id)

                provider = FakeLLMProvider(
                    [follow_up_reference_response()],
                    provider="fake-reference-provider",
                )
                assert await build_reference_worker(database, provider).process_one()
                rendered = provider.calls[0].messages[-1].content
                assert "I owned the rollout and reduced failures by 20 percent." in rendered
                assert q1_prompt in rendered
                assert q1_focus in rendered
                assert late_answer not in rendered

                async with database.sessionmaker() as session:
                    state = await ReferenceAnswerGenerationService(
                        session
                    ).get_follow_up_generation_state(
                        user_id=owner.id,
                        question_card_id=question_id,
                        follow_up_question_id=q1_id,
                        submitted_at=submitted.follow_up_exchanges[0].answer.submitted_at,
                    )
                    assert state.status is (
                        PracticeReferenceAnswerLifecycleStatus.REVEALED
                    )
                    assert state.viewed_before_submission is False
                    artifact_count = await session.scalar(
                        select(func.count()).select_from(
                            PracticeReferenceAnswerArtifact
                        ).where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == question_id,
                            PracticeReferenceAnswerArtifact.follow_up_question_id
                            == q1_id,
                        )
                    )
                    assert artifact_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_reference_answer_retry_reuses_main_run_and_artifact() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, question_id = (
                    await start_answering_session(database)
                )
                await request_main_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=2,
                    question_id=question_id,
                )
                assert await build_reference_worker(
                    database,
                    FakeLLMProvider([main_reference_response()]),
                ).process_one()

                async with database.sessionmaker() as session:
                    submitted = await PracticeSessionService(
                        session,
                        llm_model="fake-follow-up-model",
                        clock=lambda: START,
                    ).submit_primary_answer(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=3,
                        question_id=question_id,
                        content="I owned the rollout and reduced failures.",
                    )
                assert submitted.session.version == 4
                assert await build_follow_up_worker(
                    database,
                    FakeLLMProvider([{"action": "complete"}]),
                ).process_one()
                async with database.sessionmaker() as session:
                    evaluating = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=4,
                    )
                assert evaluating.session.version == 5
                assert await build_evaluation_worker(
                    database,
                    PracticeEvaluationAgent(
                        FakeLLMProvider([evaluation_response()]),
                        model="fake-evaluation-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                    )
                assert await build_review_or_recommendation_worker(
                    database,
                    PracticeReviewAgent(
                        FakeLLMProvider([review_output()]),
                        model="fake-review-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                    )
                assert await build_review_or_recommendation_worker(
                    database,
                    PracticeRecommendationAgent(
                        FakeLLMProvider([recommendation_output("retryCurrent")]),
                        model="fake-recommendation-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    review = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                    )
                assert review.session.version == 6
                assert review.attempt.status == "review"

                async with database.sessionmaker() as session:
                    retry = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).retry_current_question(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                        question_id=question_id,
                    )
                assert retry.session.version == 7
                assert retry.attempt.status == "answering"
                assert retry.attempt.question_card_id == question_id
                assert retry.attempt.question_generation_run_id is None

                retried = await request_main_reference(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    version=7,
                    question_id=question_id,
                )
                assert retried.session.version == 8
                assert retried.generation_state.status is (
                    PracticeReferenceAnswerLifecycleStatus.REVEALED
                )
                assert retried.generation_state.viewed_before_submission is True
                runs = await load_reference_runs(database, user_id=owner.id)
                async with database.sessionmaker() as session:
                    artifact_count = await session.scalar(
                        select(func.count()).select_from(
                            PracticeReferenceAnswerArtifact
                        ).where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == question_id,
                            PracticeReferenceAnswerArtifact.target_type
                            == PracticeReferenceAnswerTargetType.MAIN,
                        )
                    )
                    stored_attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                assert len(runs) == 1
                assert artifact_count == 1
                assert len(stored_attempts) == 2
                assert attempt_id in {attempt.id for attempt in stored_attempts}
            finally:
                await database.reset()

    asyncio.run(run_test())
