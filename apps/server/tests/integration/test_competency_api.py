import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.api.dependencies import require_current_user
from riva.core.app import create_app
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import User, UserCompetency
from riva.services.training.competencies import CompetencyService
from tests.helpers.integration_database import get_integration_database_url

pytestmark = pytest.mark.integration


def _settings(database_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        cors_allowed_origins=["http://localhost:5173"],
        session_digest_key="competency-api-test-key",
        session_cookie_secure=False,
    )


def _user(username: str) -> User:
    return User(
        id=uuid4(),
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def test_competency_read_api_is_scoped_ordered_and_read_only() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner = _user("competency-api-owner")
                other = _user("competency-api-other")
                async with database.sessionmaker() as session:
                    session.add_all([owner, other])
                    await session.commit()

                    service = CompetencyService(session)
                    created = []
                    for key in ("risk_control", "answer_quality", "communication"):
                        created.append(
                            await service.get_or_create_competency(
                                owner.id,
                                key,
                                key.replace("_", " ").title(),
                            )
                        )
                    other_competency = await service.get_or_create_competency(
                        other.id,
                        "answer_quality",
                        "Other Answer Quality",
                    )
                    created[0].level = 75
                    created[0].confidence = 80
                    created[0].evidence_count = 3
                    created[0].trend = "stable"
                    created[0].last_evidence_at = datetime(2026, 8, 17, 10, tzinfo=UTC)
                    await session.commit()
                    before = {
                        item.id: (
                            item.level,
                            item.confidence,
                            item.evidence_count,
                            item.trend,
                            item.last_evidence_at,
                            item.updated_at,
                        )
                        for item in [*created, other_competency]
                    }

                app = create_app(_settings(database_url))
                with TestClient(app) as client:
                    unauthenticated = client.get("/api/competencies")
                    assert unauthenticated.status_code == 401

                    app.dependency_overrides[require_current_user] = lambda: owner
                    response = client.get("/api/competencies")

                assert response.status_code == 200
                body = response.json()
                assert [item["competencyKey"] for item in body["items"]] == [
                    "answer_quality",
                    "communication",
                    "risk_control",
                ]
                assert body["items"][0]["displayName"] == "Answer Quality"
                assert body["items"][2] == {
                    "competencyKey": "risk_control",
                    "displayName": "Risk Control",
                    "level": 75,
                    "confidence": 80,
                    "trend": "stable",
                    "evidenceCount": 3,
                    "lastEvidenceAt": "2026-08-17T10:00:00Z",
                }

                async with database.sessionmaker() as session:
                    after = {
                        item.id: (
                            item.level,
                            item.confidence,
                            item.evidence_count,
                            item.trend,
                            item.last_evidence_at,
                            item.updated_at,
                        )
                        for item in list(
                            (
                                await session.scalars(
                                    select(UserCompetency).where(
                                        UserCompetency.id.in_(list(before))
                                    )
                                )
                            ).all()
                        )
                    }
                assert after == before
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_competency_read_api_returns_empty_for_user_without_competencies() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner = _user("competency-api-empty")
                async with database.sessionmaker() as session:
                    session.add(owner)
                    await session.commit()

                app = create_app(_settings(database_url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    response = client.get("/api/competencies")

                assert response.status_code == 200
                assert response.json() == {"items": []}
            finally:
                await database.reset()

    asyncio.run(run_test())
