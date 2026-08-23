import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from riva.agents import PracticeRecommendationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole, StructuredGenerationRequest
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    PracticeAnswer,
    PracticeAttempt,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    TargetRole,
)
from riva.services.agent_runs import AgentRunService
from riva.services.recommendation_generation import (
    RecommendationGenerationService,
    RecommendationGenerationStateError,
    practice_recommendation_idempotency_key,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    PracticeRecommendationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_review_generation import (
    build_review_worker,
    database_url,
    enqueue_review,
    produce_evaluation,
    review_response,
)

pytestmark = pytest.mark.integration
START = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def recommendation_response(action: str) -> dict[str, object]:
    if action == "retryCurrent":
        return {
            "action": "retryCurrent",
            "reason": "The attribution gap is still important to practice.",
        }
    return {
        "action": "nextQuestion",
        "reason": "The current boundary is sufficiently exposed.",
        "nextQuestion": {
            "questionType": "behavioral",
            "difficulty": "basic",
            "focusAreas": ["Attribution evidence"],
        },
    }


def build_recommendation_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    handler = PracticeRecommendationHandler(
        session_factory=database.sessionmaker,
        agent=PracticeRecommendationAgent(
            provider,
            model="fake-recommendation-model",
        ),
    )
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id="recommendation-integration-worker",
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


async def produce_review(
    database: Database,
) -> tuple[object, PracticeSession, PracticeAttempt, AgentRun]:
    owner, practice_session, attempt = await produce_evaluation(database, "none")
    review_run = await enqueue_review(database, owner.id, attempt.id)
    review_provider = FakeLLMProvider(
        [review_response("CANONICAL REVIEW")],
        usage=LLMUsage(input_tokens=20, output_tokens=10),
    )
    assert await build_review_worker(database, review_provider).process_one()
    return owner, practice_session, attempt, review_run


async def enqueue_recommendation(
    database: Database,
    owner_id,
    attempt_id,
) -> AgentRun:
    async with database.sessionmaker() as session:
        return await RecommendationGenerationService(
            session,
            llm_model="fake-recommendation-model",
        ).enqueue_generation(
            user_id=owner_id,
            attempt_id=attempt_id,
            interaction_language="en",
            idempotency_key=practice_recommendation_idempotency_key(attempt_id),
        )


def test_real_evaluation_review_recommendation_uses_canonical_frozen_context() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, _review_run = await produce_review(
                    database
                )

                async with database.sessionmaker() as session:
                    card = await session.get(QuestionCard, attempt.question_card_id)
                    assert card is not None
                    profile = await session.get(CareerProfile, card.profile_id)
                    role = await session.get(
                        TargetRole,
                        practice_session.target_role_id,
                    )
                    matching_run = await session.get(
                        AgentRun,
                        card.matching_analysis_run_id,
                    )
                    answer = await session.scalar(
                        select(PracticeAnswer).where(
                            PracticeAnswer.attempt_id == attempt.id,
                            PracticeAnswer.kind == "main",
                        )
                    )
                    assert profile is not None
                    assert role is not None
                    assert matching_run is not None
                    assert answer is not None
                    profile.summary = "MUTATED_PROFILE"
                    role.raw_job_description = "MUTATED_JOB_DESCRIPTION"
                    matching_run.result = {"private": "MUTATED_MATCHING"}
                    answer.content = "MUTATED_RAW_ANSWER"
                    await session.commit()

                recommendation_run = await enqueue_recommendation(
                    database,
                    owner.id,
                    attempt.id,
                )
                assert recommendation_run.prompt_version == "2"
                assert recommendation_run.payload["trainingMemory"]["version"] == "1"
                assert (
                    "focusCompetencies" in recommendation_run.payload["trainingMemory"]
                )
                provider = FakeLLMProvider(
                    [recommendation_response("nextQuestion")],
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                assert await build_recommendation_worker(
                    database,
                    provider,
                ).process_one()

                assert isinstance(provider.calls[0], StructuredGenerationRequest)
                user_message = next(
                    message.content
                    for message in provider.calls[0].messages
                    if message.role is MessageRole.USER
                )
                assert "CANONICAL REVIEW" in user_message
                assert "MUTATED_PROFILE" not in user_message
                assert "MUTATED_JOB_DESCRIPTION" not in user_message
                assert "MUTATED_MATCHING" not in user_message
                assert "MUTATED_RAW_ANSWER" not in user_message

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, recommendation_run.id)
                    recommendation = await session.scalar(
                        select(PracticeRecommendation).where(
                            PracticeRecommendation.attempt_id == attempt.id
                        )
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert recommendation is not None
                    assert recommendation.source_agent_run_id == recommendation_run.id
                    assert recommendation.action == "nextQuestion"
                    assert recommendation.next_question_type == "behavioral"
                    assert recommendation.next_difficulty == "basic"
                    assert recommendation.focus_areas == ["Attribution evidence"]
                    assert stored_run.result is not None
                    assert stored_run.result["action"] == "nextQuestion"
                    assert stored_attempt is not None
                    assert stored_attempt.status == "evaluating"
                    assert stored_session is not None
                    assert stored_session.version == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_recommendation_retry_keeps_first_persisted_union_branch() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, _review_run = await produce_review(
                    database
                )
                recommendation_run = await enqueue_recommendation(
                    database,
                    owner.id,
                    attempt.id,
                )

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="first-recommendation-attempt",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == recommendation_run.id

                first_handler = PracticeRecommendationHandler(
                    session_factory=database.sessionmaker,
                    agent=PracticeRecommendationAgent(
                        FakeLLMProvider([recommendation_response("retryCurrent")]),
                        model="fake-recommendation-model",
                    ),
                )
                first_result = await first_handler.execute(claimed)
                assert first_result.output.action == "retryCurrent"

                now = datetime.now(UTC)
                async with database.sessionmaker() as session:
                    running = await session.get(AgentRun, recommendation_run.id)
                    assert running is not None
                    running.lease_expires_at = now - timedelta(seconds=1)
                    await session.commit()
                    assert (
                        await AgentRunService(
                            session,
                            clock=lambda: now,
                        ).requeue_expired()
                        == 1
                    )

                retry_provider = FakeLLMProvider(
                    [recommendation_response("nextQuestion")]
                )
                assert await build_recommendation_worker(
                    database,
                    retry_provider,
                ).process_one()

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, recommendation_run.id)
                    recommendations = list(
                        (
                            await session.scalars(
                                select(PracticeRecommendation).where(
                                    PracticeRecommendation.attempt_id == attempt.id
                                )
                            )
                        ).all()
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert len(recommendations) == 1
                    assert recommendations[0].action == "retryCurrent"
                    assert stored_run.result is not None
                    assert stored_run.result["action"] == "retryCurrent"
                    assert stored_attempt is not None
                    assert stored_attempt.status == "evaluating"
                    assert stored_session is not None
                    assert stored_session.version == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_recommendation_rejects_review_artifact_before_review_run_succeeds() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = await produce_evaluation(
                    database,
                    "none",
                )
                review_run = await enqueue_review(database, owner.id, attempt.id)
                async with database.sessionmaker() as session:
                    session.add(
                        PracticeReview(
                            id=uuid4(),
                            attempt_id=attempt.id,
                            source_agent_run_id=review_run.id,
                            overall_performance="Transient review",
                            highlights=[],
                            main_issues=[],
                            improvement_suggestions=[],
                            reusable_answer_structure=[],
                            exposed_weaknesses=[],
                            reviewed_at=START,
                        )
                    )
                    await session.commit()

                with pytest.raises(RecommendationGenerationStateError) as captured:
                    await enqueue_recommendation(database, owner.id, attempt.id)
                assert captured.value.code == (
                    "practice_recommendation_review_not_ready"
                )
            finally:
                await database.reset()

    asyncio.run(run_test())
