import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMProviderConfigurationError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileWorkExperience,
    InterviewAnswer,
    InterviewFollowUpAnswer,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    InterviewTurnAssessment,
    TargetRole,
)
from riva.services.agent_runs import AgentRunService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_interview_planning_workflow import (
    _app,
    _headers,
    _planner_output,
    _settings,
    _start_and_begin,
    _worker,
    migrated_database_url,
)

pytestmark = pytest.mark.integration


def _turn_output(
    action: str = "followUp", prompt: str = "What evidence supports that decision?"
):
    return {
        "assessment": {
            "score": 82,
            "summary": "The answer contains a concrete decision and useful evidence.",
            "strengths": ["Concrete decision"],
            "issues": ["The result could be more specific."],
        },
        "nextAction": (
            {"type": "followUp", "prompt": prompt}
            if action == "followUp"
            else {"type": "completeQuestion"}
        ),
    }


def _answer_request(
    client: TestClient,
    session_id: UUID,
    *,
    version: int,
    question_id: UUID,
    content: str = "I made the decision, executed the change, and measured the outcome.",
):
    return client.post(
        f"/api/interview/sessions/{session_id}/answers",
        json={
            "version": version,
            "target": "question",
            "questionId": str(question_id),
            "content": content,
        },
        headers=_headers(),
    )


def _follow_up_answer_request(
    client: TestClient,
    session_id: UUID,
    *,
    version: int,
    question_id: UUID,
    follow_up_question_id: UUID,
    content: str = "The error rate and rollback signal supported that choice.",
):
    return client.post(
        f"/api/interview/sessions/{session_id}/answers",
        json={
            "version": version,
            "target": "followUp",
            "questionId": str(question_id),
            "followUpQuestionId": str(follow_up_question_id),
            "content": content,
        },
        headers=_headers(),
    )


async def _run_planner(
    database: Database,
    settings: Settings,
    provider: FakeLLMProvider,
) -> None:
    worker = _worker(database, settings, provider)
    assert await worker.process_one() is True


def test_interview_turn_success_persists_follow_up_and_frozen_snapshot(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await _seed(
                database,
                "turn-success",
                nullable_snapshot=True,
            )
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            provider = FakeLLMProvider(
                [_planner_output(), _turn_output()],
                provider="fake-interview-turn-provider",
            )

            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(
                    client,
                    role.id,
                )
                await _run_planner(database, settings, provider)

                async with database.sessionmaker() as session:
                    current = await session.scalar(
                        select(InterviewSession).where(
                            InterviewSession.id == session_id
                        )
                    )
                    assert current is not None
                    assert current.status == "question"
                    assert current.version == 3
                    first_question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 1,
                        )
                    )
                    assert first_question is not None
                    first_question_id = first_question.id
                    plan = await session.scalar(
                        select(InterviewPlan).where(
                            InterviewPlan.session_id == session_id
                        )
                    )
                    assert plan is not None
                    assert plan.source_agent_run_id != current.id

                submitted = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=first_question_id,
                )
                assert submitted.status_code == 202
                assert submitted.json()["session"]["status"] == "generatingTurn"
                assert submitted.json()["session"]["generationStatus"] == "generating"
                assert submitted.json()["session"]["version"] == 4

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-turn",
                                )
                                .order_by(AgentRun.created_at)
                            )
                        ).all()
                    )
                    assert len(runs) == 1
                    turn_run = runs[0]
                    assert turn_run.status is AgentRunStatus.QUEUED
                    assert turn_run.payload["sessionId"] == str(session_id)
                    assert turn_run.payload["sessionVersion"] == 3
                    assert turn_run.payload["sessionStateVersion"] == 4
                    assert turn_run.payload["targetType"] == "main"
                    assert "interviewTurnInput" in turn_run.payload
                    turn_snapshot = turn_run.payload["interviewTurnInput"]
                    assert turn_snapshot["mainAnswer"]["content"].startswith(
                        "I made the decision"
                    )
                    assert turn_snapshot["careerProfile"]["summary"] is None
                    assert turn_snapshot["targetRole"]["company"] is None
                    assert turn_snapshot["targetRole"]["location"] is None
                    assert (
                        turn_snapshot["careerProfile"]["workExperiences"][0]["location"]
                        is None
                    )

                    stored_profile = await session.get(
                        CareerProfile, profile.profile_id
                    )
                    assert stored_profile is not None
                    stored_profile.summary = "CHANGED_AFTER_ENQUEUE"
                    await session.commit()

                await _run_planner(database, settings, provider)

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, turn_run.id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assessment = await session.scalar(
                        select(InterviewTurnAssessment).where(
                            InterviewTurnAssessment.source_agent_run_id == turn_run.id
                        )
                    )
                    assert assessment is not None
                    assert assessment.main_answer_id is not None
                    assert assessment.follow_up_answer_id is None
                    follow_up = await session.scalar(
                        select(InterviewFollowUpQuestion).where(
                            InterviewFollowUpQuestion.parent_question_id
                            == first_question_id
                        )
                    )
                    assert follow_up is not None
                    assert follow_up.source_turn_run_id == turn_run.id
                    assert (
                        await session.scalar(
                            select(InterviewAnswer).where(
                                InterviewAnswer.question_id == first_question_id
                            )
                        )
                    ) is not None
                    assert (
                        await session.scalar(
                            select(InterviewSession.status).where(
                                InterviewSession.id == session_id
                            )
                        )
                    ) == "followUp"

                restored = client.get("/api/interview", headers=_headers())
                assert restored.status_code == 200
                body = restored.json()["session"]
                assert body["status"] == "followUp"
                assert body["completedQuestions"] == []
                assert body["currentQuestion"]["answer"]["content"].startswith(
                    "I made the decision"
                )
                assert body["currentFollowUp"]["status"] == "awaitingAnswer"
                assert len(provider.calls) == 2
                assert (
                    "CHANGED_AFTER_ENQUEUE"
                    not in provider.calls[-1].messages[1].content
                )

    asyncio.run(run_workflow())


def test_interview_turn_failed_run_is_visible_and_retryable(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await _seed(database, "turn-retry")
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            provider = FakeLLMProvider(
                [_planner_output(), LLMProviderConfigurationError(), _turn_output()],
                provider="fake-interview-turn-provider",
            )
            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(client, role.id)
                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id
                        )
                    )
                    assert question is not None
                submitted = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=question.id,
                )
                assert submitted.status_code == 202
                await _run_planner(database, settings, provider)

                failed = client.get("/api/interview", headers=_headers())
                assert failed.status_code == 200
                assert failed.json()["session"]["generationStatus"] == "failed"
                failed_run_id = UUID(failed.json()["session"]["sessionId"])
                assert failed_run_id == session_id
                failed_version = failed.json()["session"]["version"]

                retried = client.post(
                    f"/api/interview/sessions/{session_id}/turn/retry",
                    json={"version": failed_version},
                    headers=_headers(),
                )
                assert retried.status_code == 202
                assert retried.json()["session"]["status"] == "generatingTurn"
                assert retried.json()["session"]["version"] == failed_version + 1

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-turn",
                                )
                                .order_by(AgentRun.created_at)
                            )
                        ).all()
                    )
                    assert len(runs) == 2
                    assert runs[0].status is AgentRunStatus.FAILED
                    assert runs[0].id != runs[1].id
                    assert runs[0].idempotency_key != runs[1].idempotency_key

                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    current = await session.scalar(
                        select(InterviewSession).where(
                            InterviewSession.id == session_id
                        )
                    )
                    assert current is not None
                    assert current.status == "followUp"

    asyncio.run(run_workflow())


def test_interview_turn_stale_and_duplicate_answer_do_not_enqueue_again(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await _seed(database, "turn-conflict")
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            provider = FakeLLMProvider([_planner_output()], provider="fake")
            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(client, role.id)
                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id
                        )
                    )
                    assert question is not None
                first = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=question.id,
                )
                assert first.status_code == 202
                queued_retry = client.post(
                    f"/api/interview/sessions/{session_id}/turn/retry",
                    json={"version": 4},
                    headers=_headers(),
                )
                assert queued_retry.status_code == 409
                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="interview-turn-idempotency-worker",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.status is AgentRunStatus.RUNNING
                running_retry = client.post(
                    f"/api/interview/sessions/{session_id}/turn/retry",
                    json={"version": 4},
                    headers=_headers(),
                )
                assert running_retry.status_code == 409
                duplicate = _answer_request(
                    client,
                    session_id,
                    version=4,
                    question_id=question.id,
                )
                assert duplicate.status_code == 409
                stale = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=question.id,
                )
                assert stale.status_code == 409
                wrong_question = _answer_request(
                    client,
                    session_id,
                    version=3,
                    question_id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
                )
                assert wrong_question.status_code == 409

                async with database.sessionmaker() as session:
                    assert (
                        await session.scalar(
                            select(InterviewAnswer).where(
                                InterviewAnswer.question_id == question.id
                            )
                        )
                    ) is not None
                    assert (
                        len(
                            list(
                                (
                                    await session.scalars(
                                        select(AgentRun).where(
                                            AgentRun.user_id == owner.id,
                                            AgentRun.agent_id == "interview-turn",
                                        )
                                    )
                                ).all()
                            )
                        )
                        == 1
                    )

    asyncio.run(run_workflow())


def test_interview_turn_pressure_follow_up_limit_is_enforced_and_serialized(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            _owner, role, _profile = await _seed(database, "turn-pressure")
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, _owner)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output(prompt="What signal supported that rollout?"),
                    _turn_output(prompt="What would make you roll it back?"),
                    _turn_output(prompt="This third follow-up must be ignored."),
                ],
                provider="fake-interview-turn-pressure-provider",
            )
            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                    duration_minutes=15,
                )
                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    main_question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 1,
                        )
                    )
                    assert main_question is not None

                assert (
                    _answer_request(
                        client,
                        session_id,
                        version=3,
                        question_id=main_question.id,
                    ).status_code
                    == 202
                )
                await _run_planner(database, settings, provider)
                first_follow_up_page = client.get(
                    "/api/interview",
                    headers=_headers(),
                ).json()["session"]
                assert first_follow_up_page["status"] == "followUp"
                first_follow_up_id = UUID(
                    first_follow_up_page["currentFollowUp"]["question"]["id"]
                )
                assert "assessment" not in first_follow_up_page

                assert (
                    _follow_up_answer_request(
                        client,
                        session_id,
                        version=5,
                        question_id=main_question.id,
                        follow_up_question_id=first_follow_up_id,
                    ).status_code
                    == 202
                )
                await _run_planner(database, settings, provider)
                second_follow_up_page = client.get(
                    "/api/interview",
                    headers=_headers(),
                ).json()["session"]
                assert second_follow_up_page["status"] == "followUp"
                second_follow_up_id = UUID(
                    second_follow_up_page["currentFollowUp"]["question"]["id"]
                )
                assert (
                    len(second_follow_up_page["currentQuestion"]["answeredFollowUps"])
                    == 1
                )

                assert (
                    _follow_up_answer_request(
                        client,
                        session_id,
                        version=7,
                        question_id=main_question.id,
                        follow_up_question_id=second_follow_up_id,
                    ).status_code
                    == 202
                )
                await _run_planner(database, settings, provider)

                final_page = client.get("/api/interview", headers=_headers())
                assert final_page.status_code == 200
                final_session = final_page.json()["session"]
                assert final_session["status"] == "question"
                assert final_session["currentQuestion"]["question"]["order"] == 2
                assert len(final_session["completedQuestions"]) == 1
                completed = final_session["completedQuestions"][0]
                assert len(completed["followUps"]) == 2

                async with database.sessionmaker() as session:
                    follow_up_questions = list(
                        (
                            await session.scalars(
                                select(InterviewFollowUpQuestion).where(
                                    InterviewFollowUpQuestion.parent_question_id
                                    == main_question.id
                                )
                            )
                        ).all()
                    )
                    follow_up_answers = list(
                        (
                            await session.scalars(
                                select(InterviewFollowUpAnswer).where(
                                    InterviewFollowUpAnswer.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    assessments = list(
                        (
                            await session.scalars(
                                select(InterviewTurnAssessment).where(
                                    InterviewTurnAssessment.question_id
                                    == main_question.id
                                )
                            )
                        ).all()
                    )
                    assert len(follow_up_questions) == 2
                    assert len(follow_up_answers) == 2
                    assert [assessment.decision for assessment in assessments] == [
                        "followUp",
                        "followUp",
                        "completeQuestion",
                    ]

    asyncio.run(run_workflow())


def test_interview_turn_complete_is_atomic_and_materializes_next_or_candidate_stage(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await _seed(database, "turn-complete")
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                ],
                provider="fake",
            )
            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                    duration_minutes=15,
                )
                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    first = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 1,
                        )
                    )
                    assert first is not None
                assert (
                    _answer_request(
                        client,
                        session_id,
                        version=3,
                        question_id=first.id,
                    ).status_code
                    == 202
                )
                await _run_planner(database, settings, provider)
                next_page = client.get("/api/interview", headers=_headers())
                assert next_page.json()["session"]["status"] == "question"
                assert next_page.json()["session"]["completedQuestions"][0][
                    "completedAt"
                ]
                assert (
                    next_page.json()["session"]["progress"]["completedMainQuestions"]
                    == 1
                )

                async with database.sessionmaker() as session:
                    second = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 2,
                        )
                    )
                    assert second is not None
                assert (
                    _answer_request(
                        client,
                        session_id,
                        version=5,
                        question_id=second.id,
                    ).status_code
                    == 202
                )
                await _run_planner(database, settings, provider)
                final = client.get("/api/interview", headers=_headers())
                assert final.json()["session"]["status"] == "candidateQuestions"
                assert len(final.json()["session"]["completedQuestions"]) == 2

    asyncio.run(run_workflow())


def test_interview_turn_persist_failure_rolls_back_assessment_and_follow_up(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await _seed(database, "turn-atomic")
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            provider = FakeLLMProvider(
                [_planner_output(), _turn_output()],
                provider="fake",
            )
            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(client, role.id)
                await _run_planner(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id
                        )
                    )
                    assert question is not None
                assert (
                    _answer_request(
                        client,
                        session_id,
                        version=3,
                        question_id=question.id,
                    ).status_code
                    == 202
                )
                async with database.sessionmaker() as session:
                    question = await session.get(InterviewQuestion, question.id)
                    assert question is not None
                    question.plan_revision = 99
                    await session.commit()
                await _run_planner(database, settings, provider)

                async with database.sessionmaker() as session:
                    assert (
                        await session.scalar(
                            select(InterviewTurnAssessment).where(
                                InterviewTurnAssessment.session_id == session_id
                            )
                        )
                    ) is None
                    assert (
                        await session.scalar(
                            select(InterviewFollowUpQuestion).where(
                                InterviewFollowUpQuestion.session_id == session_id
                            )
                        )
                    ) is None
                    current = await session.scalar(
                        select(InterviewSession).where(
                            InterviewSession.id == session_id
                        )
                    )
                    assert current is not None
                    assert current.status == "generatingTurn"
                    assert (
                        await session.scalar(
                            select(InterviewAnswer).where(
                                InterviewAnswer.question_id == question.id
                            )
                        )
                    ) is not None

    asyncio.run(run_workflow())


async def _seed(
    database: Database,
    label: str,
    *,
    nullable_snapshot: bool = False,
):
    from tests.helpers.interview import seed_interview_prerequisites

    owner, role, profile = await seed_interview_prerequisites(
        database,
        label=label,
        summary="ORIGINAL_PROFILE_SNAPSHOT",
    )
    if nullable_snapshot:
        async with database.sessionmaker() as session:
            stored_profile = await session.get(CareerProfile, profile.profile_id)
            stored_role = await session.get(TargetRole, role.id)
            work_experience = await session.scalar(
                select(CareerProfileWorkExperience).where(
                    CareerProfileWorkExperience.career_profile_id == profile.profile_id
                )
            )
            assert stored_profile is not None
            assert stored_role is not None
            assert work_experience is not None
            stored_profile.summary = None
            stored_role.company = None
            stored_role.location = None
            work_experience.location = None
            await session.commit()
    return owner, role, profile


__all__ = ["migrated_database_url"]
