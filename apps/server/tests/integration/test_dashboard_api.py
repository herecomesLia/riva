from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.core.app import create_app
from riva.db.database import Database
from riva.models import (
    CompetencyEvidence,
    CurrentTargetRole,
    TargetRole,
    User,
    UserCompetency,
)
from riva.services.competencies import CompetencyService
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration


def _settings(database_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        cors_allowed_origins=["http://localhost:5173"],
        session_digest_key="dashboard-api-test-key",
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


def test_dashboard_api_is_authenticated_isolated_and_read_only() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner = _user("dashboard-owner")
                other = _user("dashboard-other")
                async with database.sessionmaker() as session:
                    session.add_all([owner, other])
                    await session.commit()

                    role = TargetRole(
                        user_id=owner.id,
                        title="Backend Engineer",
                        company="Riva",
                        recruitment_type="experienced",
                        location="Shanghai",
                        min_experience_years=None,
                        max_experience_years=None,
                        preparation_status="preparing",
                        job_description_status="missing",
                        raw_job_description=None,
                        job_description_version=None,
                        version=1,
                    )
                    session.add(role)
                    await session.flush()
                    session.add(
                        CurrentTargetRole(user_id=owner.id, role_id=role.id)
                    )
                    await session.commit()

                    competency = await CompetencyService(
                        session
                    ).get_or_create_competency(
                        owner.id,
                        "results_and_evidence",
                        "Results and Evidence",
                    )
                    await CompetencyService(session).add_evidence(
                        user_id=owner.id,
                        competency_id=competency.id,
                        source_type="practice",
                        source_session_id=uuid4(),
                        source_entity_type="practiceAttempt",
                        source_entity_id=uuid4(),
                        signal_type="score",
                        score=50,
                        occurred_at=datetime(2026, 8, 17, 10, tzinfo=UTC),
                    )
                    competency.level = 50
                    competency.confidence = 40
                    await session.commit()

                    before = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.id == competency.id
                        )
                    )
                    assert before is not None
                    before_state = (
                        before.level,
                        before.confidence,
                        before.evidence_count,
                        before.updated_at,
                    )

                app = create_app(_settings(database_url))
                with TestClient(app) as client:
                    assert client.get("/api/dashboard").status_code == 401

                    app.dependency_overrides[require_current_user] = lambda: owner
                    owner_response = client.get("/api/dashboard")
                    assert owner_response.status_code == 200
                    owner_body = owner_response.json()
                    assert owner_body["currentRole"] == {
                        "id": str(role.id),
                        "title": "Backend Engineer",
                        "company": "Riva",
                        "recruitmentType": "experienced",
                        "location": "Shanghai",
                        "experienceYears": None,
                        "profileCompleted": False,
                        "jobDescriptionAdded": False,
                    }
                    assert owner_body["metrics"]["roleFit"] == {
                        "currentValue": None,
                        "previousValue": None,
                    }
                    assert owner_body["weaknesses"][0]["category"] == (
                        "quantifiedResults"
                    )
                    assert owner_body["recommendation"] is None

                    app.dependency_overrides[require_current_user] = lambda: other
                    other_response = client.get("/api/dashboard")
                    assert other_response.status_code == 200
                    assert other_response.json() == {
                        "currentRole": None,
                        "recommendation": None,
                        "metrics": {
                            "roleFit": {
                                "currentValue": None,
                                "previousValue": None,
                            },
                            "practiceTimeMinutes": {
                                "currentValue": None,
                                "previousValue": None,
                            },
                            "targetedPracticeScore": {
                                "currentValue": None,
                                "previousValue": None,
                            },
                            "mockInterviewScore": {
                                "currentValue": None,
                                "previousValue": None,
                            },
                        },
                        "performanceTrend": {
                            "targetedPractice": [],
                            "mockInterview": [],
                        },
                        "weaknesses": [],
                    }

                async with database.sessionmaker() as session:
                    after = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.id == competency.id
                        )
                    )
                    assert after is not None
                    assert (
                        after.level,
                        after.confidence,
                        after.evidence_count,
                        after.updated_at,
                    ) == before_state
                    assert await session.scalar(
                        select(CompetencyEvidence.id).where(
                            CompetencyEvidence.competency_id == competency.id
                        )
                    ) is not None
            finally:
                await database.reset()

    import asyncio

    asyncio.run(run_test())
