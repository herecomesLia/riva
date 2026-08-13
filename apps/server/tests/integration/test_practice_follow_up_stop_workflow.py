import asyncio
from uuid import UUID

import pytest
from sqlalchemy import select

from riva.agents import (
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    User,
)
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.evaluation_generation import practice_evaluation_idempotency_key
from riva.services.practice_sessions import (
    PracticeEvaluationWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
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
    build_worker,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration


def follow_up_question_output(order: int) -> dict[str, object]:
    return {
        "action": "askFollowUp",
        "prompt": f"What evidence supports follow-up {order}?",
        "focus": "Evidence",
        "answer_hints": ["Name the metric."],
        "answer_framework": ["Baseline", "Result"],
    }


async def prepare_answering_follow_up(database: Database) -> tuple[
    User,
    UUID,
    UUID,
    UUID,
    UUID,
]:
    """Create the real start -> question worker -> refresh -> main answer flow."""

    owner, role, _profile, project_id = await seed_context(database)
    async with database.sessionmaker() as session:
        started = await PracticeSessionService(
            session,
            llm_model="fake-question-model",
        ).start_session(
            user_id=owner.id,
            selection=PracticeSessionSelection(
                target_role_id=role.id,
                question_type=QuestionCardQuestionType.BEHAVIORAL,
                difficulty=QuestionCardDifficulty.BASIC,
                source="personalized",
                prioritize_weaknesses=False,
            ),
            interaction_language="en",
        )
        session_id = started.session.id
        attempt_id = started.attempt.id

    assert await build_question_worker(
        database,
        FakeLLMProvider(
            [question_response(project_id)],
            provider="practice-stop-question-provider",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        answering = await PracticeSessionService(
            session,
            llm_model="fake-question-model",
        ).refresh_question_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=1,
        )
        assert answering.attempt.status == "answering"
        assert answering.session.version == 2
        assert answering.question_card is not None
        question_id = answering.question_card.id

        submitted = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=session_id,
            expected_version=2,
            question_id=question_id,
            content="I owned the rollout and reduced failures.",
        )
        assert submitted.session.version == 3

    assert await build_follow_up_worker(
        database,
        FakeLLMProvider(
            [follow_up_question_output(1)],
            provider="practice-stop-follow-up-provider",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        answering_follow_up = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=3,
        )
        assert answering_follow_up.attempt.status == "answeringFollowUp"
        assert answering_follow_up.session.version == 4
        assert answering_follow_up.follow_up_question is not None
        follow_up_question_id = answering_follow_up.follow_up_question.id

    return owner, session_id, attempt_id, question_id, follow_up_question_id


async def stop_follow_up(
    database: Database,
    *,
    owner_id: UUID,
    session_id: UUID,
    question_id: UUID,
    follow_up_question_id: UUID,
) -> PracticeEvaluationWorkflowContext:
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            llm_model="fake-evaluation-model",
        ).end_follow_ups(
            user_id=owner_id,
            session_id=session_id,
            expected_version=4,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
        )


async def finish_evaluation_pipeline(
    database: Database,
    *,
    owner_id: UUID,
    session_id: UUID,
) -> PracticeReviewWorkflowContext:
    assert await build_evaluation_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider([evaluation_response()]),
            model="fake-evaluation-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluation_refresh = await PracticeSessionService(
            session,
            llm_model="fake-evaluation-model",
        ).refresh_evaluation_generation(
            user_id=owner_id,
            session_id=session_id,
            expected_version=5,
        )
        assert evaluation_refresh.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider([review_output()]),
            model="fake-review-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        review_refresh = await PracticeSessionService(
            session,
            llm_model="fake-evaluation-model",
        ).refresh_evaluation_generation(
            user_id=owner_id,
            session_id=session_id,
            expected_version=5,
        )
        assert review_refresh.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider([recommendation_output("retryCurrent")]),
            model="fake-recommendation-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        final = await PracticeSessionService(
            session,
            llm_model="fake-evaluation-model",
        ).refresh_evaluation_generation(
            user_id=owner_id,
            session_id=session_id,
            expected_version=5,
        )
    assert isinstance(final, PracticeReviewWorkflowContext)
    return final


def test_practice_follow_up_stop_replays_and_reaches_review_completed_session() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, question_id, follow_up_question_id = (
                    await prepare_answering_follow_up(database)
                )
                stopped = await stop_follow_up(
                    database,
                    owner_id=owner.id,
                    session_id=session_id,
                    question_id=question_id,
                    follow_up_question_id=follow_up_question_id,
                )
                assert stopped.attempt.status == "evaluating"
                assert stopped.session.status == "active"
                assert stopped.session.version == 5
                assert stopped.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                )
                assert stopped.follow_up_question is not None
                assert stopped.follow_up_question.id == follow_up_question_id
                assert stopped.follow_up_exchanges == ()

                async with database.sessionmaker() as session:
                    graph = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpDecision)
                                .where(
                                    PracticeFollowUpDecision.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    questions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpQuestion)
                                .where(
                                    PracticeFollowUpQuestion.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    answers = list(
                        (
                            await session.scalars(
                                select(PracticeAnswer).where(
                                    PracticeAnswer.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    evaluation_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "practice-evaluator",
                                )
                            )
                        ).all()
                    )
                    follow_up_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "follow-up-generator",
                                )
                            )
                        ).all()
                    )
                    persisted_session = await session.get(
                        PracticeSession,
                        session_id,
                    )
                    persisted_attempt = await session.get(
                        PracticeAttempt,
                        attempt_id,
                    )
                    assert persisted_session is not None
                    assert persisted_attempt is not None
                    assert persisted_session.status == "active"
                    assert persisted_session.completion_reason is None
                    assert persisted_session.completed_at is None
                    assert persisted_attempt.status == "evaluating"
                    assert persisted_attempt.completed_at is None
                    assert len(graph) == 1
                    assert graph[0].action == "askFollowUp"
                    assert graph[0].follow_up_question_id == follow_up_question_id
                    assert len(questions) == 1
                    assert questions[0].id == follow_up_question_id
                    assert len(answers) == 1
                    assert answers[0].kind == "main"
                    assert len(follow_up_runs) == 1
                    assert len(evaluation_runs) == 1
                    payload = EvaluationRunPayload.model_validate(
                        evaluation_runs[0].payload
                    )
                    assert payload.follow_up_completion_reason == (
                        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                    )
                    assert payload.terminal_follow_up_decision_id == graph[0].id
                    assert payload.unanswered_follow_up_question_id == (
                        follow_up_question_id
                    )
                    assert payload.follow_up_question_1_id is None
                    assert payload.follow_up_answer_1_id is None

                replay = await stop_follow_up(
                    database,
                    owner_id=owner.id,
                    session_id=session_id,
                    question_id=question_id,
                    follow_up_question_id=follow_up_question_id,
                )
                assert replay.session.version == stopped.session.version
                assert replay.evaluation_generation_run.id == (
                    stopped.evaluation_generation_run.id
                )
                assert replay.follow_up_question is not None
                assert replay.follow_up_question.id == follow_up_question_id

                async with database.sessionmaker() as session:
                    replay_decisions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpDecision).where(
                                    PracticeFollowUpDecision.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    replay_questions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpQuestion).where(
                                    PracticeFollowUpQuestion.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    replay_answers = list(
                        (
                            await session.scalars(
                                select(PracticeAnswer).where(
                                    PracticeAnswer.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    replay_evaluation_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "practice-evaluator",
                                )
                            )
                        ).all()
                    )
                    replay_follow_up_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "follow-up-generator",
                                )
                            )
                        ).all()
                    )
                    assert len(replay_decisions) == 1
                    assert len(replay_questions) == 1
                    assert len(replay_answers) == 1
                    assert len(replay_follow_up_runs) == 1
                    assert len(replay_evaluation_runs) == 1

                final = await finish_evaluation_pipeline(
                    database,
                    owner_id=owner.id,
                    session_id=session_id,
                )
                assert final.attempt.status == "review"
                assert final.session.version == 6
                assert final.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                )
                assert final.follow_up_question is not None
                assert final.follow_up_question.id == follow_up_question_id
                assert final.follow_up_exchanges == ()

                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-evaluation-model",
                    ).complete_session_after_review(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                    )
                    assert completed.session.status == "completed"
                    assert completed.session.version == 7
                    assert completed.session.completion_reason == "reviewCompleted"
                    assert (
                        completed.final_review_context.follow_up_completion_reason
                        == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_stop_review_can_retry_current_question() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, _attempt_id, question_id, follow_up_question_id = (
                    await prepare_answering_follow_up(database)
                )
                await stop_follow_up(
                    database,
                    owner_id=owner.id,
                    session_id=session_id,
                    question_id=question_id,
                    follow_up_question_id=follow_up_question_id,
                )
                final = await finish_evaluation_pipeline(
                    database,
                    owner_id=owner.id,
                    session_id=session_id,
                )

                async with database.sessionmaker() as session:
                    retried = await PracticeSessionService(
                        session,
                        llm_model="fake-question-model",
                    ).retry_current_question(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                        question_id=question_id,
                    )
                    assert retried.session.status == "active"
                    assert retried.session.version == 7
                    assert retried.attempt.status == "answering"
                    assert retried.question_card is not None
                    assert retried.question_card.id == question_id
                    assert retried.question_generation_run.id is not None
                    assert final.follow_up_completion_reason == (
                        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())
