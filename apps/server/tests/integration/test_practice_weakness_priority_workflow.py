import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from riva.agents import QuestionGenerationAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import AgentRun, PracticeAttempt, PracticeSession, QuestionCard, User
from riva.services.practice_sessions import (
    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE,
    PracticeSessionService,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    produce_first_review,
    question_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str, *, llm_enabled: bool) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen" if llm_enabled else None,
        llm_model="fake-practice-model" if llm_enabled else None,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-weakness-priority-test-key",
        session_cookie_secure=False,
    )


async def count_sessions(database: Database, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(PracticeSession.id)).where(
                    PracticeSession.user_id == user_id
                )
            )
            or 0
        )


def test_personalized_priority_snapshots_focus_and_runs_v2_worker() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner_id,
                    reviewed_session_id,
                    reviewed_attempt_id,
                    _reviewed_card_id,
                    _reviewed_question_run_id,
                    project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=owner_id,
                        session_id=reviewed_session_id,
                        expected_version=5,
                    )
                    assert completed.session.status == "completed"
                    role_id = completed.session.target_role_id
                    owner = await session.get(User, owner_id)
                    assert owner is not None

                async with database.sessionmaker() as session:
                    question_runs_before = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner_id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )

                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    headers = {
                        "Origin": TRUSTED_ORIGIN,
                        "Accept-Language": "en-US",
                    }
                    setup = client.get("/api/practice/setup", headers=headers)
                    assert setup.status_code == 200
                    assert setup.json()["canPrioritizeWeaknesses"] is True

                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "personalized",
                            "prioritizeWeaknesses": True,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "generatingQuestion"
                    assert started_body["selection"]["prioritizeWeaknesses"] is True
                    session_id = UUID(started_body["sessionId"])

                async with database.sessionmaker() as session:
                    attempt = await session.scalar(
                        select(PracticeAttempt).where(
                            PracticeAttempt.session_id == session_id
                        )
                    )
                    assert attempt is not None
                    assert attempt.question_generation_run_id is not None
                    run = await session.get(
                        AgentRun,
                        attempt.question_generation_run_id,
                    )
                    assert run is not None
                    assert run.prompt_version == "2"
                    assert run.payload["weaknessFocus"][0]["sourceAttemptId"] == str(
                        reviewed_attempt_id
                    )

                assert len(
                    question_runs_before
                ) + 1 == len(
                    (
                        await session_count_question_runs(
                            database,
                            owner_id,
                        )
                    )
                )

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain a decision where you showed ownership.",
                                )
                            ],
                            provider="weakness-priority-question-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/question-generation/refresh",
                        json={"version": 1},
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert refreshed.status_code == 200
                    assert refreshed.json()["status"] == "answering"
            finally:
                await database.reset()

    asyncio.run(run_test())


async def session_count_question_runs(database: Database, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(AgentRun.id)).where(
                    AgentRun.user_id == user_id,
                    AgentRun.agent_id == "question-generator",
                )
            )
            or 0
        )


def test_priority_without_eligible_weakness_does_not_create_session() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, _project_id = await seed_context(database)
                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                before = await count_sessions(database, owner.id)
                with TestClient(app) as client:
                    response = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "personalized",
                            "prioritizeWeaknesses": True,
                        },
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                assert response.status_code == 409
                assert response.json() == {
                    "error": PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
                }
                assert await count_sessions(database, owner.id) == before
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_and_history_priority_reuse_cards_without_llm_or_new_question_run() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                for source in ("saved", "history"):
                    await database.reset()
                    (
                        owner_id,
                        reviewed_session_id,
                        _reviewed_attempt_id,
                        card_id,
                        _question_run_id,
                        _project_id,
                    ) = await produce_first_review(database)
                    async with database.sessionmaker() as session:
                        completed = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).complete_session_after_review(
                            user_id=owner_id,
                            session_id=reviewed_session_id,
                            expected_version=5,
                        )
                        card = await session.get(QuestionCard, card_id)
                        owner = await session.get(User, owner_id)
                        assert card is not None
                        assert owner is not None
                        if source == "saved":
                            card.is_saved = True
                            await session.commit()
                        role_id = completed.session.target_role_id

                    before = await session_count_question_runs(database, owner_id)
                    app = create_app(settings(url, llm_enabled=False))
                    app.dependency_overrides[require_current_user] = lambda: owner
                    with TestClient(app) as client:
                        started = client.post(
                            "/api/practice/sessions",
                            json={
                                "targetRoleId": str(role_id),
                                "questionType": "projectDeepDive",
                                "difficulty": "basic",
                                "source": source,
                                "prioritizeWeaknesses": True,
                            },
                            headers={
                                "Origin": TRUSTED_ORIGIN,
                                "Accept-Language": "en-US",
                            },
                        )
                    assert started.status_code == 202
                    body = started.json()
                    assert body["status"] == "answering"
                    assert body["question"]["id"] == str(card_id)
                    async with database.sessionmaker() as session:
                        attempt = await session.get(
                            PracticeAttempt,
                            UUID(body["attemptId"]),
                        )
                        assert attempt is not None
                        assert attempt.question_generation_run_id is None
                    assert await session_count_question_runs(database, owner_id) == before
            finally:
                await database.reset()

    asyncio.run(run_test())
