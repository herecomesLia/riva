import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from riva.db.database import Database
from riva.models import AgentRun, InterviewFollowUpQuestion, InterviewQuestion
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.interview import seed_interview_prerequisites
from tests.integration.test_interview_completion_workflow import (
    _app,
    _candidate_output,
    _headers,
    _planner_output,
    _partial_review_output,
    _prepare_profile_snapshot,
    _process_worker,
    _reach_candidate_questions,
    _review_output,
    _settings,
    _unavailable_review_output,
    migrated_database_url,
)
from tests.integration.test_interview_planning_workflow import _start_and_begin
from tests.integration.test_interview_turn_workflow import _answer_request, _turn_output


pytestmark = pytest.mark.integration


def test_mock_interview_training_record_detail_is_a_read_only_projection(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-record-complete",
                summary="TRAINING_RECORD_COMPLETE_PROFILE",
            )
            await _prepare_profile_snapshot(database, profile.profile_id)
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                    _candidate_output(),
                ],
                provider="fake-training-record-complete-provider",
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
                candidate_state = client.get("/api/interview", headers=_headers())
                assert candidate_state.status_code == 200
                assert candidate_state.json()["session"]["status"] == (
                    "candidateQuestions"
                )
                candidate_version = candidate_state.json()["session"]["version"]
                candidate = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={
                        "version": candidate_version,
                        "content": "How does the team define success for this role?",
                    },
                    headers=_headers(),
                )
                assert candidate.status_code == 202
                await _process_worker(database, settings, provider)

                async with database.sessionmaker() as session:
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
                finish_page = client.get("/api/interview", headers=_headers())
                assert finish_page.status_code == 200
                finish_version = finish_page.json()["session"]["version"]
                finish = client.post(
                    f"/api/interview/sessions/{session_id}/finish",
                    json={"version": finish_version},
                    headers=_headers(),
                )
                assert finish.status_code == 202
                await _process_worker(database, settings, provider)

                async with database.sessionmaker() as session:
                    before_read = await session.scalar(
                        select(func.count(AgentRun.id)).where(
                            AgentRun.user_id == owner.id,
                        )
                    )

                detail = client.get(
                    f"/api/training-records/interview/{session_id}",
                    headers=_headers(),
                )
                assert detail.status_code == 200
                body = detail.json()
                assert body["status"] == "completed"
                assert body["completionReason"] == "formalQuestionsCompleted"
                assert body["targetRole"] == {
                    "id": str(role.id),
                    "title": role.title,
                    "company": role.company,
                }
                assert body["setup"] == {
                    "round": "technical",
                    "difficulty": "pressure",
                    "plannedDurationMinutes": 15,
                }
                assert len(body["questionDetails"]) == 2
                assert all(
                    detail["referenceAnswer"]["status"] == "ready"
                    for detail in body["questionDetails"]
                )
                assert body["review"]["status"] == "complete"
                assert body["review"]["review"]["overallScore"] == 84
                assert len(body["candidateQuestionExchanges"]) == 1

                async with database.sessionmaker() as session:
                    after_read = await session.scalar(
                        select(func.count(AgentRun.id)).where(
                            AgentRun.user_id == owner.id,
                        )
                    )
                assert after_read == before_read

            other_owner, _other_role, _other_profile = (
                await seed_interview_prerequisites(
                    database,
                    label="training-record-other-user",
                )
            )
            with TestClient(_app(migrated_database_url, other_owner)) as other_client:
                isolated = other_client.get(
                    f"/api/training-records/interview/{session_id}",
                    headers=_headers(),
                )
                missing = other_client.get(
                    f"/api/training-records/interview/{UUID(int=0)}",
                    headers=_headers(),
                )
            assert isolated.status_code == 404
            assert missing.status_code == 404

    asyncio.run(run_workflow())


def test_mock_interview_training_record_preserves_unanswered_question_on_early_end(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-record-ended-early",
                summary="TRAINING_RECORD_EARLY_END_PROFILE",
            )
            await _prepare_profile_snapshot(database, profile.profile_id)
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [_planner_output(2)],
                provider="fake-training-record-ended-early-provider",
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                    duration_minutes=15,
                )
                await _process_worker(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id
                        )
                    )
                assert question is not None
                provider.responses.append(_unavailable_review_output([question.id]))

                end = client.post(
                    f"/api/interview/sessions/{session_id}/end",
                    json={"version": 3},
                    headers=_headers(),
                )
                assert end.status_code == 202
                await _process_worker(database, settings, provider)

                detail = client.get(
                    f"/api/training-records/interview/{session_id}",
                    headers=_headers(),
                )
                assert detail.status_code == 200
                body = detail.json()
                assert body["status"] == "endedEarly"
                assert body["review"]["status"] == "unavailable"
                assert len(body["questionDetails"]) == 1
                assert body["questionDetails"][0]["record"]["status"] == "unanswered"
                assert body["questionDetails"][0]["record"]["answer"] is None
                assert (
                    body["questionDetails"][0]["referenceAnswer"]["status"]
                    == "ready"
                )

    asyncio.run(run_workflow())


def test_mock_interview_training_record_partial_projection_keeps_main_answer_and_follow_up(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-record-partial",
                summary="TRAINING_RECORD_PARTIAL_PROFILE",
            )
            await _prepare_profile_snapshot(database, profile.profile_id)
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [_planner_output(2), _turn_output("followUp")],
                provider="fake-training-record-partial-provider",
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                    duration_minutes=15,
                )
                await _process_worker(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id
                        )
                    )
                assert question is not None
                answer = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=question.id,
                )
                assert answer.status_code == 202
                await _process_worker(database, settings, provider)

                async with database.sessionmaker() as session:
                    follow_up = await session.scalar(
                        select(InterviewFollowUpQuestion).where(
                            InterviewFollowUpQuestion.parent_question_id == question.id
                        )
                    )
                assert follow_up is not None
                provider.responses.append(
                    _partial_review_output([question.id], (follow_up.id,))
                )
                end = client.post(
                    f"/api/interview/sessions/{session_id}/end",
                    json={"version": 5},
                    headers=_headers(),
                )
                assert end.status_code == 202
                await _process_worker(database, settings, provider)

                detail = client.get(
                    f"/api/training-records/interview/{session_id}",
                    headers=_headers(),
                )
                assert detail.status_code == 200
                body = detail.json()
                question_detail = body["questionDetails"][0]
                assert body["status"] == "partiallyCompleted"
                assert question_detail["record"]["answer"]["content"].startswith(
                    "I made the decision"
                )
                assert question_detail["followUps"][0]["record"]["status"] == (
                    "unanswered"
                )
                assert question_detail["followUps"][0]["record"]["answer"] is None
                assert body["review"]["status"] == "partial"

    asyncio.run(run_workflow())
