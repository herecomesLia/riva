import asyncio
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
)
from riva.services.practice_sessions import (
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_question_generation_idempotency_key,
)
from tests.integration.test_practice_answer_api import start_answering
from tests.integration.test_question_generation import database_url, seed_context

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-skip-api-test-key",
        session_cookie_secure=False,
    )


class FailingQuestionGenerationService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing downstream model")


async def question_state(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
) -> tuple[list[PracticeAttempt], list[AgentRun], list[QuestionCard]]:
    async with database.sessionmaker() as session:
        attempts = list(
            (
                await session.scalars(
                    select(PracticeAttempt)
                    .where(PracticeAttempt.session_id == session_id)
                    .order_by(PracticeAttempt.attempt_number)
                )
            ).all()
        )
        runs = list(
            (
                await session.scalars(
                    select(AgentRun)
                    .where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "question-generator",
                    )
                    .order_by(AgentRun.created_at)
                )
            ).all()
        )
        cards = list(
            (
                await session.scalars(
                    select(QuestionCard).where(QuestionCard.user_id == user_id)
                )
            ).all()
        )
        return attempts, runs, cards


def test_practice_skip_replaces_answering_attempt_and_replays_no_duplicate() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    question_id = UUID(answering["question"]["id"])
                    old_attempt_id = UUID(answering["attemptId"])
                    old_version = answering["version"]

                    async with database.sessionmaker() as session:
                        old_attempt = await session.get(
                            PracticeAttempt,
                            old_attempt_id,
                        )
                        assert old_attempt is not None
                        old_run_id = old_attempt.question_generation_run_id
                        old_attempt_number = old_attempt.attempt_number
                        assert old_run_id is not None

                    stale = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": old_version - 1,
                            "questionId": str(question_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert stale.status_code == 409
                    assert stale.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    wrong_question = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": old_version,
                            "questionId": str(uuid4()),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert wrong_question.status_code == 409
                    assert wrong_question.json() == {
                        "error": "practice_session_state_conflict"
                    }

                    saved = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/saved",
                        json={
                            "version": old_version,
                            "questionId": str(question_id),
                            "isSaved": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert saved.status_code == 200
                    weak = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/weak",
                        json={
                            "version": old_version + 1,
                            "questionId": str(question_id),
                            "isMarkedWeak": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert weak.status_code == 200
                    assert weak.json()["version"] == old_version + 2

                    skipped = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": old_version + 2,
                            "questionId": str(question_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert skipped.status_code == 202
                    skipped_body = skipped.json()
                    assert skipped_body["status"] == "generatingQuestion"
                    assert skipped_body["version"] == old_version + 3
                    assert skipped_body["attemptNumber"] == old_attempt_number
                    assert skipped_body["attemptId"] != str(old_attempt_id)
                    assert "question" not in skipped_body

                    duplicate = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": old_version + 2,
                            "questionId": str(question_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert duplicate.status_code == 409
                    assert duplicate.json() == {
                        "error": "practice_session_version_conflict"
                    }

                attempts, runs, cards = await question_state(
                    database,
                    user_id=owner.id,
                    session_id=UUID(session_id),
                )
                assert len(attempts) == 1
                replacement = attempts[0]
                assert replacement.id == UUID(skipped_body["attemptId"])
                assert replacement.attempt_number == old_attempt_number
                assert replacement.status == "generatingQuestion"
                assert replacement.question_card_id is None
                assert replacement.question_generation_run_id is not None
                assert len(runs) == 2
                assert {run.id for run in runs} == {
                    old_run_id,
                    replacement.question_generation_run_id,
                }
                replacement_run = next(
                    run
                    for run in runs
                    if run.id == replacement.question_generation_run_id
                )
                assert replacement_run.status == AgentRunStatus.QUEUED
                assert replacement_run.idempotency_key == (
                    practice_question_generation_idempotency_key(
                        UUID(session_id),
                        replacement.id,
                    )
                )
                assert replacement_run.idempotency_key != next(
                    run.idempotency_key for run in runs if run.id == old_run_id
                )
                assert replacement_run.payload["questionType"] == "projectDeepDive"
                assert replacement_run.payload["difficulty"] == "basic"
                assert len(cards) == 1
                assert cards[0].id == question_id
                assert cards[0].is_saved is True
                assert cards[0].is_marked_weak is True
                assert all(
                    attempt.status not in {"completed", "review"}
                    for attempt in attempts
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_skip_rejects_submitted_and_non_answering_attempts() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    question_id = answering["question"]["id"]
                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": answering["version"],
                            "questionId": question_id,
                            "content": "The submitted answer.",
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert submitted.status_code == 202
                    assert submitted.json()["status"] == "generatingFollowUp"

                    rejected = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": submitted.json()["version"],
                            "questionId": question_id,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert rejected.status_code == 409
                    assert rejected.json() == {
                        "error": "practice_session_state_conflict"
                    }
            finally:
                await database.reset()

    asyncio.run(run_test())


@pytest.mark.parametrize(
    "status",
    ["answeringFollowUp", "evaluating", "review"],
)
def test_practice_skip_rejects_follow_up_evaluating_and_review(status: str) -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    async with database.sessionmaker() as session:
                        attempt = await session.get(
                            PracticeAttempt,
                            UUID(answering["attemptId"]),
                        )
                        assert attempt is not None
                        attempt.status = status
                        await session.commit()

                    rejected = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": answering["version"],
                            "questionId": answering["question"]["id"],
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert rejected.status_code == 409
                    assert rejected.json() == {
                        "error": "practice_session_state_conflict"
                    }
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_skip_enqueue_failure_rolls_back_the_original_attempt() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                old_attempt_id = UUID(answering["attemptId"])
                old_question_id = UUID(answering["question"]["id"])

                async with database.sessionmaker() as session:
                    with pytest.raises(PracticeSessionStateError) as error:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                            question_generation_service_factory=(
                                lambda _session, **_kwargs: (
                                    FailingQuestionGenerationService()
                                )
                            ),
                        ).skip_current_question(
                            user_id=owner.id,
                            session_id=UUID(session_id),
                            expected_version=answering["version"],
                            question_id=old_question_id,
                        )
                    assert error.value.code == (
                        PRACTICE_QUESTION_GENERATION_UNAVAILABLE
                    )

                async with database.sessionmaker() as session:
                    old_attempt = await session.get(
                        PracticeAttempt,
                        old_attempt_id,
                    )
                    practice_session = await session.get(
                        PracticeSession,
                        UUID(session_id),
                    )
                    assert old_attempt is not None
                    assert practice_session is not None
                    assert old_attempt.status == "answering"
                    assert old_attempt.question_card_id == old_question_id
                    assert practice_session.version == answering["version"]

                async with database.sessionmaker() as session:
                    continued = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).skip_current_question(
                        user_id=owner.id,
                        session_id=UUID(session_id),
                        expected_version=answering["version"],
                        question_id=old_question_id,
                    )
                    assert continued.attempt.id != old_attempt_id
                    assert continued.attempt.attempt_number == 1
                    assert continued.session.version == answering["version"] + 1
            finally:
                await database.reset()

    asyncio.run(run_test())
