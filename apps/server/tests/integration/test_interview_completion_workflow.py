import asyncio
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.auth import require_current_user
from riva.core.app import create_app
from riva.db.database import Database
from riva.integrations import LLMProviderConfigurationError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    InterviewCandidateQuestion,
    InterviewCandidateQuestionExchange,
    InterviewQuestion,
    InterviewReview,
    InterviewSession,
)
from tests.helpers.interview import seed_interview_prerequisites
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
from tests.integration.test_interview_turn_workflow import (
    _answer_request,
    _turn_output,
)


pytestmark = pytest.mark.integration


def _candidate_output() -> dict[str, object]:
    return {
        "interviewerAnswer": "That is a useful question. The team measures this with reliability and delivery signals.",
        "feedback": {
            "summary": "The question is specific and connected to the role.",
            "strengths": ["Specific scope"],
            "improvementSuggestions": ["Ask about the decision-making process."],
            "suggestedAlternatives": ["How does the team define success in the first quarter?"],
        },
    }


def _app_without_llm(database_url: str, user) -> FastAPI:
    app = create_app(_settings(database_url).model_copy(update={"llm_model": None}))
    app.dependency_overrides[require_current_user] = lambda: user
    return app


def _review_output(question_ids: list[UUID]) -> dict[str, object]:
    dimensions = [
        "relevance",
        "structure",
        "specificity",
        "personalContribution",
        "resultsAndEvidence",
        "roleAlignment",
        "communication",
        "riskControl",
    ]
    return {
        "overallPerformance": "The candidate gave structured answers with concrete evidence.",
        "questionReviews": [
            {
                "questionId": str(question_id),
                "score": 84,
                "summary": "The answer addressed the question with relevant evidence.",
                "strengths": ["Relevant evidence"],
                "issues": ["Add one more measurable outcome."],
            }
            for question_id in question_ids
        ],
        "followUpReviews": [],
        "mainStrengths": ["Clear ownership"],
        "frequentIssues": ["Some outcomes could be quantified."],
        "exposedWeaknesses": ["Metrics were not always explicit."],
        "riskPoints": ["Probe scale in a later interview."],
        "communicationSuggestions": ["Lead with the result before the details."],
        "preparationSuggestions": ["Prepare two quantified project outcomes."],
        "overallScore": 84,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 84,
                "explanation": "The available interview evidence supports this score.",
            }
            for dimension in dimensions
        ],
        "nextTraining": {
            "action": "targetedPractice",
            "reason": "Strengthen quantified outcome evidence.",
            "focusAreas": ["Results and evidence"],
            "questionType": "projectDeepDive",
            "difficulty": "pressure",
        },
        "referenceAnswers": [
            {
                "targetType": "main",
                "questionId": str(question_id),
                "recommendedStructure": ["Context", "Action", "Result"],
                "keyPoints": ["State the decision and measurable result."],
                "exampleAnswer": "I explain the context, my contribution, and the measured outcome.",
                "usageGuidance": "Use this structure to make the evidence easy to verify.",
            }
            for question_id in question_ids
        ],
    }


def _partial_review_output(
    question_ids: list[UUID],
    follow_up_ids: tuple[UUID, ...] = (),
) -> dict[str, object]:
    return {
        "overallPerformance": "The saved answers show useful evidence, but the interview ended before a complete signal was available.",
        "questionReviews": [
            {
                "questionId": str(question_id),
                "score": 78,
                "summary": "The answer addressed the question with relevant evidence.",
                "strengths": ["Relevant evidence"],
                "issues": ["Add a clearer result."],
            }
            for question_id in question_ids
        ],
        "followUpReviews": [
            {
                "followUpQuestionId": str(follow_up_id),
                "score": 76,
                "summary": "The follow-up answer was concrete.",
                "strengths": ["Specific decision"],
                "issues": ["Quantify the impact."],
            }
            for follow_up_id in follow_up_ids
        ],
        "mainStrengths": ["Clear ownership"],
        "frequentIssues": ["Some outcomes could be quantified."],
        "exposedWeaknesses": ["The later questions were not answered."],
        "riskPoints": ["Probe scope and scale in a later interview."],
        "communicationSuggestions": ["Lead with the result."],
        "preparationSuggestions": ["Prepare two quantified project outcomes."],
        "referenceAnswers": [
            {
                "targetType": "main",
                "questionId": str(question_id),
                "recommendedStructure": ["Context", "Action", "Result"],
                "keyPoints": ["State the decision and measurable result."],
                "exampleAnswer": "I explain the context, my contribution, and the measured outcome.",
                "usageGuidance": "Use this structure to make the evidence easy to verify.",
            }
            for question_id in question_ids
        ]
        + [
            {
                "targetType": "followUp",
                "questionId": str(question_ids[0]),
                "followUpQuestionId": str(follow_up_id),
                "recommendedStructure": ["Claim", "Evidence", "Result"],
                "keyPoints": ["Connect the evidence to the decision."],
                "exampleAnswer": "I connect the evidence to the decision and outcome.",
                "usageGuidance": "Use this structure when answering a follow-up.",
            }
            for follow_up_id in follow_up_ids
        ],
    }


def _unavailable_review_output(question_ids: list[UUID]) -> dict[str, object]:
    return {
        "referenceAnswers": [
            {
                "targetType": "main",
                "questionId": str(question_id),
                "recommendedStructure": ["Context", "Action", "Result"],
                "keyPoints": ["State the decision and measurable result."],
                "exampleAnswer": "I explain the context, my contribution, and the measured outcome.",
                "usageGuidance": "Use this structure to make the evidence easy to verify.",
            }
            for question_id in question_ids
        ],
    }


async def _process_worker(
    database: Database,
    settings,
    provider: FakeLLMProvider,
) -> None:
    assert await _worker(database, settings, provider).process_one() is True


async def _reach_candidate_questions(
    database: Database,
    settings,
    client: TestClient,
    role_id: UUID,
    provider: FakeLLMProvider,
) -> UUID:
    session_id, _opening, _generating = _start_and_begin(
        client,
        role_id,
        duration_minutes=15,
    )
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
    assert len(questions) == 2
    for index, question in enumerate(questions):
        submitted = _answer_request(
            client,
            session_id,
            version=3 + index * 2,
            question_id=question.id,
        )
        assert submitted.status_code == 202
        assert submitted.json()["session"]["status"] == "generatingTurn"
        await _process_worker(database, settings, provider)

    page = client.get("/api/interview", headers=_headers())
    assert page.status_code == 200
    assert page.json()["session"]["status"] == "candidateQuestions"
    return session_id


def test_interview_candidate_question_and_review_success_workflow(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="completion-success",
                summary="FROZEN_PROFILE",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                    _candidate_output(),
                ],
                provider="fake-interview-completion-provider",
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
                candidate_page = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={
                        "version": 7,
                        "content": "How does the team measure success for this role?",
                    },
                    headers=_headers(),
                )
                assert candidate_page.status_code == 202
                assert candidate_page.json()["session"]["status"] == (
                    "generatingCandidateAnswer"
                )
                assert candidate_page.json()["session"]["generationStatus"] == (
                    "generating"
                )
                assert candidate_page.json()["session"]["version"] == 8

                async with database.sessionmaker() as session:
                    candidate_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id
                                    == "interview-candidate-question",
                                )
                            )
                        ).all()
                    )
                    assert len(candidate_runs) == 1
                    candidate_run = candidate_runs[0]
                    assert candidate_run.status is AgentRunStatus.QUEUED
                    assert candidate_run.payload["sessionId"] == str(session_id)
                    assert candidate_run.payload["sessionVersion"] == 7
                    assert candidate_run.payload["sessionStateVersion"] == 8
                    assert candidate_run.payload["interactionLanguage"] == "en"
                    assert candidate_run.payload["interviewCandidateQuestionInput"][
                        "plannerContext"
                    ]["careerProfile"]["summary"] == "FROZEN_PROFILE"

                    stored_profile = await session.get(
                        CareerProfile,
                        profile.profile_id,
                    )
                    assert stored_profile is not None
                    stored_profile.summary = "CHANGED_AFTER_CANDIDATE_ENQUEUE"
                    await session.commit()

                    candidate_question = await session.scalar(
                        select(InterviewCandidateQuestion).where(
                            InterviewCandidateQuestion.session_id == session_id
                        )
                    )
                    assert candidate_question is not None

                await _process_worker(database, settings, provider)
                assert "FROZEN_PROFILE" in provider.calls[-1].messages[1].content
                assert "CHANGED_AFTER_CANDIDATE_ENQUEUE" not in provider.calls[-1].messages[1].content

                async with database.sessionmaker() as session:
                    candidate_run = await session.get(AgentRun, candidate_run.id)
                    assert candidate_run is not None
                    assert candidate_run.status is AgentRunStatus.SUCCEEDED
                    exchange = await session.scalar(
                        select(InterviewCandidateQuestionExchange).where(
                            InterviewCandidateQuestionExchange.session_id
                            == session_id
                        )
                    )
                    assert exchange is not None
                    assert exchange.source_agent_run_id == candidate_run.id
                    current = await session.get(InterviewSession, session_id)
                    assert current is not None
                    assert current.status == "candidateQuestions"
                    assert current.version == 9

                candidate_questions = client.get(
                    "/api/interview",
                    headers=_headers(),
                )
                assert candidate_questions.status_code == 200
                assert candidate_questions.json()["session"]["status"] == (
                    "candidateQuestions"
                )
                assert len(candidate_questions.json()["session"]["exchanges"]) == 1

                provider.responses.append(_candidate_output())
                second_question = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={
                        "version": 9,
                        "content": "What does collaboration look like across the main partner teams?",
                    },
                    headers=_headers(),
                )
                assert second_question.status_code == 202
                assert second_question.json()["session"]["version"] == 10
                await _process_worker(database, settings, provider)

                async with database.sessionmaker() as session:
                    stored_questions = list(
                        (
                            await session.scalars(
                                select(InterviewCandidateQuestion)
                                .where(
                                    InterviewCandidateQuestion.session_id
                                    == session_id
                                )
                                .order_by(InterviewCandidateQuestion.order)
                            )
                        ).all()
                    )
                    assert [question.order for question in stored_questions] == [1, 2]
                    exchanges = list(
                        (
                            await session.scalars(
                                select(InterviewCandidateQuestionExchange)
                                .where(
                                    InterviewCandidateQuestionExchange.session_id
                                    == session_id
                                )
                            )
                        ).all()
                    )
                    assert {exchange.question_id for exchange in exchanges} == {
                        question.id for question in stored_questions
                    }
                    current = await session.get(InterviewSession, session_id)
                    assert current is not None
                    assert current.status == "candidateQuestions"
                    assert current.version == 11

                candidate_questions = client.get(
                    "/api/interview",
                    headers=_headers(),
                )
                assert len(candidate_questions.json()["session"]["exchanges"]) == 2

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
                provider.responses.append(
                    _review_output([question.id for question in questions])
                )
                finish = client.post(
                    f"/api/interview/sessions/{session_id}/finish",
                    json={"version": 11},
                    headers=_headers(),
                )
                assert finish.status_code == 202
                assert finish.json()["session"]["status"] == "generatingReview"
                assert finish.json()["session"]["generationStatus"] == "generating"
                assert finish.json()["session"]["version"] == 12

                await _process_worker(database, settings, provider)

                async with database.sessionmaker() as session:
                    review_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-review",
                                )
                            )
                        ).all()
                    )
                    assert len(review_runs) == 1
                    review_run = review_runs[0]
                    assert review_run.status is AgentRunStatus.SUCCEEDED
                    review = await session.scalar(
                        select(InterviewReview).where(
                            InterviewReview.session_id == session_id
                        )
                    )
                    assert review is not None
                    assert review.source_agent_run_id == review_run.id
                    assert review.status == "complete"
                    assert len(review.question_details) == 2
                    assert all(
                        detail["referenceAnswer"]["status"] == "ready"
                        for detail in review.question_details
                    )
                    current = await session.get(InterviewSession, session_id)
                    assert current is not None
                    assert current.status == "completed"
                    assert current.completion_reason == "formalQuestionsCompleted"
                    assert current.version == 13

                completed = client.get("/api/interview", headers=_headers())
                assert completed.status_code == 200
                completed_session = completed.json()["session"]
                assert completed_session["status"] == "completed"
                assert completed_session["completionReason"] == (
                    "formalQuestionsCompleted"
                )
                assert len(completed_session["completedQuestions"]) == 2
                assert len(completed_session["candidateQuestionExchanges"]) == 2
                assert len(completed_session["questionDetails"]) == 2
                assert completed_session["review"]["status"] == "complete"

                review_response = client.get(
                    f"/api/interview/sessions/{session_id}/review",
                    headers=_headers(),
                )
                assert review_response.status_code == 200
                assert review_response.json()["status"] == "complete"
                assert len(review_response.json()["questionDetails"]) == 2

                immutable_finish = client.post(
                    f"/api/interview/sessions/{session_id}/finish",
                    json={"version": 13},
                    headers=_headers(),
                )
                assert immutable_finish.status_code == 409

            other_owner, _other_role, _other_profile = (
                await seed_interview_prerequisites(
                    database,
                    label="completion-success-other-user",
                )
            )
            other_app = _app(migrated_database_url, other_owner)
            with TestClient(other_app) as other_client:
                isolated = other_client.get(
                    f"/api/interview/sessions/{session_id}/review",
                    headers=_headers(),
                )
                assert isolated.status_code == 404

    asyncio.run(run_workflow())


def test_interview_candidate_answer_failure_is_retryable_without_duplicate_run(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="candidate-retry",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                    LLMProviderConfigurationError(),
                    _candidate_output(),
                ],
                provider="fake-interview-candidate-retry-provider",
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
                submitted = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={"version": 7, "content": "What is the team topology?"},
                    headers=_headers(),
                )
                assert submitted.status_code == 202
                assert (await _worker(database, settings, provider).process_one())

                failed = client.get("/api/interview", headers=_headers())
                assert failed.status_code == 200
                assert failed.json()["session"]["status"] == (
                    "generatingCandidateAnswer"
                )
                assert failed.json()["session"]["generationStatus"] == "failed"
                failed_version = failed.json()["session"]["version"]
                retry = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-answer/retry",
                    json={"version": failed_version},
                    headers=_headers(),
                )
                assert retry.status_code == 202
                retry_version = retry.json()["session"]["version"]
                assert retry_version == failed_version + 1
                duplicate = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-answer/retry",
                    json={"version": retry_version},
                    headers=_headers(),
                )
                assert duplicate.status_code == 409

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id
                                    == "interview-candidate-question",
                                )
                                .order_by(AgentRun.created_at)
                            )
                        ).all()
                    )
                    assert len(runs) == 2
                    assert runs[0].status is AgentRunStatus.FAILED
                    assert runs[1].status is AgentRunStatus.QUEUED
                    assert runs[0].id != runs[1].id
                    assert runs[0].idempotency_key != runs[1].idempotency_key
                    assert runs[1].payload["retryOfRunId"] == str(runs[0].id)

                await _process_worker(database, settings, provider)
                page = client.get("/api/interview", headers=_headers())
                assert page.json()["session"]["status"] == "candidateQuestions"
                assert len(page.json()["session"]["exchanges"]) == 1

    asyncio.run(run_workflow())


def test_candidate_question_enqueue_rolls_back_question_and_session_mutation(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="candidate-rollback",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                ],
                provider="fake-interview-candidate-rollback-provider",
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

            with TestClient(_app_without_llm(migrated_database_url, owner)) as client:
                failed = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={"version": 7, "content": "What is the team topology?"},
                    headers=_headers(),
                )
                assert failed.status_code == 503

            async with database.sessionmaker() as session:
                candidate_questions = list(
                    (
                        await session.scalars(
                            select(InterviewCandidateQuestion).where(
                                InterviewCandidateQuestion.session_id == session_id
                            )
                        )
                    ).all()
                )
                candidate_runs = list(
                    (
                        await session.scalars(
                            select(AgentRun).where(
                                AgentRun.user_id == owner.id,
                                AgentRun.agent_id == "interview-candidate-question",
                            )
                        )
                    ).all()
                )
                current = await session.get(InterviewSession, session_id)
                assert candidate_questions == []
                assert candidate_runs == []
                assert current is not None
                assert current.status == "candidateQuestions"
                assert current.version == 7

    asyncio.run(run_workflow())


def test_interview_review_failure_is_retryable_and_old_run_is_retained(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="review-retry",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [
                    _planner_output(2),
                    _turn_output("complete"),
                    _turn_output("complete"),
                    _candidate_output(),
                    LLMProviderConfigurationError(),
                ],
                provider="fake-interview-review-retry-provider",
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
                submitted = client.post(
                    f"/api/interview/sessions/{session_id}/candidate-questions",
                    json={"version": 7, "content": "How do teams collaborate?"},
                    headers=_headers(),
                )
                assert submitted.status_code == 202
                await _process_worker(database, settings, provider)
                candidate_page = client.get("/api/interview", headers=_headers())
                assert candidate_page.json()["session"]["version"] == 9

                finish = client.post(
                    f"/api/interview/sessions/{session_id}/finish",
                    json={"version": 9},
                    headers=_headers(),
                )
                assert finish.status_code == 202
                assert finish.json()["session"]["version"] == 10
                await _process_worker(database, settings, provider)

                failed = client.get("/api/interview", headers=_headers())
                assert failed.json()["session"]["status"] == "generatingReview"
                assert failed.json()["session"]["generationStatus"] == "failed"
                failed_version = failed.json()["session"]["version"]

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
                provider.responses.append(
                    _review_output([question.id for question in questions])
                )
                retry = client.post(
                    f"/api/interview/sessions/{session_id}/review/retry",
                    json={"version": failed_version},
                    headers=_headers(),
                )
                assert retry.status_code == 202
                retry_version = retry.json()["session"]["version"]
                assert retry_version == failed_version + 1
                duplicate = client.post(
                    f"/api/interview/sessions/{session_id}/review/retry",
                    json={"version": retry_version},
                    headers=_headers(),
                )
                assert duplicate.status_code == 409

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-review",
                                )
                                .order_by(AgentRun.created_at)
                            )
                        ).all()
                    )
                    assert len(runs) == 2
                    assert runs[0].status is AgentRunStatus.FAILED
                    assert runs[1].status is AgentRunStatus.QUEUED
                    assert runs[0].id != runs[1].id
                    assert runs[1].payload["retryOfRunId"] == str(runs[0].id)
                    assert runs[1].payload["interviewReviewInput"][
                        "trainingMemory"
                    ] == runs[0].payload["interviewReviewInput"][
                        "trainingMemory"
                    ]

                await _process_worker(database, settings, provider)
                completed = client.get("/api/interview", headers=_headers())
                assert completed.json()["session"]["status"] == "completed"
                assert completed.json()["session"]["review"]["status"] == "complete"

                async with database.sessionmaker() as session:
                    review = await session.scalar(
                        select(InterviewReview).where(
                            InterviewReview.session_id == session_id
                        )
                    )
                    assert review is not None
                    assert review.source_agent_run_id == runs[1].id

    asyncio.run(run_workflow())


def test_interview_end_from_opening_creates_unavailable_review_without_llm(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="opening-end",
            )
            app = _app(migrated_database_url, owner)
            with TestClient(app) as client:
                started = client.post(
                    "/api/interview/sessions",
                    json={
                        "targetRoleId": str(role.id),
                        "round": "technical",
                        "difficulty": "pressure",
                        "durationMinutes": 30,
                    },
                    headers=_headers(),
                )
                assert started.status_code == 201
                session = started.json()["session"]
                session_id = UUID(session["sessionId"])
                ended = client.post(
                    f"/api/interview/sessions/{session_id}/end",
                    json={"version": session["version"]},
                    headers=_headers(),
                )
                assert ended.status_code == 202
                assert ended.json()["session"]["status"] == "completed"
                assert ended.json()["session"]["review"]["status"] == "unavailable"

                async with database.sessionmaker() as session_db:
                    runs = list(
                        (
                            await session_db.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-review",
                                )
                            )
                        ).all()
                    )
                    review = await session_db.scalar(
                        select(InterviewReview).where(
                            InterviewReview.session_id == session_id
                        )
                    )
                    assert runs == []
                    assert review is not None
                    assert review.source_agent_run_id is None
                    assert review.status == "unavailable"
                    assert review.question_details == []

                review_response = client.get(
                    f"/api/interview/sessions/{session_id}/review",
                    headers=_headers(),
                )
                assert review_response.status_code == 200
                assert review_response.json()["status"] == "unavailable"
                assert review_response.json()["questionDetails"] == []

    asyncio.run(run_workflow())


def test_interview_end_from_question_records_unanswered_question_as_unavailable(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="question-end",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [_planner_output(2)],
                provider="fake-interview-question-end-provider",
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                )
                await _process_worker(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 1,
                        )
                    )
                    assert question is not None

                ended = client.post(
                    f"/api/interview/sessions/{session_id}/end",
                    json={"version": 3},
                    headers=_headers(),
                )
                assert ended.status_code == 202
                assert ended.json()["session"]["status"] == "generatingReview"
                provider.responses.append(_unavailable_review_output([question.id]))
                await _process_worker(database, settings, provider)

                completed = client.get("/api/interview", headers=_headers()).json()[
                    "session"
                ]
                assert completed["status"] == "completed"
                assert completed["review"]["status"] == "unavailable"
                assert completed["completedQuestions"] == []
                assert completed["questionDetails"][0]["record"]["status"] == (
                    "unanswered"
                )
                assert completed["questionDetails"][0]["record"]["question"][
                    "id"
                ] == str(question.id)
                assert len(provider.calls) == 2

    asyncio.run(run_workflow())


def test_interview_end_during_follow_up_keeps_answered_main_and_unanswered_follow_up(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="follow-up-end",
            )
            settings = _settings(migrated_database_url)
            provider = FakeLLMProvider(
                [_planner_output(2), _turn_output("followUp")],
                provider="fake-interview-follow-up-end-provider",
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(
                    client,
                    role.id,
                )
                await _process_worker(database, settings, provider)
                async with database.sessionmaker() as session:
                    question = await session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == session_id,
                            InterviewQuestion.order == 1,
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
                await _process_worker(database, settings, provider)

                follow_up_page = client.get("/api/interview", headers=_headers()).json()[
                    "session"
                ]
                assert follow_up_page["status"] == "followUp"
                follow_up_id = UUID(follow_up_page["currentFollowUp"]["question"]["id"])
                provider.responses.append(
                    _partial_review_output([question.id], (follow_up_id,))
                )
                ended = client.post(
                    f"/api/interview/sessions/{session_id}/end",
                    json={"version": 5},
                    headers=_headers(),
                )
                assert ended.status_code == 202
                assert ended.json()["session"]["status"] == "generatingReview"
                await _process_worker(database, settings, provider)

                completed = client.get("/api/interview", headers=_headers()).json()[
                    "session"
                ]
                assert completed["status"] == "completed"
                assert completed["review"]["status"] == "partial"
                assert "overallScore" not in completed["review"]["review"]
                assert "dimensionScores" not in completed["review"]["review"]
                assert "nextTraining" not in completed["review"]["review"]
                assert len(completed["completedQuestions"]) == 1
                assert completed["completedQuestions"][0]["answer"]["content"].startswith(
                    "I made the decision"
                )
                detail = completed["questionDetails"][0]
                assert detail["record"]["status"] == "answered"
                assert detail["record"]["answer"]["content"].startswith(
                    "I made the decision"
                )
                assert detail["followUps"][0]["record"]["status"] == "unanswered"

    asyncio.run(run_workflow())


__all__ = ["migrated_database_url"]
