import asyncio
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.db.database import Database
from riva.integrations import MessageRole, StructuredGenerationRequest
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewQuestion,
    InterviewReview,
    UserCompetency,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_interview_completion_workflow import (
    _headers,
    _process_worker,
    _reach_candidate_questions,
    _review_output,
)
from tests.integration.test_interview_planning_workflow import (
    _app,
    _planner_output,
    _settings,
    migrated_database_url,
)
from tests.integration.test_interview_turn_workflow import _turn_output
from tests.integration.test_recommendation_generation import (
    build_recommendation_worker,
    database_url,
    enqueue_recommendation,
    produce_review,
    recommendation_response,
)


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)


def test_practice_recommendation_uses_the_enqueue_memory_snapshot() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, _practice_session, attempt, _review_run = await produce_review(
                    database
                )
                async with database.sessionmaker() as session:
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "specificity",
                        )
                    )
                    if competency is None:
                        competency = UserCompetency(
                            user_id=owner.id,
                            competency_key="specificity",
                            display_name="Specificity",
                        )
                        session.add(competency)
                    competency.level = 52
                    competency.confidence = 75
                    competency.evidence_count = 2
                    competency.trend = "improving"
                    competency.last_evidence_at = NOW
                    await session.commit()

                recommendation_run = await enqueue_recommendation(
                    database,
                    owner.id,
                    attempt.id,
                )
                assert recommendation_run.prompt_version == "2"
                frozen_memory = recommendation_run.payload["trainingMemory"]
                assert frozen_memory["focusCompetencies"][0]["level"] == 52

                async with database.sessionmaker() as session:
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "specificity",
                        )
                    )
                    assert competency is not None
                    competency.level = 91
                    competency.confidence = 95
                    competency.trend = "stable"
                    await session.commit()

                provider = FakeLLMProvider(
                    [recommendation_response("nextQuestion")],
                    usage=None,
                )
                assert await build_recommendation_worker(database, provider).process_one()

                request = provider.calls[0]
                assert isinstance(request, StructuredGenerationRequest)
                user_message = next(
                    message.content
                    for message in request.messages
                    if message.role is MessageRole.USER
                )
                assert '"level":52' in user_message
                assert '"level":91' not in user_message

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, recommendation_run.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_interview_review_freezes_memory_for_the_initial_review_enqueue(
    migrated_database_url: str,
) -> None:
    async def run_test() -> None:
        async with Database(migrated_database_url) as database:
            owner, role = await _seed_interview(database)
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                ]
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id = await _reach_candidate_questions(
                    database,
                    settings,
                    client,
                    role.id,
                    provider,
                )
                async with database.sessionmaker() as session:
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "specificity",
                        )
                    )
                    if competency is None:
                        competency = UserCompetency(
                            user_id=owner.id,
                            competency_key="specificity",
                            display_name="Specificity",
                        )
                        session.add(competency)
                    competency.level = 49
                    competency.confidence = 70
                    competency.evidence_count = 1
                    competency.trend = "improving"
                    competency.last_evidence_at = NOW
                    await session.commit()

                finish = client.post(
                    f"/api/interview/sessions/{session_id}/finish",
                    json={"version": 7},
                    headers=_headers(),
                )
                assert finish.status_code == 202

                async with database.sessionmaker() as session:
                    review_run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-review",
                        )
                    )
                    assert review_run is not None
                    assert review_run.prompt_version == "2"
                    frozen_memory = review_run.payload[
                        "interviewReviewInput"
                    ]["trainingMemory"]
                    assert frozen_memory["focusCompetencies"][0]["level"] == 49
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "specificity",
                        )
                    )
                    assert competency is not None
                    competency.level = 93
                    competency.confidence = 95
                    competency.trend = "stable"
                    await session.commit()
                    questions = list(
                        (
                            await session.scalars(
                                select(InterviewQuestion)
                                .where(InterviewQuestion.session_id == session_id)
                                .order_by(InterviewQuestion.order)
                            )
                        ).all()
                    )

                provider.responses.append(_review_output([item.id for item in questions]))
                await _process_worker(database, settings, provider)

                request = provider.calls[-1]
                assert isinstance(request, StructuredGenerationRequest)
                user_message = next(
                    message.content
                    for message in request.messages
                    if message.role is MessageRole.USER
                )
                assert '"level":49' in user_message
                assert '"level":93' not in user_message

                async with database.sessionmaker() as session:
                    review = await session.scalar(
                        select(InterviewReview).where(
                            InterviewReview.session_id == session_id
                        )
                    )
                    stored_run = await session.get(AgentRun, review_run.id)
                    assert review is not None
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED

    asyncio.run(run_test())


async def _seed_interview(database: Database):
    from tests.helpers.interview import seed_interview_prerequisites

    seeded = await seed_interview_prerequisites(
        database,
        label="adaptive-training-memory",
    )
    return seeded[0], seeded[1]
