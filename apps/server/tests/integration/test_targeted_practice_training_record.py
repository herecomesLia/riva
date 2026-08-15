import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import select

from riva.agents import QuestionGenerationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    PracticeSession,
    QuestionCard,
)
from riva.services.practice_sessions import PracticeSessionService
from riva.services.training_records import TrainingRecordService
from riva.workers import AgentWorker
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    produce_first_review,
    question_output,
)
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration


def test_targeted_practice_training_record_replays_completed_durable_data() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    attempt_id,
                    question_id,
                    _question_run_id,
                    _project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                    )
                    assert completed.session.version == 6

                async with database.sessionmaker() as session:
                    record = await TrainingRecordService(
                        session
                    ).get_targeted_practice_record(
                        user_id=user_id,
                        record_id=session_id,
                    )
                    stored_session = await session.get(PracticeSession, session_id)
                    stored_attempt = await session.get(PracticeAttempt, attempt_id)
                    stored_card = await session.get(QuestionCard, question_id)
                    stored_answer = await session.scalar(
                        select(PracticeAnswer).where(
                            PracticeAnswer.attempt_id == attempt_id,
                            PracticeAnswer.kind == "main",
                        )
                    )
                    frozen = await session.get(
                        PracticeQuestionReferenceContext,
                        question_id,
                    )
                    reference_artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == question_id,
                            PracticeReferenceAnswerArtifact.target_type == "main",
                        )
                    )

                assert stored_session is not None
                assert stored_attempt is not None
                assert stored_card is not None
                assert stored_answer is not None
                assert frozen is not None
                assert reference_artifact is not None
                assert record.record_id == session_id
                assert record.kind == "targetedPractice"
                assert record.status == "completed"
                assert len(record.attempts) == 1
                assert record.attempts[0].attempt_id == attempt_id
                assert record.attempts[0].question.question_card_id == question_id
                assert record.attempts[0].main_answer is not None
                assert record.attempts[0].main_answer.content == stored_answer.content
                assert record.attempts[0].evaluation is not None
                assert record.attempts[0].review is not None
                assert record.attempts[0].recommendation is not None
                assert record.attempts[0].question.reference_answer.status == (
                    "revealed"
                )
                assert record.attempts[0].question.reference_answer.content.answer == (
                    reference_artifact.answer
                )
                assert record.target_role.title == frozen.frozen_context["targetRole"][
                    "title"
                ]
                assert record.target_role.company == frozen.frozen_context[
                    "targetRole"
                ]["company"]
                assert record.duration_seconds >= 0
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_targeted_practice_training_record_includes_unfinished_early_attempt() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_question_id,
                    _first_question_run_id,
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
                    assert continued.session.version == 6

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain the next difficult decision.",
                                )
                            ],
                            provider="training-record-early-question-provider",
                            usage=LLMUsage(input_tokens=10, output_tokens=10),
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
                    assert answering.session.version == 7

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
                    assert ended.session.version == 8

                async with database.sessionmaker() as session:
                    record = await TrainingRecordService(
                        session
                    ).get_targeted_practice_record(
                        user_id=user_id,
                        record_id=session_id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        second_attempt_id,
                    )
                    stored_session = await session.get(PracticeSession, session_id)

                assert stored_attempt is not None
                assert stored_session is not None
                assert record.status == "partiallyCompleted"
                assert [item.attempt_number for item in record.attempts] == [1, 2]
                unfinished = record.attempts[-1]
                assert unfinished.attempt_id == second_attempt_id
                assert unfinished.completed_at is None
                assert unfinished.main_answer is None
                assert unfinished.follow_ups == []
                assert unfinished.evaluation is None
                assert unfinished.review is None
                assert unfinished.recommendation is None
                assert unfinished.question.reference_answer.status == "notRequested"
            finally:
                await database.reset()

    asyncio.run(run_test())
