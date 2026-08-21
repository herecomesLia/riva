import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import AgentRun, PracticeReferenceAnswerArtifact, PracticeSession, User
from riva.services.practice_sessions import PracticeSessionService
from tests.integration.test_practice_next_question_workflow import produce_first_review
from tests.integration.test_question_generation import database_url

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def test_targeted_practice_training_record_api_is_read_only_and_scoped() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                user_id, session_id, *_ = await produce_first_review(database)
                settings = Settings(
                    database_url=url,
                    llm_provider="qwen",
                    llm_model="fake-training-record-api-model",
                    cors_allowed_origins=[TRUSTED_ORIGIN],
                    session_digest_key="targeted-practice-record-api-key",
                    session_cookie_secure=False,
                )
                app = create_app(settings)
                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    active = client.get(f"/api/training-records/practice/{session_id}")
                assert active.status_code == 404
                assert active.json() == {"error": "training_record_not_found"}

                other_user = User(
                    id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
                    username="targeted-practice-record-other-user",
                    normalized_username="targeted-practice-record-other-user",
                    password_hash="hash",
                    display_name="Other User",
                )
                app.dependency_overrides[require_current_user] = lambda: other_user
                with TestClient(app) as client:
                    isolated = client.get(
                        f"/api/training-records/practice/{session_id}"
                    )
                assert isolated.status_code == 404
                assert isolated.json() == {"error": "training_record_not_found"}
                app.dependency_overrides[require_current_user] = lambda: owner

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
                    completed = await session.get(PracticeSession, session_id)
                    assert completed is not None
                    before = {
                        "session": (
                            completed.status,
                            completed.version,
                            completed.updated_at,
                        ),
                        "agentRuns": list(
                            (
                                await session.scalars(
                                    select(AgentRun.id).where(
                                        AgentRun.user_id == user_id
                                    )
                                )
                            ).all()
                        ),
                        "referenceArtifacts": list(
                            (
                                await session.scalars(
                                    select(PracticeReferenceAnswerArtifact.id)
                                )
                            ).all()
                        ),
                    }

                # The workflow helper completes the reference-answer guarantee before
                # this request, so the API should only project the completed snapshot.
                with TestClient(app) as client:
                    response = client.get(
                        f"/api/training-records/practice/{session_id}"
                    )
                    missing = client.get(
                        "/api/training-records/practice/99999999-9999-4999-8999-999999999999"
                    )

                assert response.status_code == 200
                body = response.json()
                assert body["recordId"] == str(session_id)
                assert body["kind"] == "targetedPractice"
                assert body["status"] == "completed"
                assert len(body["attempts"]) == 1
                assert body["attempts"][0]["question"]["referenceAnswer"]["status"] == (
                    "revealed"
                )
                assert body["targetRole"]["title"]
                assert body["attempts"][0]["evaluation"] is not None
                assert body["attempts"][0]["review"] is not None
                assert body["attempts"][0]["recommendation"] is not None
                assert missing.status_code == 404
                assert missing.json() == {"error": "training_record_not_found"}

                async with database.sessionmaker() as session:
                    after_session = await session.get(PracticeSession, session_id)
                    assert after_session is not None
                    after = {
                        "session": (
                            after_session.status,
                            after_session.version,
                            after_session.updated_at,
                        ),
                        "agentRuns": list(
                            (
                                await session.scalars(
                                    select(AgentRun.id).where(
                                        AgentRun.user_id == user_id
                                    )
                                )
                            ).all()
                        ),
                        "referenceArtifacts": list(
                            (
                                await session.scalars(
                                    select(PracticeReferenceAnswerArtifact.id)
                                )
                            ).all()
                        ),
                    }
                assert after == before
            finally:
                await database.reset()

    asyncio.run(run_test())
