import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text

from riva.models.career_profile import CareerProfile
from riva.models.practice import PracticeSession, PracticeTurn
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
from riva.services.practice import PracticeService
from riva.services.roles import RoleService
from riva.tasks import TaskController


@pytest.fixture
async def awaiting_practice(extraction_database, practice_id, practice_question):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        await TaskController(session).abort(practice.job_id)
        practice.job_id = None
        practice.turns.append(
            PracticeTurn(
                practice_id=practice.id, sequence=0, **practice_question.model_dump()
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
                {"id": practice.job_id},
            )
        ).one()
        assert job.task_name == "practice.run"
        assert job.args == {"practice_id": str(practice_id), "answer_turn_id": None}
        assert practice.role_title_snapshot == practice.role.title
        assert practice.turns == [] and practice.result is None


@pytest.mark.parametrize("operation", ["create", "answer"])
async def test_dispatch_failure_rolls_back_business_writes(
    extraction_database, awaiting_practice, practice_question, monkeypatch, operation
):
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        user = await session.get(User, practice.user_id)
        service = PracticeService(session)
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
            if operation == "create":
                await service.create(
                    user,
                    role=practice.role,
                    question_type="project",
                    difficulty="basic",
                    max_follow_ups=0,
                )
            else:
                await service.answer(
                    user,
                    practice.id,
                    question_id=practice_question.id,
                    content="My answer",
                )
        await session.rollback()
    async with extraction_database.sessionmaker() as session:
        assert (
            await session.scalar(select(func.count()).select_from(PracticeSession)) == 1
        )
        assert await session.scalar(select(func.count()).select_from(PracticeTurn)) == 1
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
                question_id=practice_question.id,
                content="My contribution",
            )
            return result.job_id

    first, second = await asyncio.gather(submit(), submit())
    assert first == second
    async with extraction_database.sessionmaker() as session:
        practice = await session.get(PracticeSession, awaiting_practice)
        assert [(turn.sequence, turn.role) for turn in practice.turns] == [
            (0, "assistant"),
            (1, "user"),
        ]
        args = await session.scalar(
            text("SELECT args FROM procrastinate.procrastinate_jobs WHERE id = :id"),
            {"id": first},
        )
        assert args == {
            "practice_id": str(practice.id),
            "answer_turn_id": str(practice.turns[1].id),
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
            question_id=practice_question.id,
            content="Original answer",
        )
        await service.tasks.abort(practice.job_id)
        practice.job_id = None
        follow_up = practice_question.model_copy(
            update={"id": uuid4(), "content": "Why?"}
        )
        practice.turns.append(
            PracticeTurn(practice_id=practice.id, sequence=2, **follow_up.model_dump())
        )
        await session.commit()
        repeated = await service.answer(
            user,
            practice.id,
            question_id=practice_question.id,
            content="Original answer",
        )
        assert len(repeated.turns) == 3 and repeated.job_id is None
        with pytest.raises(ConflictError, match="different answer"):
            await service.answer(
                user,
                practice.id,
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
            user, practice.id, question_id=practice_question.id, content="Answer"
        )
        job_id = practice.job_id
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
