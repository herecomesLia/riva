import asyncio
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from riva.ai.practice import PracticeRoundAgent, PracticeRoundOutput
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError
from riva.models.career_profile import CareerProfile
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeQuestionTurn,
    PracticeRound,
    PracticeSession,
    PracticeTurn,
)
from riva.models.user import User
from riva.services.errors import ConflictError
from riva.services.practice import PracticeService
from riva.services.roles import RoleService
from riva.tasks import TaskErrorCode, TaskResources, app
from riva.tasks.core.app import create_task_connector
from riva.tasks.registry import configure_task_registry


@pytest.fixture
def agent():
    return MagicMock(spec=PracticeRoundAgent)


@pytest.fixture
def run_worker(extraction_database, agent):
    async def run():
        configure_task_registry(app)
        url = extraction_database.engine.url.render_as_string(hide_password=False)
        resources = TaskResources(extraction_database, MagicMock(spec=LLMClient), agent)
        with app.replace_connector(create_task_connector(url)):
            async with app.open_async():
                await asyncio.wait_for(
                    app.run_worker_async(
                        wait=False,
                        listen_notify=False,
                        concurrency=1,
                        queues=["ai"],
                        additional_context={"resources": resources},
                    ),
                    timeout=10,
                )

    return run


async def test_answer_result_preserves_stored_turns(
    extraction_database,
    practice_id,
    practice_question,
    practice_result,
    agent,
    run_worker,
):
    agent.start.return_value = PracticeRoundOutput(turns=[practice_question])
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert practice.rounds[-1].job_id is None
        assert practice.rounds[-1].turns[0].guidance == practice_question.guidance
        user = await session.get(User, practice.user_id)
        await PracticeService(session).answer(
            user,
            practice_id,
            round_id=practice.rounds[-1].id,
            question_id=practice_question.id,
            content="I built the API.",
        )
        round_id = practice.rounds[-1].id
        answer = PracticeAnswerTurn.model_validate(
            practice.rounds[-1].turns[1], from_attributes=True
        )
    result = practice_result
    agent.answer.return_value = PracticeRoundOutput(
        turns=[practice_question, answer], result=result
    )
    await run_worker()
    agent.answer.assert_awaited_once_with(round_id, answer)
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [(turn.id, turn.sequence) for turn in practice.rounds[-1].turns] == [
            (practice_question.id, 0),
            (answer.id, 1),
        ]
        assert practice.rounds[-1].result == result
        assert (
            practice.rounds[-1].job_id is None
            and practice.rounds[-1].error_code is None
        )


async def test_failed_generation_retries_original_job(
    extraction_database, practice_id, practice_question, agent, run_worker
):
    agent.start.side_effect = [
        LLMOutputError("Invalid output"),
        PracticeRoundOutput(turns=[practice_question]),
    ]
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        round_id = practice.rounds[-1].id
        job_id = practice.rounds[-1].job_id
        assert job_id is not None and practice.rounds[-1].turns == []
        assert practice.rounds[-1].error_code == TaskErrorCode.INVALID_OUTPUT
        user = await session.get(User, practice.user_id)
        await PracticeService(session).retry_task(user, practice_id, round_id=round_id)
        assert (
            practice.rounds[-1].job_id == job_id
            and practice.rounds[-1].error_code is None
        )
    await run_worker()
    assert agent.start.await_count == 2
    assert agent.start.await_args_list[0] == agent.start.await_args_list[1]
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [turn.id for turn in practice.rounds[-1].turns] == [practice_question.id]
        assert (
            practice.rounds[-1].job_id is None
            and practice.rounds[-1].error_code is None
        )


@pytest.mark.parametrize(
    "invalid_output", ["changed_prefix", "missing_answer", "extra_answer"]
)
async def test_invalid_projection_keeps_stored_history(
    extraction_database,
    practice_id,
    practice_question,
    agent,
    run_worker,
    invalid_output,
):
    agent.start.return_value = PracticeRoundOutput(turns=[practice_question])
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        await PracticeService(session).answer(
            user,
            practice_id,
            round_id=practice.rounds[-1].id,
            question_id=practice_question.id,
            content="Original answer",
        )
        answer = PracticeAnswerTurn.model_validate(
            practice.rounds[-1].turns[1], from_attributes=True
        )
    turns = [practice_question, answer]
    if invalid_output == "changed_prefix":
        turns[0] = practice_question.model_copy(update={"content": "Changed question"})
    elif invalid_output == "missing_answer":
        turns.pop()
    else:
        # A question appended before the invalid answer must also roll back.
        turns.extend(
            [
                practice_question.model_copy(update={"id": uuid4()}),
                PracticeAnswerTurn(id=uuid4(), content="Unsubmitted answer"),
            ]
        )
    agent.answer.return_value = PracticeRoundOutput(turns=turns)
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [(turn.id, turn.content) for turn in practice.rounds[-1].turns] == [
            (practice_question.id, practice_question.content),
            (answer.id, answer.content),
        ]
        assert practice.rounds[-1].result is None
        assert practice.rounds[-1].error_code == TaskErrorCode.INTERNAL_ERROR


async def test_deleted_practice_discards_in_flight_output(
    extraction_database, practice_id, practice_question, agent, run_worker
):
    async def delete_during_generation(*args):
        async with extraction_database.sessionmaker() as session:
            practice = await session.get(PracticeSession, practice_id)
            user = await session.get(User, practice.user_id)
            await PracticeService(session).delete(user, practice_id)
        return PracticeRoundOutput(turns=[practice_question])

    agent.start.side_effect = delete_during_generation
    await run_worker()
    agent.start.assert_awaited_once()
    async with extraction_database.sessionmaker() as session:
        assert await session.get(PracticeSession, practice_id) is None


@pytest.fixture
async def completed_round(
    extraction_database,
    practice_id,
    practice_question,
    practice_result,
    agent,
    run_worker,
):
    agent.start.return_value = PracticeRoundOutput(turns=[practice_question])
    await run_worker()
    agent.answer.side_effect = lambda _, answer: PracticeRoundOutput(
        turns=[practice_question, answer], result=practice_result
    )
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        round_id = practice.rounds[-1].id
        user = await session.get(User, practice.user_id)
        await PracticeService(session).answer(
            user,
            practice_id,
            round_id=round_id,
            question_id=practice_question.id,
            content="My first answer",
        )
    await run_worker()
    return round_id


async def test_replacement_moves_main_question_and_recovers_failed_restart(
    extraction_database,
    practice_id,
    completed_round,
    practice_question,
    agent,
    run_worker,
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        await PracticeService(session).retry_round(
            user, practice_id, round_id=completed_round
        )
        replacement = practice.rounds[-1]
        replacement_id = replacement.id
        assert replacement_id != completed_round and replacement.sequence == 0
        assert replacement.result is None
        assert len(replacement.turns) == 1
        assert (
            PracticeQuestionTurn.model_validate(
                replacement.turns[0], from_attributes=True
            )
            == practice_question
        )
        assert replacement.turns[0].round_id == replacement_id
    agent.restart.side_effect = [
        RuntimeError("Restart failed"),
        PracticeRoundOutput(turns=[practice_question]),
    ]
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        assert await session.get(PracticeRound, completed_round) is None
        job_id = practice.rounds[-1].job_id
        assert practice.rounds[-1].error_code == TaskErrorCode.INTERNAL_ERROR
        with pytest.raises(ConflictError, match="unfinished work"):
            await service.answer(
                user,
                practice_id,
                round_id=replacement_id,
                question_id=practice_question.id,
                content="Premature answer",
            )
        await service.retry_task(user, practice_id, round_id=replacement_id)
        assert practice.rounds[-1].job_id == job_id
    await run_worker()
    assert agent.restart.await_args.args[0] == replacement_id
    assert agent.restart.await_args.args[2] == practice_question
    assert agent.restart.await_args_list[0] == agent.restart.await_args_list[1]
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        assert practice.rounds[-1].job_id is None
        for operation in [
            service.answer,
            service.end_round,
            service.retry_round,
            service.next_round,
            service.skip_round,
        ]:
            kwargs = (
                {"question_id": practice_question.id, "content": "Late answer"}
                if operation == service.answer
                else {}
            )
            with pytest.raises(ConflictError, match="current round"):
                await operation(user, practice_id, round_id=completed_round, **kwargs)


async def test_end_round_persists_only_answered_questions(
    extraction_database,
    practice_id,
    practice_question,
    practice_result,
    agent,
    run_worker,
):
    agent.start.return_value = PracticeRoundOutput(turns=[practice_question])
    await run_worker()
    follow_up = practice_question.model_copy(update={"id": uuid4(), "content": "Why?"})
    agent.answer.side_effect = lambda _, answer: PracticeRoundOutput(
        turns=[practice_question, answer, follow_up]
    )
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        round_id = practice.rounds[-1].id
        await PracticeService(session).answer(
            user,
            practice_id,
            round_id=round_id,
            question_id=practice_question.id,
            content="Answer",
        )
        answer = PracticeAnswerTurn.model_validate(
            practice.rounds[-1].turns[-1], from_attributes=True
        )
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        await PracticeService(session).end_round(user, practice_id, round_id=round_id)
        assert await session.get(PracticeTurn, follow_up.id) is None
        assert [turn.id for turn in practice.rounds[-1].turns] == [
            practice_question.id,
            answer.id,
        ]
    agent.finish.return_value = PracticeRoundOutput(
        turns=[practice_question, answer], result=practice_result
    )
    await run_worker()
    agent.finish.assert_awaited_once_with(round_id)
    async with extraction_database.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert round.result == practice_result and round.job_id is None


async def test_start_uses_session_snapshots_after_live_context_is_deleted(
    extraction_database, practice_id, practice_question, agent, run_worker
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        profile, role = practice.profile_snapshot, practice.role_snapshot
        round_id = practice.rounds[-1].id
        await RoleService(session).delete(user, practice.role_id)
        await session.delete(await session.get(CareerProfile, user.id))
        await session.commit()
    agent.start.return_value = PracticeRoundOutput(turns=[practice_question])
    await run_worker()
    args = agent.start.await_args.args
    assert args[0] == round_id
    assert args[1].profile == profile and args[1].role == role
    async with extraction_database.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert round.job_id is None and round.error_code is None
