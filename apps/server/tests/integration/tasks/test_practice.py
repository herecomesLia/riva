import asyncio
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from riva.ai.practice import PracticeRoundAgent, PracticeRoundOutput
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import CareerProfile
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeQuestionTurn,
    PracticeRound,
    PracticeSession,
    PracticeTurn,
)
from riva.models.role import JobDescription, Role
from riva.models.user import User
from riva.tasks import Task, TaskController, TaskErrorCode, TaskResources, app
from riva.tasks.core.app import create_task_connector
from riva.tasks.registry import configure_task_registry
from tests.support.practice import make_answer, make_input, make_question, make_result
from tests.support.tasks import read_job


async def _seed_round(database, *, action, turns):
    input = make_input()
    async with database.sessionmaker() as session:
        user = User(
            id=uuid4(),
            username="Candidate",
            display_name="Candidate",
            password_hash="unused",
        )
        user.career_profile = CareerProfile(**input.profile.model_dump())
        role = Role(
            id=uuid4(),
            user_id=user.id,
            title=input.role.title,
            company=input.role.company,
            jd=JobDescription(**input.role.jd.model_dump()),
        )
        practice = PracticeSession(
            id=uuid4(),
            user_id=user.id,
            role=role,
            profile_snapshot=input.profile,
            role_snapshot=input.role,
            role_title_snapshot=role.title,
            role_company_snapshot=role.company,
            question_type=input.question_type,
            difficulty=input.difficulty,
            max_follow_ups=input.max_follow_ups,
            rounds=[],
        )
        round = PracticeRound(
            id=uuid4(),
            sequence=0,
            turns=[
                PracticeTurn(sequence=i, **turn.model_dump())
                for i, turn in enumerate(turns)
            ],
        )
        practice.rounds.append(round)
        session.add_all([user, practice])
        await session.flush()
        round.job_id = await TaskController(session).start(
            Task.RUN_PRACTICE_ROUND,
            round_id=str(round.id),
            action=action,
            answer_turn_id=str(turns[-1].id) if action == "answer" else None,
        )
        await session.commit()
        return round.id, round.job_id


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
                async with asyncio.timeout(10):
                    await app.run_worker_async(
                        wait=False,
                        listen_notify=False,
                        concurrency=1,
                        queues=["ai"],
                        additional_context={"resources": resources},
                    )

    return run


async def test_start_uses_session_snapshots_and_projects_question(
    extraction_database, agent, run_worker
):
    db, question = extraction_database, make_question()
    round_id, job_id = await _seed_round(db, action="start", turns=[])
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        practice = await session.get(PracticeSession, round.practice_id)
        practice.role.title = "New role"
        practice.role.jd.responsibilities = ["New responsibilities"]
        (await session.get(CareerProfile, practice.user_id)).skills = ["Go"]
        await session.commit()
    agent.start.return_value = PracticeRoundOutput(turns=[question])
    await run_worker()
    agent.start.assert_awaited_once_with(round_id, make_input())
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert len(round.turns) == 1
        assert (
            PracticeQuestionTurn.model_validate(round.turns[0], from_attributes=True)
            == question
        )
        assert round.job_id is None and round.error_code is None
    assert (await read_job(db, job_id))["status"] == "succeeded"


@pytest.mark.parametrize("boundary", ["follow_up", "completed"])
async def test_answer_projects_agent_suffix_and_result(
    extraction_database, agent, run_worker, boundary
):
    db = extraction_database
    question, answer, followup = make_question(), make_answer(), make_question("Why?")
    round_id, job_id = await _seed_round(db, action="answer", turns=[question, answer])
    async with db.sessionmaker() as session:
        (
            await session.get(PracticeRound, round_id)
        ).error_code = TaskErrorCode.LLM_UNAVAILABLE
        await session.commit()
    output = PracticeRoundOutput(
        turns=[question, answer, followup]
        if boundary == "follow_up"
        else [question, answer],
        result=make_result() if boundary == "completed" else None,
    )
    agent.answer.return_value = output
    await run_worker()
    agent.answer.assert_awaited_once_with(round_id, answer)
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert [turn.id for turn in round.turns] == [turn.id for turn in output.turns]
        assert [turn.sequence for turn in round.turns] == list(range(len(output.turns)))
        assert (
            PracticeQuestionTurn.model_validate(round.turns[0], from_attributes=True)
            == question
        )
        assert (
            PracticeAnswerTurn.model_validate(round.turns[1], from_attributes=True)
            == answer
        )
        if boundary == "follow_up":
            assert (
                PracticeQuestionTurn.model_validate(
                    round.turns[2], from_attributes=True
                )
                == followup
            )
        assert (
            round.result == output.result
            and round.job_id is None
            and round.error_code is None
        )
    assert (await read_job(db, job_id))["status"] == "succeeded"


async def test_restart_passes_preserved_main_question(
    extraction_database, agent, run_worker
):
    db, question = extraction_database, make_question()
    round_id, job_id = await _seed_round(db, action="restart", turns=[question])
    agent.restart.return_value = PracticeRoundOutput(turns=[question])
    await run_worker()
    agent.restart.assert_awaited_once_with(round_id, make_input(), question)
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert [turn.id for turn in round.turns] == [
            question.id
        ] and round.job_id is None
    assert (await read_job(db, job_id))["status"] == "succeeded"


async def test_projection_rejects_divergent_agent_history(
    extraction_database, agent, run_worker
):
    db, question, answer = extraction_database, make_question(), make_answer()
    round_id, job_id = await _seed_round(db, action="answer", turns=[question, answer])
    agent.answer.return_value = PracticeRoundOutput(
        turns=[question.model_copy(update={"content": "Modified question"}), answer],
        result=make_result(),
    )
    await run_worker()
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert len(round.turns) == 2
        assert (
            PracticeQuestionTurn.model_validate(round.turns[0], from_attributes=True)
            == question
        )
        assert (
            PracticeAnswerTurn.model_validate(round.turns[1], from_attributes=True)
            == answer
        )
        assert round.result is None and round.job_id == job_id
        assert round.error_code == TaskErrorCode.INTERNAL_ERROR
    assert (await read_job(db, job_id))["status"] == "failed"


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        (LLMOutputError("Invalid output"), TaskErrorCode.INVALID_OUTPUT),
        (LLMUnavailableError(), TaskErrorCode.LLM_UNAVAILABLE),
        (RuntimeError("Unexpected failure"), TaskErrorCode.INTERNAL_ERROR),
    ],
)
async def test_agent_failure_maps_task_error_code(
    extraction_database, agent, run_worker, failure, code
):
    db = extraction_database
    round_id, job_id = await _seed_round(db, action="start", turns=[])
    agent.start.side_effect = failure
    await run_worker()
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert round.job_id == job_id and round.error_code == code
        assert round.turns == [] and round.result is None
    assert (await read_job(db, job_id))["status"] == "failed"
