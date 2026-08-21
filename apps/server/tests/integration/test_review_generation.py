import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from riva.agents import PracticeReviewAgent
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole, StructuredGenerationRequest
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    TargetRole,
)
from riva.services.agent_runs import AgentRunService
from riva.services.review_generation import (
    ReviewGenerationService,
    ReviewGenerationStateError,
    practice_review_idempotency_key,
)
from riva.workers import AgentHandlerRegistry, AgentWorker, PracticeReviewHandler
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_evaluation_generation import (
    build_worker as build_evaluation_worker,
)
from tests.integration.test_evaluation_generation import (
    database_url,
    evaluation_response,
    prepare_context,
)
from tests.integration.test_evaluation_generation import (
    enqueue as enqueue_evaluation,
)

pytestmark = pytest.mark.integration
START = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def review_response(overall: str) -> dict[str, object]:
    return {
        "overallPerformance": overall,
        "highlights": ["The answer shows ownership."],
        "mainIssues": ["Attribution evidence is brief."],
        "improvementSuggestions": ["Name the baseline and measured result."],
        "reusableAnswerStructure": ["Context", "Evidence", "Result"],
        "exposedWeaknesses": ["Attribution evidence"],
    }


def build_review_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    handler = PracticeReviewHandler(
        session_factory=database.sessionmaker,
        agent=PracticeReviewAgent(provider, model="fake-review-model"),
    )
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id="review-integration-worker",
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


async def produce_evaluation(
    database: Database,
    shape: str,
) -> tuple[object, PracticeSession, PracticeAttempt]:
    owner, practice_session, attempt = await prepare_context(database, shape)
    reason = "noFollowUpRequired" if shape == "none" else "allAnswered"
    evaluation_run = await enqueue_evaluation(
        database,
        owner.id,
        attempt.id,
        reason,
    )
    evaluation_provider = FakeLLMProvider(
        [evaluation_response(80)],
        usage=LLMUsage(input_tokens=20, output_tokens=10),
    )
    assert await build_evaluation_worker(database, evaluation_provider).process_one()
    return owner, practice_session, attempt


async def enqueue_review(
    database: Database,
    owner_id,
    attempt_id,
) -> AgentRun:
    async with database.sessionmaker() as session:
        return await ReviewGenerationService(
            session,
            llm_model="fake-review-model",
        ).enqueue_generation(
            user_id=owner_id,
            attempt_id=attempt_id,
            interaction_language="en",
            idempotency_key=practice_review_idempotency_key(attempt_id),
        )


@pytest.mark.parametrize("shape", ["none", "one"])
def test_real_evaluation_to_review_worker_uses_frozen_canonical_lineage(
    shape: str,
) -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = await produce_evaluation(
                    database,
                    shape,
                )

                async with database.sessionmaker() as session:
                    evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == attempt.id
                        )
                    )
                    assert evaluation is not None
                    review_run = await ReviewGenerationService(
                        session,
                        llm_model="fake-review-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        attempt_id=attempt.id,
                        interaction_language="en",
                        idempotency_key=practice_review_idempotency_key(attempt.id),
                    )
                    assert review_run.status is AgentRunStatus.QUEUED
                    assert review_run.max_attempts == 3
                    assert review_run.payload == {
                        "attemptId": str(attempt.id),
                        "evaluationId": str(evaluation.id),
                        "interactionLanguage": "en",
                    }

                    card = await session.get(QuestionCard, attempt.question_card_id)
                    assert card is not None
                    profile = await session.get(CareerProfile, card.profile_id)
                    role = await session.get(
                        TargetRole,
                        practice_session.target_role_id,
                    )
                    assert profile is not None
                    assert role is not None
                    matching_run = await session.get(
                        AgentRun,
                        card.matching_analysis_run_id,
                    )
                    assert matching_run is not None
                    profile.summary = "REVIEW_MUTATED_PROFILE"
                    role.raw_job_description = "REVIEW_MUTATED_JD"
                    matching_run.result = {"private": "REVIEW_MUTATED_MATCHING"}
                    await session.commit()

                provider = FakeLLMProvider(
                    [review_response("CANONICAL REVIEW")],
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                assert await build_review_worker(database, provider).process_one()

                assert isinstance(provider.calls[0], StructuredGenerationRequest)
                user_message = next(
                    message.content
                    for message in provider.calls[0].messages
                    if message.role is MessageRole.USER
                )
                assert "I owned the rollout and reduced failures." in user_message
                assert "overall_score" in user_message
                assert "dimension_scores" in user_message
                assert "REVIEW_MUTATED_PROFILE" not in user_message
                assert "REVIEW_MUTATED_JD" not in user_message
                assert "REVIEW_MUTATED_MATCHING" not in user_message
                if shape == "one":
                    assert "Failure rate fell by 20%." in user_message

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, review_run.id)
                    review = await session.scalar(
                        select(PracticeReview).where(
                            PracticeReview.attempt_id == attempt.id
                        )
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert review is not None
                    assert review.attempt_id == attempt.id
                    assert review.source_agent_run_id == review_run.id
                    assert review.overall_performance == "CANONICAL REVIEW"
                    assert review.reviewed_at.tzinfo is not None
                    assert stored_run.result is not None
                    assert stored_run.result["overall_performance"] == (
                        "CANONICAL REVIEW"
                    )
                    assert stored_attempt is not None
                    assert stored_attempt.status == "evaluating"
                    assert stored_session is not None
                    assert stored_session.version == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_real_review_retry_keeps_first_persisted_review_and_agent_result() -> None:
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
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="first-review-attempt",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == review_run.id

                first_handler = PracticeReviewHandler(
                    session_factory=database.sessionmaker,
                    agent=PracticeReviewAgent(
                        FakeLLMProvider([review_response("FIRST")]),
                        model="fake-review-model",
                    ),
                )
                first_result = await first_handler.execute(claimed)
                assert first_result.output.overall_performance == "FIRST"

                now = datetime.now(UTC)
                async with database.sessionmaker() as session:
                    running = await session.get(AgentRun, review_run.id)
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

                retry_provider = FakeLLMProvider([review_response("SECOND")])
                assert await build_review_worker(database, retry_provider).process_one()

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, review_run.id)
                    reviews = list(
                        (
                            await session.scalars(
                                select(PracticeReview).where(
                                    PracticeReview.attempt_id == attempt.id
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
                    assert len(reviews) == 1
                    assert reviews[0].overall_performance == "FIRST"
                    assert stored_run.result is not None
                    assert stored_run.result["overall_performance"] == "FIRST"
                    assert stored_attempt is not None
                    assert stored_attempt.status == "evaluating"
                    assert stored_session is not None
                    assert stored_session.version == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_review_enqueue_rejects_evaluation_artifact_before_source_run_succeeds() -> (
    None
):
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, _practice_session, attempt = await prepare_context(
                    database,
                    "none",
                )
                async with database.sessionmaker() as session:
                    evaluation_run = await enqueue_evaluation(
                        database,
                        owner.id,
                        attempt.id,
                        "noFollowUpRequired",
                    )
                    evaluation = PracticeEvaluation(
                        id=uuid4(),
                        attempt_id=attempt.id,
                        source_agent_run_id=evaluation_run.id,
                        overall_score=80,
                        dimension_scores=[],
                        focus_assessments=[],
                        evaluated_at=START,
                    )
                    session.add(evaluation)
                    await session.commit()

                with pytest.raises(ReviewGenerationStateError) as captured:
                    await enqueue_review(database, owner.id, attempt.id)
                assert captured.value.code == "practice_review_evaluation_not_ready"
            finally:
                await database.reset()

    asyncio.run(run_test())
