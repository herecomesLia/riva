import asyncio

import pytest
from sqlalchemy import select

from riva.agents import QuestionGenerationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
)
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PracticeEndedEarlySessionWorkflowContext,
    PracticeSessionService,
)
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    produce_first_review,
    question_output,
)
from tests.integration.test_question_generation import database_url, seed_context
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration


async def _produce_answering_session(
    database: Database,
) -> tuple[object, object, object, object, object, object]:
    owner, role, _profile, project_id = await seed_context(database)
    selection = PracticeSessionSelection(
        target_role_id=role.id,
        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        difficulty=QuestionCardDifficulty.BASIC,
        source="personalized",
        prioritize_weaknesses=False,
    )
    async with database.sessionmaker() as session:
        started = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).start_session(
            user_id=owner.id,
            selection=selection,
            interaction_language="en",
        )
        session_id = started.session.id
        attempt_id = started.attempt.id
        question_run_id = started.question_generation_run.id

    assert question_run_id is not None
    assert await build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [
                    question_output(
                        project_id,
                        prompt="Explain how you improved the payment workflow.",
                    )
                ],
                provider="practice-early-completion-answering-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        answering = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_question_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=1,
        )
        assert answering.session.version == 2
        assert answering.attempt.status == "answering"
        assert answering.question_card is not None
        question_id = answering.question_card.id

    return owner.id, role.id, session_id, attempt_id, question_id, question_run_id


async def _attempt_artifact_counts(database: Database, attempt_id) -> dict[str, int]:
    async with database.sessionmaker() as session:
        counts = {}
        for name, model in (
            ("answers", PracticeAnswer),
            ("follow_up_questions", PracticeFollowUpQuestion),
            ("follow_up_decisions", PracticeFollowUpDecision),
            ("evaluations", PracticeEvaluation),
            ("reviews", PracticeReview),
            ("recommendations", PracticeRecommendation),
        ):
            counts[name] = len(
                (
                    await session.scalars(
                        select(model).where(model.attempt_id == attempt_id)
                    )
                ).all()
            )
        return counts


def test_practice_early_completion_first_question_replays_and_releases_active_session() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    role_id,
                    session_id,
                    attempt_id,
                    question_id,
                    question_run_id,
                ) = await _produce_answering_session(database)
                before_counts = await _attempt_artifact_counts(database, attempt_id)
                assert before_counts == {
                    "answers": 0,
                    "follow_up_questions": 0,
                    "follow_up_decisions": 0,
                    "evaluations": 0,
                    "reviews": 0,
                    "recommendations": 0,
                }

                async with database.sessionmaker() as session:
                    ended = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).end_session_early(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=2,
                        question_id=question_id,
                    )
                    assert isinstance(
                        ended,
                        PracticeEndedEarlySessionWorkflowContext,
                    )
                    first_session_completed_at = ended.session.completed_at
                    first_attempt_completed_at = ended.unfinished_attempt.completed_at
                    assert ended.session.version == 3
                    assert ended.session.status == "completed"
                    assert ended.session.completion_reason == "userEndedEarly"
                    assert ended.unfinished_attempt.status == "endedEarly"
                    assert ended.unfinished_attempt.question_card_id == question_id
                    assert ended.question_context.question_card is not None
                    assert ended.question_context.question_card.id == question_id

                async with database.sessionmaker() as session:
                    attempt = await session.get(PracticeAttempt, attempt_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    card = await session.get(QuestionCard, question_id)
                    question_run = await session.get(AgentRun, question_run_id)
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
                    assert attempt is not None
                    assert practice_session is not None
                    assert card is not None
                    assert question_run is not None
                    assert attempt.status == "endedEarly"
                    assert attempt.completed_at == first_attempt_completed_at
                    assert practice_session.completed_at == first_session_completed_at
                    assert len(question_runs) == 1
                    assert card.id == question_id

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).end_session_early(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=2,
                        question_id=question_id,
                    )
                    assert replay.session.version == 3
                    assert replay.unfinished_attempt.id == attempt_id
                    assert replay.session.completed_at == first_session_completed_at
                    assert replay.unfinished_attempt.completed_at == (
                        first_attempt_completed_at
                    )

                assert await _attempt_artifact_counts(database, attempt_id) == before_counts
                async with database.sessionmaker() as session:
                    active_context = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).get_active_session_context(user_id=user_id)
                    assert active_context is None

                    new_session = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).start_session(
                        user_id=user_id,
                        selection=PracticeSessionSelection(
                            target_role_id=role_id,
                            question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                            difficulty=QuestionCardDifficulty.BASIC,
                            source="personalized",
                            prioritize_weaknesses=False,
                        ),
                        interaction_language="en",
                    )
                    assert new_session.session.id != session_id
                    assert new_session.session.status == "active"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_early_completion_after_previous_review_keeps_previous_attempt_canonical() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_question_id,
                    first_question_run_id,
                    project_id,
                ) = await produce_first_review(database)
                async with database.sessionmaker() as session:
                    continued = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_question_id,
                    )
                    second_attempt_id = continued.attempt.id
                    second_question_run_id = continued.question_generation_run.id

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain a different payment decision.",
                                )
                            ],
                            provider="practice-early-completion-second-provider",
                            usage=LLMUsage(input_tokens=20, output_tokens=10),
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    answering = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).refresh_question_generation(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=6,
                    )
                    second_question_id = answering.question_card.id

                async with database.sessionmaker() as session:
                    ended = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).end_session_early(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=7,
                        question_id=second_question_id,
                    )
                    assert ended.session.completion_reason == "userEndedEarly"
                    assert ended.unfinished_attempt.id == second_attempt_id
                    assert ended.unfinished_attempt.status == "endedEarly"
                    assert len(ended.completed_attempt_review_contexts) == 1
                    assert (
                        ended.completed_attempt_review_contexts[0].attempt.id
                        == first_attempt_id
                    )

                async with database.sessionmaker() as session:
                    first_attempt = await session.get(PracticeAttempt, first_attempt_id)
                    second_attempt = await session.get(PracticeAttempt, second_attempt_id)
                    first_run = await session.get(AgentRun, first_question_run_id)
                    second_run = await session.get(AgentRun, second_question_run_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    assert first_attempt is not None
                    assert second_attempt is not None
                    assert first_run is not None
                    assert second_run is not None
                    assert practice_session is not None
                    assert first_attempt.status == "completed"
                    assert second_attempt.status == "endedEarly"
                    assert second_attempt.completed_at is not None
                    assert practice_session.completion_reason == "userEndedEarly"
                    assert first_run.status == "succeeded"
                    assert second_run.status == "succeeded"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_retry_attempt_can_end_early_without_new_question_generation_run() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    question_id,
                    first_question_run_id,
                    _project_id,
                ) = await produce_first_review(database)
                async with database.sessionmaker() as session:
                    retried = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=question_id,
                    )
                    retry_attempt_id = retried.attempt.id

                async with database.sessionmaker() as session:
                    ended = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).end_session_early(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=6,
                        question_id=question_id,
                    )
                    assert ended.unfinished_attempt.id == retry_attempt_id
                    assert ended.unfinished_attempt.status == "endedEarly"
                    assert ended.unfinished_attempt.retry_of_attempt_id == first_attempt_id
                    assert ended.question_context.question_generation_run.id == (
                        first_question_run_id
                    )

                async with database.sessionmaker() as session:
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
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
                    assert len(attempts) == 2
                    assert len(question_runs) == 1
                    assert all(attempt.status in {"completed", "endedEarly"} for attempt in attempts)
            finally:
                await database.reset()

    asyncio.run(run_test())
