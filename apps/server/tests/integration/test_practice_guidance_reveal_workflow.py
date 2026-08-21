import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import AgentRun, PracticeFollowUpQuestion, QuestionCard
from riva.services.practice_sessions import PracticeSessionService
from tests.integration.test_practice_answer_workflow import (
    seed_answering_session,
)
from tests.integration.test_practice_follow_up_answer_workflow import (
    follow_up_question_output,
    follow_up_refresh,
    prepare_question_and_main_answer,
    run_follow_up_worker,
    submit_follow_up,
)
from tests.integration.test_question_generation import database_url

pytestmark = pytest.mark.integration
START = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


async def question_generation_runs(
    database: Database, user_id, run_id
) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "question-generator",
                    )
                )
            ).all()
        )
    return [run for run in runs if run.id == run_id]


async def follow_up_runs(database: Database, attempt_id) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.agent_id == "follow-up-generator",
                    )
                )
            ).all()
        )
    return [run for run in runs if run.payload.get("attemptId") == str(attempt_id)]


def test_practice_main_guidance_reveal_is_durable_and_recovers_without_agents() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = await seed_answering_session(
                    database
                )
                assert card.answer_hints_revealed is False
                assert card.answer_framework_revealed is False
                frozen_hints = list(card.answer_hints)
                frozen_framework = list(card.answer_framework)
                before_runs = await question_generation_runs(
                    database,
                    owner.id,
                    card.source_agent_run_id,
                )

                async with database.sessionmaker() as session:
                    revealed_hint = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).reveal_question_hint(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=2,
                        question_id=card.id,
                    )
                assert revealed_hint.session.version == 3
                assert revealed_hint.attempt is not attempt
                assert revealed_hint.question_card is not None
                assert revealed_hint.question_card.answer_hints_revealed is True
                assert revealed_hint.question_card.answer_framework_revealed is False

                async with database.sessionmaker() as session:
                    revealed_framework = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).reveal_question_framework(
                        user_id=owner.id,
                        session_id=practice_session.id,
                        expected_version=3,
                        question_id=card.id,
                    )
                assert revealed_framework.session.version == 4
                assert revealed_framework.question_card is not None
                assert revealed_framework.question_card.answer_hints_revealed is True
                assert (
                    revealed_framework.question_card.answer_framework_revealed is True
                )

                async with database.sessionmaker() as session:
                    recovered = await PracticeSessionService(
                        session,
                    ).get_active_session_context(user_id=owner.id)
                    stored_card = await session.get(QuestionCard, card.id)
                    assert recovered is not None
                    assert recovered.question_card is not None
                    assert recovered.session.version == 4
                    assert recovered.question_card.answer_hints_revealed is True
                    assert recovered.question_card.answer_framework_revealed is True
                    assert recovered.question_card.answer_hints == frozen_hints
                    assert recovered.question_card.answer_framework == frozen_framework
                    assert stored_card is not None
                    assert stored_card.answer_hints_revealed is True
                    assert stored_card.answer_framework_revealed is True
                    assert stored_card.answer_hints == frozen_hints
                    assert stored_card.answer_framework == frozen_framework

                after_runs = await question_generation_runs(
                    database,
                    owner.id,
                    card.source_agent_run_id,
                )
                assert len(before_runs) == len(after_runs) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_reveal_is_durable_and_next_question_resets_state() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    attempt_id,
                    card_id,
                ) = await prepare_question_and_main_answer(database)
                await run_follow_up_worker(
                    database,
                    follow_up_question_output(1),
                )
                first = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=3,
                )
                assert first.follow_up_question is not None
                question_1_id = first.follow_up_question.id
                assert first.follow_up_question.answer_hints_revealed is False
                assert first.follow_up_question.answer_framework_revealed is False
                frozen_hints = list(first.follow_up_question.answer_hints)
                frozen_framework = list(first.follow_up_question.answer_framework)
                before_runs = await follow_up_runs(database, attempt_id)

                async with database.sessionmaker() as session:
                    revealed_hint = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).reveal_follow_up_hint(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=4,
                        question_id=card_id,
                        follow_up_question_id=question_1_id,
                    )
                assert revealed_hint.session.version == 5
                assert revealed_hint.follow_up_question is not None
                assert revealed_hint.follow_up_question.answer_hints_revealed is True
                assert (
                    revealed_hint.follow_up_question.answer_framework_revealed is False
                )

                async with database.sessionmaker() as session:
                    revealed_framework = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).reveal_follow_up_framework(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=card_id,
                        follow_up_question_id=question_1_id,
                    )
                assert revealed_framework.session.version == 6
                assert revealed_framework.follow_up_question is not None
                assert (
                    revealed_framework.follow_up_question.answer_hints_revealed is True
                )
                assert (
                    revealed_framework.follow_up_question.answer_framework_revealed
                    is True
                )
                after_reveal_runs = await follow_up_runs(database, attempt_id)
                assert len(after_reveal_runs) == len(before_runs) == 1

                answered = await submit_follow_up(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=6,
                    question_id=card_id,
                    follow_up_question_id=question_1_id,
                    content="The metric improved by 20 percent.",
                )
                assert answered.session.version == 7
                await run_follow_up_worker(
                    database,
                    follow_up_question_output(2),
                )
                second = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=7,
                )
                assert second.follow_up_question is not None
                question_2_id = second.follow_up_question.id
                assert question_2_id != question_1_id
                assert second.follow_up_question.answer_hints_revealed is False
                assert second.follow_up_question.answer_framework_revealed is False

                async with database.sessionmaker() as session:
                    stored_question_1 = await session.get(
                        PracticeFollowUpQuestion,
                        question_1_id,
                    )
                    stored_question_2 = await session.get(
                        PracticeFollowUpQuestion,
                        question_2_id,
                    )
                    assert stored_question_1 is not None
                    assert stored_question_2 is not None
                    assert stored_question_1.answer_hints_revealed is True
                    assert stored_question_1.answer_framework_revealed is True
                    assert stored_question_1.answer_hints == frozen_hints
                    assert stored_question_1.answer_framework == frozen_framework
                    assert stored_question_2.answer_hints_revealed is False
                    assert stored_question_2.answer_framework_revealed is False
            finally:
                await database.reset()

    asyncio.run(run_test())
