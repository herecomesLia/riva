import asyncio

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
)
from riva.schemas.practice_sessions import (
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PracticeSessionService,
)
from tests.integration.test_practice_next_question_workflow import (
    database_url,
    produce_first_review,
)

pytestmark = pytest.mark.integration


async def _load_review_snapshot(
    session,
    *,
    user_id,
    session_id,
    attempt_id,
    card_id,
) -> tuple[tuple[object, ...], int, int, int]:
    card = await session.get(QuestionCard, card_id)
    answer = await session.scalar(
        select(PracticeAnswer).where(
            PracticeAnswer.attempt_id == attempt_id,
            PracticeAnswer.kind == "main",
        )
    )
    decision = await session.scalar(
        select(PracticeFollowUpDecision).where(
            PracticeFollowUpDecision.attempt_id == attempt_id
        )
    )
    evaluation = await session.scalar(
        select(PracticeEvaluation).where(PracticeEvaluation.attempt_id == attempt_id)
    )
    review = await session.scalar(
        select(PracticeReview).where(PracticeReview.attempt_id == attempt_id)
    )
    recommendation = await session.scalar(
        select(PracticeRecommendation).where(
            PracticeRecommendation.attempt_id == attempt_id
        )
    )
    assert card is not None
    assert answer is not None
    assert decision is not None
    assert evaluation is not None
    assert review is not None
    assert recommendation is not None
    artifacts = (
        card.id,
        card.source_agent_run_id,
        card.prompt,
        answer.id,
        answer.content,
        decision.id,
        decision.action,
        evaluation.id,
        evaluation.source_agent_run_id,
        evaluation.overall_score,
        review.id,
        review.source_agent_run_id,
        review.overall_performance,
        recommendation.id,
        recommendation.source_agent_run_id,
        recommendation.action,
        recommendation.next_question_type,
        recommendation.next_difficulty,
    )
    attempt_count = len(
        list(
            (
                await session.scalars(
                    select(PracticeAttempt).where(
                        PracticeAttempt.session_id == session_id
                    )
                )
            ).all()
        )
    )
    agent_run_count = len(
        list(
            (
                await session.scalars(
                    select(AgentRun).where(AgentRun.user_id == user_id)
                )
            ).all()
        )
    )
    question_run_count = len(
        list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "question-generator",
                    )
                )
            ).all()
        )
    )
    return artifacts, attempt_count, agent_run_count, question_run_count


def test_practice_completion_real_workflow_replay_release_and_new_session() -> None:
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
                    _project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    first_session = await session.get(PracticeSession, session_id)
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    assert first_session is not None
                    assert first_attempt is not None
                    assert first_session.status == "active"
                    assert first_session.version == 5
                    assert first_attempt.status == "review"
                    review_completed_at = first_attempt.completed_at
                    assert review_completed_at is not None
                    (
                        before_artifacts,
                        before_attempt_count,
                        before_agent_run_count,
                        before_question_run_count,
                    ) = await _load_review_snapshot(
                        session,
                        user_id=user_id,
                        session_id=session_id,
                        attempt_id=first_attempt_id,
                        card_id=first_card_id,
                    )

                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                    )
                    assert completed.session.id == session_id
                    assert completed.session.status == "completed"
                    assert completed.session.completion_reason == (
                        PracticeSessionCompletionReason.REVIEW_COMPLETED.value
                    )
                    assert completed.session.version == 6
                    assert completed.session.completed_at is not None
                    assert completed.session.completed_at.tzinfo is not None
                    assert completed.session.completed_at.utcoffset() is not None
                    assert completed.final_attempt.id == first_attempt_id
                    assert completed.final_attempt.status == "completed"
                    assert completed.final_attempt.completed_at == review_completed_at
                    assert completed.final_review_context.review.id is not None
                    assert completed.final_review_context.recommendation.id is not None
                    completed_at = completed.session.completed_at
                    completed_updated_at = completed.session.updated_at

                async with database.sessionmaker() as session:
                    (
                        after_artifacts,
                        attempt_count,
                        agent_run_count,
                        question_run_count,
                    ) = await _load_review_snapshot(
                        session,
                        user_id=user_id,
                        session_id=session_id,
                        attempt_id=first_attempt_id,
                        card_id=first_card_id,
                    )
                    stored_session = await session.get(
                        PracticeSession,
                        session_id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    assert stored_session is not None
                    assert stored_attempt is not None
                    assert after_artifacts == before_artifacts
                    assert attempt_count == before_attempt_count == 1
                    assert agent_run_count == before_agent_run_count
                    assert question_run_count == before_question_run_count == 1
                    assert stored_session.status == "completed"
                    assert stored_session.version == 6
                    assert stored_session.completed_at == completed_at
                    assert stored_attempt.status == "completed"
                    assert stored_attempt.completed_at == review_completed_at

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                    )
                    assert replay.session.id == session_id
                    assert replay.session.version == 6
                    assert replay.session.completed_at == completed_at
                    assert replay.session.updated_at == completed_updated_at
                    assert replay.final_attempt.id == first_attempt_id
                    assert replay.final_attempt.status == "completed"
                    assert replay.final_attempt.completed_at == review_completed_at

                async with database.sessionmaker() as session:
                    (
                        after_replay_artifacts,
                        replay_attempt_count,
                        replay_agent_run_count,
                        replay_question_run_count,
                    ) = await _load_review_snapshot(
                        session,
                        user_id=user_id,
                        session_id=session_id,
                        attempt_id=first_attempt_id,
                        card_id=first_card_id,
                    )
                    assert after_replay_artifacts == before_artifacts
                    assert replay_attempt_count == before_attempt_count == 1
                    assert replay_agent_run_count == before_agent_run_count
                    assert replay_question_run_count == before_question_run_count == 1

                async with database.sessionmaker() as session:
                    assert (
                        await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).get_active_session_context(user_id=user_id)
                    ) is None

                async with database.sessionmaker() as session:
                    old_session = await session.get(PracticeSession, session_id)
                    assert old_session is not None
                    started = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).start_session(
                        user_id=user_id,
                        selection=PracticeSessionSelection(
                            target_role_id=old_session.target_role_id,
                            question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                            difficulty=QuestionCardDifficulty.BASIC,
                            source="personalized",
                            prioritize_weaknesses=False,
                        ),
                        interaction_language=old_session.language,
                    )
                    assert started.session.id != session_id
                    assert started.session.status == "active"
                    assert started.session.version == 1
                    assert started.question_generation_run.id is not None
                    assert started.question_generation_run.id != first_run_id

                async with database.sessionmaker() as session:
                    old_session = await session.get(PracticeSession, session_id)
                    active_sessions = list(
                        (
                            await session.scalars(
                                select(PracticeSession).where(
                                    PracticeSession.user_id == user_id,
                                    PracticeSession.status == "active",
                                )
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
                    assert old_session is not None
                    assert old_session.status == "completed"
                    assert old_session.version == 6
                    assert len(active_sessions) == 1
                    assert len(question_runs) == before_question_run_count + 1
            finally:
                await database.reset()

    asyncio.run(run_test())
