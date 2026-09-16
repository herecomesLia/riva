import asyncio
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from riva.ai.practice import PracticeAgent, PracticeOutput
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeDimension,
    PracticeResult,
    PracticeSession,
)
from riva.models.user import User
from riva.services.practice import PracticeService
from riva.tasks import TaskErrorCode, TaskResources, app
from riva.tasks.core.app import create_task_connector
from riva.tasks.registry import configure_task_registry


@pytest.fixture
def agent():
    return MagicMock(spec=PracticeAgent)


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
    extraction_database, practice_id, practice_question, agent, run_worker
):
    agent.start.return_value = PracticeOutput(turns=[practice_question])
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert practice.job_id is None
        assert practice.turns[0].guidance == practice_question.guidance
        user = await session.get(User, practice.user_id)
        await PracticeService(session).answer(
            user,
            practice_id,
            question_id=practice_question.id,
            content="I built the API.",
        )
        answer = PracticeAnswerTurn.model_validate(
            practice.turns[1], from_attributes=True
        )
    result = PracticeResult(
        evaluation={
            "score": 80,
            "dimensions": [
                {
                    "dimension": dimension,
                    "score": 80,
                    "explanation": ["Concrete evidence"],
                }
                for dimension in PracticeDimension
            ],
        },
        review={
            "summary": "Clear answer",
            "strengths": [],
            "issues": [],
            "suggestions": [],
        },
    )
    agent.answer.return_value = PracticeOutput(
        turns=[practice_question, answer], result=result
    )
    await run_worker()
    agent.answer.assert_awaited_once_with(practice_id, answer)
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [(turn.id, turn.sequence) for turn in practice.turns] == [
            (practice_question.id, 0),
            (answer.id, 1),
        ]
        assert practice.result == result
        assert practice.job_id is None and practice.error_code is None


async def test_failed_generation_retries_original_job(
    extraction_database, practice_id, practice_question, agent, run_worker
):
    agent.start.side_effect = [
        LLMOutputError("Invalid output"),
        PracticeOutput(turns=[practice_question]),
    ]
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        job_id = practice.job_id
        assert job_id is not None and practice.turns == []
        assert practice.error_code == TaskErrorCode.INVALID_OUTPUT
        user = await session.get(User, practice.user_id)
        await PracticeService(session).retry(user, practice_id)
        assert practice.job_id == job_id and practice.error_code is None
    await run_worker()
    assert agent.start.await_count == 2
    assert agent.start.await_args_list[0] == agent.start.await_args_list[1]
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [turn.id for turn in practice.turns] == [practice_question.id]
        assert practice.job_id is None and practice.error_code is None


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
    agent.start.return_value = PracticeOutput(turns=[practice_question])
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        await PracticeService(session).answer(
            user,
            practice_id,
            question_id=practice_question.id,
            content="Original answer",
        )
        answer = PracticeAnswerTurn.model_validate(
            practice.turns[1], from_attributes=True
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
    agent.answer.return_value = PracticeOutput(turns=turns)
    await run_worker()
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [(turn.id, turn.content) for turn in practice.turns] == [
            (practice_question.id, practice_question.content),
            (answer.id, answer.content),
        ]
        assert practice.result is None
        assert practice.error_code == TaskErrorCode.INTERNAL_ERROR


async def test_deleted_practice_discards_in_flight_output(
    extraction_database, practice_id, practice_question, agent, run_worker
):
    async def delete_during_generation(*args):
        async with extraction_database.sessionmaker() as session:
            practice = await session.get(PracticeSession, practice_id)
            user = await session.get(User, practice.user_id)
            await PracticeService(session).delete(user, practice_id)
        return PracticeOutput(turns=[practice_question])

    agent.start.side_effect = delete_during_generation
    await run_worker()
    agent.start.assert_awaited_once()
    async with extraction_database.sessionmaker() as session:
        assert await session.get(PracticeSession, practice_id) is None
