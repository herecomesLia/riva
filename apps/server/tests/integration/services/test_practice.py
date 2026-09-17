import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text

from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.practice import (
    PracticeQuestionTurn,
    PracticeRound,
    PracticeSession,
    PracticeTurn,
)
from riva.models.role import JobDescription, Role, RoleContent
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
from riva.services.practice import PracticeService
from riva.tasks import Task, TaskController, TaskErrorCode
from tests.support.practice import make_answer, make_input, make_question, make_result
from tests.support.tasks import read_job, task_sql


async def _seed_context(database):
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
        session.add_all([user, role])
        await session.commit()
        return user.id, role.id


async def _seed_practice(database, *, turns, result=None, sequence=0):
    user_id, role_id = await _seed_context(database)
    input = make_input()
    async with database.sessionmaker() as session:
        practice = PracticeSession(
            id=uuid4(),
            user_id=user_id,
            role_id=role_id,
            profile_snapshot=input.profile,
            role_snapshot=input.role,
            role_title_snapshot=input.role.title,
            role_company_snapshot=input.role.company,
            question_type=input.question_type,
            difficulty=input.difficulty,
            max_follow_ups=input.max_follow_ups,
            rounds=[],
        )
        round = PracticeRound(
            id=uuid4(),
            sequence=sequence,
            result=result,
            turns=[
                PracticeTurn(sequence=index, **turn.model_dump())
                for index, turn in enumerate(turns)
            ],
        )
        practice.rounds.append(round)
        session.add(practice)
        await session.flush()
        (await session.get(User, user_id)).active_practice_id = practice.id
        await session.commit()
        return user_id, practice.id, round.id


async def _attach_failed_job(database, round_id):
    async with database.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        round.job_id = await TaskController(session).start(
            Task.RUN_PRACTICE_ROUND,
            round_id=str(round_id),
            action="restart",
            answer_turn_id=None,
        )
        round.error_code = TaskErrorCode.LLM_UNAVAILABLE
        await session.commit()
        job_id = round.job_id
    await task_sql(
        database,
        "UPDATE procrastinate_jobs SET status='failed' WHERE id=:id RETURNING id",
        id=job_id,
    )
    return job_id


async def test_create_claims_active_session_and_captures_context(extraction_database):
    db = extraction_database
    user_id, role_id = await _seed_context(db)
    async with db.sessionmaker() as session:
        user, role = await session.get(User, user_id), await session.get(Role, role_id)
        profile = CareerProfileContent.model_validate(
            user.career_profile, from_attributes=True
        )
        role_context = RoleContent.model_validate(role, from_attributes=True)
        practice_id = await PracticeService(session).create(
            user,
            role=role,
            question_type="project",
            difficulty="hard",
            max_follow_ups=1,
        )
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert (await session.get(User, user_id)).active_practice_id == practice_id
        assert (
            practice.profile_snapshot == profile
            and practice.role_snapshot == role_context
        )
        assert (practice.role_title_snapshot, practice.role_company_snapshot) == (
            role_context.title,
            role_context.company,
        )
        assert len(practice.rounds) == 1 and practice.rounds[0].sequence == 0
        round_id, job_id = practice.rounds[0].id, practice.rounds[0].job_id
    assert (await read_job(db, job_id))["args"] == {
        "round_id": str(round_id),
        "action": "start",
        "answer_turn_id": None,
    }


@pytest.mark.parametrize("termination", ["end", "delete"])
async def test_active_practice_follows_session_lifecycle(
    extraction_database, termination
):
    db = extraction_database
    user_id, role_id = await _seed_context(db)
    async with db.sessionmaker() as session:
        user, role = await session.get(User, user_id), await session.get(Role, role_id)
        service = PracticeService(session)
        assert await service.get_active(user) is None
        created = await service.create(
            user,
            role=role,
            question_type="project",
            difficulty="hard",
            max_follow_ups=1,
        )
        active = await service.get_active(user)
        assert active.id == created
        round = active.rounds[-1]
        if termination == "end":
            await service.tasks.abort(round.job_id)
            round.job_id = None
            round.turns.extend(
                PracticeTurn(sequence=i, **turn.model_dump())
                for i, turn in enumerate([make_question(), make_answer()])
            )
            round.result = make_result()
            await session.commit()
            await service.end_session(user, created, round_id=round.id)
        else:
            await service.delete(user, created)
    async with db.sessionmaker() as session:
        assert (
            await PracticeService(session).get_active(await session.get(User, user_id))
            is None
        )


async def test_get_round_enforces_user_and_practice_ownership(extraction_database):
    db, question = extraction_database, make_question()
    user_id, practice_id, round_id = await _seed_practice(db, turns=[question])
    async with db.sessionmaker() as session:
        user = await session.get(User, user_id)
        other = User(username="Other", display_name="Other", password_hash="unused")
        # A real second Practice distinguishes a wrong parent from a missing parent.
        practice = await session.get(PracticeSession, practice_id)
        second = PracticeSession(
            id=uuid4(),
            user_id=user_id,
            role_id=practice.role_id,
            profile_snapshot=practice.profile_snapshot,
            role_snapshot=practice.role_snapshot,
            role_title_snapshot=practice.role_title_snapshot,
            role_company_snapshot=practice.role_company_snapshot,
            question_type=practice.question_type,
            difficulty=practice.difficulty,
            max_follow_ups=practice.max_follow_ups,
            rounds=[],
        )
        session.add_all([other, second])
        await session.commit()
        service = PracticeService(session)
        round = await service.get_round(user, practice_id, round_id)
        assert [turn.id for turn in round.turns] == [question.id]
        for owner, parent in [(other, practice_id), (user, second.id)]:
            with pytest.raises(NotFoundError, match="Practice round"):
                await service.get_round(owner, parent, round_id)
            with pytest.raises(NotFoundError, match="Practice round"):
                await service.get_round_task_state(owner, parent, round_id=round_id)


async def test_concurrent_create_allows_only_one_active_session(extraction_database):
    db = extraction_database
    user_id, role_id = await _seed_context(db)
    barrier = asyncio.Barrier(2)

    async def create():
        async with db.sessionmaker() as session:
            user, role = (
                await session.get(User, user_id),
                await session.get(Role, role_id),
            )
            await barrier.wait()
            try:
                return await PracticeService(session).create(
                    user,
                    role=role,
                    question_type="project",
                    difficulty="hard",
                    max_follow_ups=1,
                )
            except ConflictError:
                return None

    ids = await asyncio.gather(create(), create())
    assert ids.count(None) == 1
    async with db.sessionmaker() as session:
        assert (await session.get(User, user_id)).active_practice_id == next(
            id for id in ids if id is not None
        )
        assert (
            await session.scalar(select(func.count()).select_from(PracticeSession)) == 1
        )
        assert (
            await session.scalar(select(func.count()).select_from(PracticeRound)) == 1
        )
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 1
        )


async def test_mutation_cannot_access_another_users_practice(extraction_database):
    db = extraction_database
    _, practice_id, _ = await _seed_practice(db, turns=[make_question()])
    async with db.sessionmaker() as session:
        other = User(username="Other", display_name="Other", password_hash="unused")
        session.add(other)
        await session.commit()
        with pytest.raises(NotFoundError):
            await PracticeService(session).delete(other, practice_id)
    async with db.sessionmaker() as session:
        assert await session.get(PracticeSession, practice_id) is not None


async def test_concurrent_identical_answers_persist_and_enqueue_once(
    extraction_database,
):
    db, question = extraction_database, make_question()
    user_id, practice_id, round_id = await _seed_practice(db, turns=[question])
    barrier = asyncio.Barrier(2)

    async def answer():
        async with db.sessionmaker() as session:
            user = await session.get(User, user_id)
            await barrier.wait()
            await PracticeService(session).answer(
                user,
                practice_id,
                round_id=round_id,
                question_id=question.id,
                content="Same answer",
            )
            round = await PracticeService(session).get_round(
                user, practice_id, round_id
            )
            return round.job_id, [turn.id for turn in round.turns]

    first, repeated = await asyncio.gather(answer(), answer())
    assert first == repeated and first[0] is not None
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert [(turn.role, turn.content) for turn in round.turns] == [
            ("assistant", question.content),
            ("user", "Same answer"),
        ]
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 1
        )
        user = await session.get(User, user_id)
        with pytest.raises(ConflictError, match="different answer"):
            await PracticeService(session).answer(
                user,
                practice_id,
                round_id=round_id,
                question_id=question.id,
                content="Different answer",
            )
    assert (await read_job(db, first[0]))["args"] == {
        "round_id": str(round_id),
        "action": "answer",
        "answer_turn_id": str(first[1][1]),
    }


async def test_round_mutation_is_blocked_while_job_is_attached(extraction_database):
    db, question = extraction_database, make_question()
    user_id, practice_id, round_id = await _seed_practice(db, turns=[question])
    job_id = await _attach_failed_job(db, round_id)
    async with db.sessionmaker() as session:
        user = await session.get(User, user_id)
        with pytest.raises(ConflictError, match="unfinished work"):
            await PracticeService(session).answer(
                user,
                practice_id,
                round_id=round_id,
                question_id=question.id,
                content="Premature answer",
            )
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert round.job_id == job_id and len(round.turns) == 1


async def test_skip_round_replaces_unanswered_round(extraction_database):
    db, question = extraction_database, make_question()
    user_id, practice_id, round_id = await _seed_practice(
        db, turns=[question], sequence=2
    )
    async with db.sessionmaker() as session:
        user = await session.get(User, user_id)
        await PracticeService(session).skip_round(user, practice_id, round_id=round_id)
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        replacement = practice.rounds[-1]
        assert (
            len(practice.rounds) == 1
            and replacement.id != round_id
            and replacement.sequence == 2
        )
        assert replacement.turns == []
        assert await session.get(PracticeRound, round_id) is None
        assert await session.get(PracticeTurn, question.id) is None
        job_id = replacement.job_id
        user = await session.get(User, user_id)
        with pytest.raises(ConflictError, match="current round"):
            await PracticeService(session).skip_round(
                user, practice_id, round_id=round_id
            )
    assert (await read_job(db, job_id))["args"]["action"] == "start"


async def test_finish_round_removes_pending_followup_and_dispatches_finish(
    extraction_database,
):
    db = extraction_database
    question, answer, followup = make_question(), make_answer(), make_question("Why?")
    user_id, practice_id, round_id = await _seed_practice(
        db, turns=[question, answer, followup]
    )
    async with db.sessionmaker() as session:
        await PracticeService(session).finish_round(
            await session.get(User, user_id), practice_id, round_id=round_id
        )
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert [turn.id for turn in round.turns] == [question.id, answer.id]
        assert await session.get(PracticeTurn, followup.id) is None
        job_id = round.job_id
    assert (await read_job(db, job_id))["args"] == {
        "round_id": str(round_id),
        "action": "finish",
        "answer_turn_id": None,
    }


async def test_restart_round_replaces_round_and_preserves_main_question(
    extraction_database,
):
    db = extraction_database
    question = make_question()
    turns = [question, make_answer(), make_question("Why?"), make_answer("Trade-offs")]
    user_id, practice_id, round_id = await _seed_practice(
        db, turns=turns, result=make_result(), sequence=2
    )
    async with db.sessionmaker() as session:
        await PracticeService(session).restart_round(
            await session.get(User, user_id), practice_id, round_id=round_id
        )
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        replacement = practice.rounds[-1]
        assert (
            len(practice.rounds) == 1
            and replacement.id != round_id
            and replacement.sequence == 2
        )
        assert replacement.result is None and len(replacement.turns) == 1
        assert (
            PracticeQuestionTurn.model_validate(
                replacement.turns[0], from_attributes=True
            )
            == question
        )
        assert replacement.turns[0].round_id == replacement.id
        assert await session.get(PracticeRound, round_id) is None
        for turn in turns[1:]:
            assert await session.get(PracticeTurn, turn.id) is None
        job_id = replacement.job_id
    assert (await read_job(db, job_id))["args"]["action"] == "restart"


async def test_concurrent_next_round_creates_one_successor(extraction_database):
    db = extraction_database
    turns = [make_question(), make_answer()]
    user_id, practice_id, round_id = await _seed_practice(
        db, turns=turns, result=make_result()
    )
    barrier = asyncio.Barrier(2)

    async def next_round():
        async with db.sessionmaker() as session:
            user = await session.get(User, user_id)
            await barrier.wait()
            try:
                await PracticeService(session).next_round(
                    user, practice_id, round_id=round_id
                )
                return True
            except ConflictError:
                return False

    outcomes = await asyncio.gather(next_round(), next_round())
    assert sorted(outcomes) == [False, True]
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [round.sequence for round in practice.rounds] == [0, 1]
        assert [turn.id for turn in practice.rounds[0].turns] == [
            turn.id for turn in turns
        ]
        assert practice.rounds[0].result == make_result()
        assert practice.rounds[1].job_id is not None


async def test_end_session_releases_active_practice(extraction_database):
    db = extraction_database
    user_id, practice_id, round_id = await _seed_practice(
        db, turns=[make_question(), make_answer()], result=make_result()
    )
    async with db.sessionmaker() as session:
        await PracticeService(session).end_session(
            await session.get(User, user_id), practice_id, round_id=round_id
        )
    async with db.sessionmaker() as session:
        practice, user = (
            await session.get(PracticeSession, practice_id),
            await session.get(User, user_id),
        )
        assert practice.ended_at is not None and user.active_practice_id is None
        new = await PracticeService(session).create(
            user,
            role=practice.role,
            question_type="project",
            difficulty="hard",
            max_follow_ups=1,
        )
        assert new != practice_id and user.active_practice_id == new


async def test_end_session_rejects_stale_round(extraction_database):
    db = extraction_database
    user_id, practice_id, old_id = await _seed_practice(
        db, turns=[make_question(), make_answer()], result=make_result()
    )
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        # Complete the successor too, so readiness cannot mask the stale-command guard.
        practice.rounds.append(
            PracticeRound(
                id=uuid4(),
                sequence=1,
                result=make_result(),
                turns=[
                    PracticeTurn(sequence=i, **turn.model_dump())
                    for i, turn in enumerate([make_question(), make_answer()])
                ],
            )
        )
        await session.commit()
        with pytest.raises(ConflictError, match="current round"):
            await PracticeService(session).end_session(
                await session.get(User, user_id), practice_id, round_id=old_id
            )
    async with db.sessionmaker() as session:
        assert (await session.get(PracticeSession, practice_id)).ended_at is None
        assert (await session.get(User, user_id)).active_practice_id == practice_id


async def test_retry_task_requeues_current_failed_job(extraction_database):
    db = extraction_database
    user_id, practice_id, round_id = await _seed_practice(db, turns=[make_question()])
    job_id = await _attach_failed_job(db, round_id)
    original = await read_job(db, job_id)
    async with db.sessionmaker() as session:
        await PracticeService(session).retry_task(
            await session.get(User, user_id), practice_id, round_id=round_id
        )
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        assert round.job_id == job_id and round.error_code is None
    retried = await read_job(db, job_id)
    assert retried["status"] == "todo" and retried["args"] == original["args"]


async def test_delete_aborts_active_work_and_releases_active_session(
    extraction_database,
):
    db = extraction_database
    user_id, practice_id, round_id = await _seed_practice(db, turns=[])
    async with db.sessionmaker() as session:
        round = await session.get(PracticeRound, round_id)
        job_id = round.job_id = await TaskController(session).start(
            Task.RUN_PRACTICE_ROUND, round_id=str(round_id), action="start"
        )
        await session.commit()
        await PracticeService(session).delete(
            await session.get(User, user_id), practice_id
        )
    async with db.sessionmaker() as session:
        assert (await session.get(User, user_id)).active_practice_id is None
        assert await session.get(PracticeSession, practice_id) is None
    assert (await read_job(db, job_id))["status"] == "cancelled"


@pytest.mark.parametrize("operation", ["create", "restart_round"])
async def test_dispatch_failure_rolls_back_business_mutation(
    extraction_database, monkeypatch, operation
):
    db = extraction_database
    turns = [
        make_question(),
        make_answer(),
        make_question("Why?"),
        make_answer("Trade-offs"),
    ]
    if operation == "create":
        user_id, role_id = await _seed_context(db)
    else:
        user_id, practice_id, round_id = await _seed_practice(
            db, turns=turns, result=make_result()
        )
    async with db.sessionmaker() as session:
        service = PracticeService(session)
        enqueue = service.tasks.start

        async def fail_after_enqueue(*args, **kwargs):
            await enqueue(*args, **kwargs)
            raise RuntimeError("Dispatch failed")

        monkeypatch.setattr(service.tasks, "start", fail_after_enqueue)
        user = await session.get(User, user_id)
        with pytest.raises(RuntimeError, match="Dispatch failed"):
            if operation == "create":
                await service.create(
                    user,
                    role=await session.get(Role, role_id),
                    question_type="project",
                    difficulty="hard",
                    max_follow_ups=1,
                )
            else:
                await service.restart_round(user, practice_id, round_id=round_id)
        await session.rollback()
    async with db.sessionmaker() as session:
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 0
        )
        expected_count = 0 if operation == "create" else 1
        assert (
            await session.scalar(select(func.count()).select_from(PracticeSession))
            == expected_count
        )
        assert (
            await session.scalar(select(func.count()).select_from(PracticeRound))
            == expected_count
        )
        user = await session.get(User, user_id)
        if operation == "create":
            assert user.active_practice_id is None
        else:
            assert user.active_practice_id == practice_id
            round = await session.get(PracticeRound, round_id)
            assert round.result == make_result()
            assert [(turn.id, turn.content) for turn in round.turns] == [
                (turn.id, turn.content) for turn in turns
            ]
            assert all(turn.round_id == round_id for turn in round.turns)
            assert (
                PracticeQuestionTurn.model_validate(
                    round.turns[0], from_attributes=True
                )
                == turns[0]
            )
