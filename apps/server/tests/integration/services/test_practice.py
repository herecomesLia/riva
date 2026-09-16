import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text

from riva.models.career_profile import CareerProfile
from riva.models.practice import PracticeRound, PracticeSession, PracticeTurn
from riva.models.role import Role
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
from riva.services.practice import PracticeService
from riva.services.roles import RoleService
from riva.tasks import TaskController


@pytest.fixture
async def awaiting_practice(extraction_database, practice_id, practice_question):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        await TaskController(session).abort(practice.rounds[-1].job_id)
        practice.rounds[-1].job_id = None
        practice.rounds[-1].turns.append(
            PracticeTurn(
                round_id=practice.rounds[-1].id,
                sequence=0,
                **practice_question.model_dump(),
            )
        )
        await session.commit()
    return practice_id


async def test_create_persists_context_and_job_together(
    extraction_database, practice_id
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        job = (
            await session.execute(
                text(
                    "SELECT task_name, args FROM procrastinate.procrastinate_jobs WHERE id = :id"
                ),
                {"id": practice.rounds[-1].job_id},
            )
        ).one()
        assert job.task_name == "practice.run_round"
        assert job.args == {
            "round_id": str(practice.rounds[-1].id),
            "action": "start",
            "answer_turn_id": None,
        }
        assert practice.role_title_snapshot == practice.role.title
        assert practice.rounds[-1].turns == [] and practice.rounds[-1].result is None


@pytest.mark.parametrize("operation", ["skip_round", "answer", "retry_round"])
async def test_dispatch_failure_rolls_back_business_writes(
    extraction_database,
    awaiting_practice,
    practice_question,
    practice_result,
    monkeypatch,
    operation,
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        round_id = practice.rounds[-1].id
        if operation == "retry_round":
            practice.rounds[-1].turns.append(
                PracticeTurn(
                    id=uuid4(),
                    round_id=round_id,
                    sequence=1,
                    role="user",
                    content="Answer",
                )
            )
            practice.rounds[-1].result = practice_result
            await session.commit()
        # Fail after the real enqueue, so both job and business mutations must roll back.
        start = service.tasks.start

        async def fail_after_enqueue(*args, **kwargs):
            await start(*args, **kwargs)
            raise RuntimeError("Dispatch failed")

        monkeypatch.setattr(service.tasks, "start", fail_after_enqueue)
        jobs_before = await session.scalar(
            text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
        )
        with pytest.raises(RuntimeError, match="Dispatch failed"):
            if operation == "skip_round":
                await service.skip_round(
                    user, practice.id, round_id=practice.rounds[-1].id
                )
            elif operation == "retry_round":
                await service.retry_round(user, practice.id, round_id=round_id)
            else:
                await service.answer(
                    user,
                    practice.id,
                    round_id=practice.rounds[-1].id,
                    question_id=practice_question.id,
                    content="My answer",
                )
        await session.rollback()
    async with extraction_database.sessionmaker() as session:
        assert (
            await session.scalar(select(func.count()).select_from(PracticeSession)) == 1
        )
        assert await session.scalar(select(func.count()).select_from(PracticeTurn)) == (
            2 if operation == "retry_round" else 1
        )
        main_question = await session.get(PracticeTurn, practice_question.id)
        assert main_question.round_id == round_id
        assert await session.get(PracticeRound, round_id) is not None
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == jobs_before
        )


async def test_concurrent_answer_retries_enqueue_once(
    extraction_database, awaiting_practice, practice_question
):
    async def submit():
        async with extraction_database.sessionmaker() as session:
            practice = await session.get(PracticeSession, awaiting_practice)
            user = await session.get(User, practice.user_id)
            result = await PracticeService(session).answer(
                user,
                practice.id,
                round_id=practice.rounds[-1].id,
                question_id=practice_question.id,
                content="My contribution",
            )
            return result.rounds[-1].job_id

    first, second = await asyncio.gather(submit(), submit())
    assert first == second
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        assert [(turn.sequence, turn.role) for turn in practice.rounds[-1].turns] == [
            (0, "assistant"),
            (1, "user"),
        ]
        args = await session.scalar(
            text("SELECT args FROM procrastinate.procrastinate_jobs WHERE id = :id"),
            {"id": first},
        )
        assert args == {
            "round_id": str(practice.rounds[-1].id),
            "action": "answer",
            "answer_turn_id": str(practice.rounds[-1].turns[1].id),
        }
        # The initial question job and exactly one answer job.
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 2
        )


async def test_old_question_retry_does_not_answer_new_question(
    extraction_database, awaiting_practice, practice_question
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        await service.answer(
            user,
            practice.id,
            round_id=practice.rounds[-1].id,
            question_id=practice_question.id,
            content="Original answer",
        )
        await service.tasks.abort(practice.rounds[-1].job_id)
        practice.rounds[-1].job_id = None
        follow_up = practice_question.model_copy(
            update={"id": uuid4(), "content": "Why?"}
        )
        practice.rounds[-1].turns.append(
            PracticeTurn(
                round_id=practice.rounds[-1].id, sequence=2, **follow_up.model_dump()
            )
        )
        await session.commit()
        repeated = await service.answer(
            user,
            practice.id,
            round_id=practice.rounds[-1].id,
            question_id=practice_question.id,
            content="Original answer",
        )
        assert (
            len(repeated.rounds[-1].turns) == 3 and repeated.rounds[-1].job_id is None
        )
        with pytest.raises(ConflictError, match="different answer"):
            await service.answer(
                user,
                practice.id,
                round_id=practice.rounds[-1].id,
                question_id=practice_question.id,
                content="Changed answer",
            )


@pytest.mark.parametrize("company", ["New company", None])
async def test_role_snapshot_refreshes_only_on_delete(
    extraction_database, practice_id, company
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        role_id = practice.role_id
        original = (practice.role_title_snapshot, practice.role_company_snapshot)
        await RoleService(session).update(
            user, role_id, title="Senior Engineer", company=company
        )
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert (
            practice.role_title_snapshot,
            practice.role_company_snapshot,
        ) == original
        assert (practice.role.title, practice.role.company) == (
            "Senior Engineer",
            company,
        )
        user = await session.get(User, practice.user_id)
        await RoleService(session).delete(user, role_id)
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert practice.role_id is None and practice.role is None
        assert (practice.role_title_snapshot, practice.role_company_snapshot) == (
            "Senior Engineer",
            company,
        )


async def test_access_and_creation_require_owned_role_and_profile(
    extraction_database, practice_id
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        owner = await session.get(User, practice.user_id)
        other = User(username="Other", display_name="Other", password_hash="unused")
        session.add(other)
        await session.commit()
        service = PracticeService(session)
        assert await service.list(other) == []
        with pytest.raises(NotFoundError):
            await service.get(other, practice_id)
        with pytest.raises(NotFoundError):
            await service.delete(other, practice_id)
        with pytest.raises(NotFoundError, match="Target role"):
            await service.create(
                other,
                role=practice.role,
                question_type="project",
                difficulty="basic",
                max_follow_ups=0,
            )
        await service.delete(owner, practice_id)
        await session.delete(await session.get(CareerProfile, owner.id))
        await session.commit()
        with pytest.raises(NotFoundError, match="Career profile"):
            await service.create(
                owner,
                role=practice.role,
                question_type="project",
                difficulty="basic",
                max_follow_ups=0,
            )


async def test_delete_aborts_active_job_and_removes_turns(
    extraction_database, awaiting_practice, practice_question
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        await service.answer(
            user,
            practice.id,
            round_id=practice.rounds[-1].id,
            question_id=practice_question.id,
            content="Answer",
        )
        job_id = practice.rounds[-1].job_id
        await service.delete(user, practice.id)
    async with extraction_database.sessionmaker() as session:
        assert await session.get(PracticeSession, awaiting_practice) is None
        assert await session.scalar(select(func.count()).select_from(PracticeTurn)) == 0
        assert (
            await session.scalar(
                text(
                    "SELECT status FROM procrastinate.procrastinate_jobs WHERE id=:id"
                ),
                {"id": job_id},
            )
            == "cancelled"
        )


@pytest.fixture
async def completed_practice(extraction_database, awaiting_practice, practice_result):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        round = practice.rounds[-1]
        round.turns.append(
            PracticeTurn(
                id=uuid4(),
                round_id=round.id,
                sequence=1,
                role="user",
                content="Completed answer",
            )
        )
        round.result = practice_result
        await session.commit()
        return practice.id, round.id


async def test_concurrent_next_round_creates_one_successor(
    extraction_database, completed_practice
):
    practice_id, round_id = completed_practice

    async def next_round():
        async with extraction_database.sessionmaker() as session:
            practice = await session.get(PracticeSession, practice_id)
            user = await session.get(User, practice.user_id)
            try:
                await PracticeService(session).next_round(
                    user, practice_id, round_id=round_id
                )
                return True
            except ConflictError:
                return False

    assert sorted(await asyncio.gather(next_round(), next_round())) == [False, True]
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert [round.sequence for round in practice.rounds] == [0, 1]
        assert practice.rounds[0].result is not None
        assert len(practice.rounds[0].turns) == 2
        user = await session.get(User, practice.user_id)
        with pytest.raises(ConflictError, match="not the current round"):
            await PracticeService(session).end_session(
                user, practice_id, round_id=round_id
            )


async def test_end_session_releases_active_practice_and_freezes_history(
    extraction_database, completed_practice
):
    practice_id, round_id = completed_practice
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
        await service.end_session(user, practice_id, round_id=round_id)
        assert practice.ended_at is not None and user.active_practice_id is None
        with pytest.raises(ConflictError, match="ended"):
            await service.retry_round(user, practice_id, round_id=round_id)
        new = await service.create(
            user,
            role=practice.role,
            question_type="project",
            difficulty="basic",
            max_follow_ups=0,
        )
        assert new.id != practice_id and user.active_practice_id == new.id
        await session.refresh(practice)
        assert practice.ended_at is not None and practice.rounds[0].result is not None


async def test_skip_commits_replacement_even_when_checkpoint_cleanup_fails(
    extraction_database, awaiting_practice, practice_question, monkeypatch
):
    def unavailable(*args):
        raise RuntimeError("Checkpointer unavailable")

    monkeypatch.setattr("riva.ai.checkpoints.open_checkpointer", unavailable)
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        user = await session.get(User, practice.user_id)
        old_id = practice.rounds[0].id
        await PracticeService(session).skip_round(user, practice.id, round_id=old_id)
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        assert len(practice.rounds) == 1
        assert practice.rounds[0].id != old_id and practice.rounds[0].sequence == 0
        assert practice.rounds[0].turns == [] and practice.rounds[0].job_id is not None
        assert await session.get(PracticeTurn, practice_question.id) is None


async def test_concurrent_create_claims_one_active_session(
    extraction_database, extraction_role
):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        user_id = role.user_id
        session.add(CareerProfile(user_id=user_id))
        await session.commit()

    async def create():
        async with extraction_database.sessionmaker() as session:
            role = await session.get(Role, extraction_role)
            user = await session.get(User, user_id)
            try:
                practice = await PracticeService(session).create(
                    user,
                    role=role,
                    question_type="project",
                    difficulty="basic",
                    max_follow_ups=0,
                )
                return practice.id
            except ConflictError:
                return None

    ids = await asyncio.gather(create(), create())
    assert ids.count(None) == 1
    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user.active_practice_id == next(id for id in ids if id is not None)
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


async def test_create_dispatch_failure_rolls_back_active_session(
    extraction_database, extraction_role, monkeypatch
):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        user_id = role.user_id
        user = await session.get(User, user_id)
        session.add(CareerProfile(user_id=user_id))
        await session.commit()
        service = PracticeService(session)
        start = service.tasks.start

        async def fail_after_enqueue(*args, **kwargs):
            await start(*args, **kwargs)
            raise RuntimeError("Dispatch failed")

        monkeypatch.setattr(service.tasks, "start", fail_after_enqueue)
        with pytest.raises(RuntimeError, match="Dispatch failed"):
            await service.create(
                user,
                role=role,
                question_type="project",
                difficulty="basic",
                max_follow_ups=0,
            )
        await session.rollback()
    async with extraction_database.sessionmaker() as session:
        assert (await session.get(User, user_id)).active_practice_id is None
        assert (
            await session.scalar(select(func.count()).select_from(PracticeSession)) == 0
        )
        assert (
            await session.scalar(select(func.count()).select_from(PracticeRound)) == 0
        )
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 0
        )
