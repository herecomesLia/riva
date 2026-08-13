import asyncio

import pytest
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeRecommendation,
    PracticeReview,
    QuestionCard,
)
from riva.services.practice_sessions import PracticeSessionService
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    evaluation_output,
    produce_first_review,
    question_output,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration


async def _complete_retry_review(
    database: Database,
    *,
    user_id,
    session_id,
    question_id,
    expected_version: int,
    provider_prefix: str,
) -> int:
    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).submit_primary_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            content="The retry answer contains new evidence.",
        )
        next_version = submitted.session.version

    assert await build_worker(
        database,
        FollowUpAgent(
            FakeLLMProvider(
                [{"action": "complete"}],
                provider=f"{provider_prefix}-follow-up",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_follow_up_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=next_version,
        )
        next_version = evaluating.session.version

    assert await build_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider(
                [evaluation_output()],
                provider=f"{provider_prefix}-evaluation",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=next_version,
        )
        next_version = evaluating.session.version

    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider(
                [review_output()],
                provider=f"{provider_prefix}-review",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=next_version,
        )
        next_version = evaluating.session.version

    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider(
                [recommendation_output()],
                provider=f"{provider_prefix}-recommendation",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        review = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=next_version,
        )
        assert review.attempt.question_card_id == question_id
        assert review.attempt.status == "review"
        return review.session.version


async def _retry_snapshot(database: Database, session_id, user_id):
    async with database.sessionmaker() as session:
        attempts = list(
            (
                await session.scalars(
                    select(PracticeAttempt)
                    .where(PracticeAttempt.session_id == session_id)
                    .order_by(PracticeAttempt.attempt_number)
                )
            ).all()
        )
        question_runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "question-generator",
                    )
                )
            ).all()
        )
        cards = list(
            (
                await session.scalars(
                    select(QuestionCard).where(QuestionCard.user_id == user_id)
                )
            ).all()
        )
        return attempts, question_runs, cards


def test_practice_retry_real_workflow_reuses_question_and_replays() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_card_id,
                    first_run_id,
                    project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    first_answer = await session.scalar(
                        select(PracticeAnswer).where(
                            PracticeAnswer.attempt_id == first_attempt_id,
                            PracticeAnswer.kind == "main",
                        )
                    )
                    first_decision = await session.scalar(
                        select(PracticeFollowUpDecision).where(
                            PracticeFollowUpDecision.attempt_id == first_attempt_id
                        )
                    )
                    first_evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == first_attempt_id
                        )
                    )
                    first_review = await session.scalar(
                        select(PracticeReview).where(
                            PracticeReview.attempt_id == first_attempt_id
                        )
                    )
                    first_recommendation = await session.scalar(
                        select(PracticeRecommendation).where(
                            PracticeRecommendation.attempt_id == first_attempt_id
                        )
                    )
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    assert first_answer is not None
                    assert first_decision is not None
                    assert first_evaluation is not None
                    assert first_review is not None
                    assert first_recommendation is not None
                    assert first_attempt is not None
                    completed_at = first_attempt.completed_at
                    assert completed_at is not None
                    old_artifacts = (
                        first_answer.id,
                        first_answer.content,
                        first_decision.id,
                        first_decision.action,
                        first_evaluation.id,
                        first_evaluation.overall_score,
                        first_review.id,
                        first_review.overall_performance,
                        first_recommendation.id,
                        first_recommendation.action,
                    )

                attempts, question_runs, cards = await _retry_snapshot(
                    database,
                    session_id,
                    user_id,
                )
                assert len(attempts) == 1
                assert len(question_runs) == 1
                assert len(cards) == 1

                async with database.sessionmaker() as session:
                    retried = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_card_id,
                    )
                    assert retried.session.status == "active"
                    assert retried.session.version == 6
                    assert retried.attempt.attempt_number == 2
                    assert retried.attempt.status == "answering"
                    assert retried.attempt.retry_of_attempt_id == first_attempt_id
                    assert retried.attempt.question_card_id == first_card_id
                    assert retried.attempt.question_generation_run_id is None
                    assert retried.question_generation_run.id == first_run_id
                    assert retried.question_card.id == first_card_id
                    second_attempt_id = retried.attempt.id

                attempts, question_runs, cards = await _retry_snapshot(
                    database,
                    session_id,
                    user_id,
                )
                assert len(attempts) == 2
                assert len(question_runs) == 1
                assert len(cards) == 1
                assert attempts[0].status == "completed"
                assert attempts[0].completed_at == completed_at
                assert attempts[1].id == second_attempt_id

                async with database.sessionmaker() as session:
                    context = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).get_session_context(
                        user_id=user_id,
                        session_id=session_id,
                    )
                    assert context.attempt.id == second_attempt_id
                    assert context.attempt.status == "answering"
                    assert context.question_card is not None
                    assert context.question_card.id == first_card_id
                    assert context.question_generation_run.id == first_run_id

                async with database.sessionmaker() as session:
                    context = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).get_active_session_context(user_id=user_id)
                    assert context is not None
                    assert context.attempt.id == second_attempt_id
                    assert context.question_card is not None
                    assert context.question_card.id == first_card_id

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_card_id,
                    )
                    assert replay.attempt.id == second_attempt_id
                    assert replay.question_generation_run.id == first_run_id
                    assert replay.session.version == 6

                attempts, question_runs, cards = await _retry_snapshot(
                    database,
                    session_id,
                    user_id,
                )
                assert len(attempts) == 2
                assert len(question_runs) == 1
                assert len(cards) == 1

                version = await _complete_retry_review(
                    database,
                    user_id=user_id,
                    session_id=session_id,
                    question_id=first_card_id,
                    expected_version=6,
                    provider_prefix="practice-retry-attempt-two",
                )
                assert version == 9

                async with database.sessionmaker() as session:
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    second_attempt = await session.get(
                        PracticeAttempt,
                        second_attempt_id,
                    )
                    first_answer = await session.get(
                        PracticeAnswer,
                        old_artifacts[0],
                    )
                    first_decision = await session.get(
                        PracticeFollowUpDecision,
                        old_artifacts[2],
                    )
                    first_evaluation = await session.get(
                        PracticeEvaluation,
                        old_artifacts[4],
                    )
                    first_review = await session.get(
                        PracticeReview,
                        old_artifacts[6],
                    )
                    first_recommendation = await session.get(
                        PracticeRecommendation,
                        old_artifacts[8],
                    )
                    assert first_attempt is not None
                    assert second_attempt is not None
                    assert first_answer is not None
                    assert first_decision is not None
                    assert first_evaluation is not None
                    assert first_review is not None
                    assert first_recommendation is not None
                    assert first_attempt.status == "completed"
                    assert second_attempt.status == "review"
                    assert (
                        first_answer.id,
                        first_answer.content,
                        first_decision.id,
                        first_decision.action,
                        first_evaluation.id,
                        first_evaluation.overall_score,
                        first_review.id,
                        first_review.overall_performance,
                        first_recommendation.id,
                        first_recommendation.action,
                    ) == old_artifacts

                async with database.sessionmaker() as session:
                    third = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=9,
                        question_id=first_card_id,
                    )
                    assert third.session.version == 10
                    assert third.attempt.attempt_number == 3
                    assert third.attempt.status == "answering"
                    assert third.attempt.retry_of_attempt_id == second_attempt_id
                    assert third.attempt.question_card_id == first_card_id
                    assert third.attempt.question_generation_run_id is None
                    third_attempt_id = third.attempt.id

                attempts, question_runs, cards = await _retry_snapshot(
                    database,
                    session_id,
                    user_id,
                )
                assert len(attempts) == 3
                assert len(question_runs) == 1
                assert len(cards) == 1

                version = await _complete_retry_review(
                    database,
                    user_id=user_id,
                    session_id=session_id,
                    question_id=first_card_id,
                    expected_version=10,
                    provider_prefix="practice-retry-attempt-three",
                )
                assert version == 13

                async with database.sessionmaker() as session:
                    continued = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=13,
                        question_id=first_card_id,
                    )
                    assert continued.session.version == 14
                    assert continued.attempt.attempt_number == 4
                    assert continued.attempt.status == "generatingQuestion"
                    assert continued.attempt.retry_of_attempt_id is None
                    assert continued.attempt.question_card_id is None
                    assert continued.question_generation_run.id is not None
                    next_run_id = continued.question_generation_run.id
                    assert next_run_id != first_run_id

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain another payment decision.",
                                )
                            ],
                            provider="practice-retry-next-question",
                            usage=LLMUsage(input_tokens=20, output_tokens=10),
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    next_context = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).refresh_question_generation(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=14,
                    )
                    assert next_context.session.version == 15
                    assert next_context.attempt.attempt_number == 4
                    assert next_context.attempt.status == "answering"
                    assert next_context.attempt.question_generation_run_id == next_run_id
                    assert next_context.question_card is not None
                    assert next_context.question_card.id != first_card_id

                attempts, question_runs, cards = await _retry_snapshot(
                    database,
                    session_id,
                    user_id,
                )
                assert len(attempts) == 4
                assert len(question_runs) == 2
                assert len(cards) == 2
                assert attempts[0].status == "completed"
                assert attempts[1].status == "completed"
                assert attempts[2].status == "completed"
                assert attempts[3].status == "answering"
                assert attempts[2].id == third_attempt_id
            finally:
                await database.reset()

    asyncio.run(run_test())
