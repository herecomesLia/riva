import asyncio
from datetime import UTC, datetime, timedelta
import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
)
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
)
from riva.services.practice_sessions import (
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_question_generation_idempotency_key,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    FollowUpHandler,
    PracticeEvaluationHandler,
    PracticeRecommendationHandler,
    PracticeReviewHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
    build_follow_up_worker,
    evaluation_response,
    seed_answering_session,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


async def complete_required_reference_answers(
    database: Database,
    *,
    max_rounds: int = 5,
) -> list[AgentRun]:
    completed: list[AgentRun] = []
    for _ in range(max_rounds):
        runs = await complete_queued_reference_answers(database)
        completed.extend(runs)
        if not runs:
            return completed
    raise AssertionError(
        "reference-answer generation did not settle within the test limit"
    )


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


class FailingEnqueueService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing downstream model")


async def prepare_evaluation_ready_attempt(
    database: Database,
) -> tuple[object, PracticeSession, PracticeAttempt]:
    owner, practice_session, attempt, card = await seed_answering_session(database)
    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=2,
            question_id=card.id,
            content="I owned the rollout and reduced failures.",
        )
    assert submitted.session.version == 3
    assert await build_follow_up_worker(
        database,
        FakeLLMProvider([{"action": "complete"}]),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=3,
        )
    assert evaluating.session.version == 4
    assert await build_evaluation_worker(
        database,
        FakeLLMProvider([evaluation_response()]),
    ).process_one()
    return owner, practice_session, attempt


async def prepare_review_ready_attempt(
    database: Database,
) -> tuple[object, PracticeSession, PracticeAttempt]:
    owner, practice_session, attempt = await prepare_evaluation_ready_attempt(database)
    async with database.sessionmaker() as session:
        review_pending = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=4,
        )
    assert review_pending.attempt.status == "evaluating"
    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider([review_output()]),
            model="fake-review-model",
        ),
    ).process_one()
    return owner, practice_session, attempt


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-review-workflow-test-key",
        session_cookie_secure=False,
    )


def question_output(project_id: UUID) -> dict[str, object]:
    return {
        "prompt": "Explain how you improved the payment workflow.",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": ["Technical decision-making"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "Payment Platform",
                "reason": "Relevant project evidence.",
            }
        ],
        "answer_hints": ["Explain your personal contribution."],
        "answer_framework": ["Context", "Decision", "Result"],
        "follow_up_directions": ["Probe the metric."],
        "scoring_focus": ["Evidence of personal contribution"],
    }


def evaluation_output() -> dict[str, object]:
    return {
        "overallScore": 82,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 82,
                "explanation": f"Evidence supports {dimension}.",
            }
            for dimension in (
                "relevance",
                "structure",
                "specificity",
                "communication",
            )
        ],
        "focusAssessments": [
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "The answer provides evidence.",
            }
        ],
    }


def review_output() -> dict[str, object]:
    return {
        "overallPerformance": "Strong answer with a measurable result.",
        "highlights": ["Shows ownership."],
        "mainIssues": ["Attribution evidence is brief."],
        "improvementSuggestions": ["Name the baseline and measured result."],
        "reusableAnswerStructure": ["Context", "Evidence", "Result"],
        "exposedWeaknesses": ["Attribution evidence"],
    }


def recommendation_output(action: str) -> dict[str, object]:
    if action == "retryCurrent":
        return {
            "action": action,
            "reason": "Practice the current question again.",
        }
    return {
        "action": action,
        "reason": "Move to the next focused question.",
        "nextQuestion": {
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "focusAreas": ["Attribution evidence"],
        },
    }


def build_worker(database: Database, agent: object) -> AgentWorker:
    if isinstance(agent, QuestionGenerationAgent):
        handler = QuestionGenerationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-review-question-worker"
    elif isinstance(agent, FollowUpAgent):
        handler = FollowUpHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-review-follow-up-worker"
    elif isinstance(agent, PracticeEvaluationAgent):
        handler = PracticeEvaluationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-review-evaluation-worker"
    elif isinstance(agent, PracticeReviewAgent):
        handler = PracticeReviewHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-review-review-worker"
    elif isinstance(agent, PracticeRecommendationAgent):
        handler = PracticeRecommendationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-review-recommendation-worker"
    else:
        raise AssertionError(f"unsupported test agent: {type(agent)!r}")

    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id=worker_id,
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


async def runs_for(
    database: Database,
    *,
    user_id: UUID,
    agent_id: str,
    attempt_id: UUID,
) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == agent_id,
                        AgentRun.payload["attemptId"].as_string()
                        == str(attempt_id),
                    )
                )
            ).all()
        )
    return runs


def assert_public_review_contract(body: dict[str, object], action: str) -> None:
    assert set(body) == {
        "status",
        "sessionId",
        "language",
        "version",
        "selection",
        "startedAt",
        "attemptId",
        "attemptNumber",
        "question",
        "mainAnswer",
        "followUpExchanges",
        "followUpCompletion",
        "evaluation",
        "review",
    }
    assert body["status"] == "review"
    assert body["version"] == 5
    assert body["followUpExchanges"] == []
    assert body["followUpCompletion"] == {
        "status": "completed",
        "reason": "noFollowUpRequired",
    }
    evaluation = body["evaluation"]
    review = body["review"]
    assert isinstance(evaluation, dict)
    assert isinstance(review, dict)
    assert set(evaluation) == {
        "overallScore",
        "dimensionScores",
        "evaluatedAt",
    }
    assert evaluation["overallScore"] == 82
    assert len(evaluation["dimensionScores"]) == 4
    assert str(evaluation["evaluatedAt"]).endswith("Z")
    assert set(review) == {
        "overallPerformance",
        "highlights",
        "mainIssues",
        "improvementSuggestions",
        "reusableAnswerStructure",
        "exposedWeaknesses",
        "recommendation",
    }
    recommendation = review["recommendation"]
    assert isinstance(recommendation, dict)
    assert recommendation["action"] == action
    if action == "retryCurrent":
        assert set(recommendation) == {"action", "reason"}
    else:
        assert set(recommendation) == {"action", "reason", "nextQuestion"}
        next_question = recommendation["nextQuestion"]
        assert isinstance(next_question, dict)
        assert next_question["questionType"] == body["question"]["questionType"]  # type: ignore[index]
        assert next_question["difficulty"] == body["question"]["difficulty"]  # type: ignore[index]
        assert set(next_question["focusAreas"]).issubset(  # type: ignore[arg-type]
            set(review["exposedWeaknesses"])  # type: ignore[arg-type]
        )

    serialized = json.dumps(body)
    for field in (
        "completedAt",
        "focusAssessments",
        "evaluationRunId",
        "reviewRunId",
        "recommendationRunId",
        "sourceAgentRunId",
        "provider",
        "model",
    ):
        assert field not in serialized


@pytest.mark.parametrize("action", ["retryCurrent", "nextQuestion"])
def test_practice_review_workflow_is_atomic_idempotent_and_publicly_final(
    action: str,
) -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "personalized",
                            "prioritizeWeaknesses": False,
                        },
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert started.status_code == 202
                    session_id = started.json()["sessionId"]

                    assert await build_worker(
                        database,
                        QuestionGenerationAgent(
                            FakeLLMProvider(
                                [question_output(project_id)],
                                provider="fake-question-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    answering = client.post(
                        f"/api/practice/sessions/{session_id}/question-generation/refresh",
                        json={"version": 1},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert answering.status_code == 200
                    answering_body = answering.json()
                    assert answering_body["status"] == "answering"
                    assert answering_body["version"] == 2

                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": 2,
                            "questionId": answering_body["question"]["id"],
                            "content": "I owned the rollout and reduced failures.",
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert submitted.status_code == 202
                    assert submitted.json()["status"] == "generatingFollowUp"
                    assert submitted.json()["version"] == 3

                    assert await build_worker(
                        database,
                        FollowUpAgent(
                            FakeLLMProvider(
                                [{"action": "complete"}],
                                provider="fake-follow-up-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    evaluating = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert evaluating.status_code == 200
                    assert evaluating.json()["status"] == "evaluating"
                    assert evaluating.json()["version"] == 4
                    attempt_id = UUID(evaluating.json()["attemptId"])

                    evaluation_runs = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-evaluator",
                        attempt_id=attempt_id,
                    )
                    assert len(evaluation_runs) == 1
                    assert evaluation_runs[0].status is AgentRunStatus.QUEUED

                    current_before_evaluation = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert current_before_evaluation.status_code == 200
                    assert current_before_evaluation.json()["session"]["status"] == (
                        "evaluating"
                    )
                    assert current_before_evaluation.json()["session"]["version"] == 4

                    assert await build_worker(
                        database,
                        PracticeEvaluationAgent(
                            FakeLLMProvider(
                                [evaluation_output()],
                                provider="fake-evaluation-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    async with database.sessionmaker() as session:
                        stored_evaluation = await session.scalar(
                            select(PracticeEvaluation).where(
                                PracticeEvaluation.attempt_id == attempt_id
                            )
                        )
                        assert stored_evaluation is not None

                    evaluation_get = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert evaluation_get.status_code == 200
                    assert evaluation_get.json()["session"]["status"] == (
                        "evaluating"
                    )
                    assert evaluation_get.json()["session"]["version"] == 4
                    review_before_refresh = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-reviewer",
                        attempt_id=attempt_id,
                    )
                    assert review_before_refresh == []

                    first_review_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert first_review_refresh.status_code == 200
                    first_review_body = first_review_refresh.json()
                    assert first_review_body["status"] == "evaluating"
                    assert first_review_body["version"] == 4
                    review_runs = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-reviewer",
                        attempt_id=attempt_id,
                    )
                    assert len(review_runs) == 1
                    assert review_runs[0].status is AgentRunStatus.QUEUED

                    second_review_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert second_review_refresh.status_code == 200
                    assert second_review_refresh.json() == first_review_body
                    review_runs = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-reviewer",
                        attempt_id=attempt_id,
                    )
                    assert len(review_runs) == 1

                    assert await build_worker(
                        database,
                        PracticeReviewAgent(
                            FakeLLMProvider(
                                [review_output()],
                                provider="fake-review-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    async with database.sessionmaker() as session:
                        stored_review = await session.scalar(
                            select(PracticeReview).where(
                                PracticeReview.attempt_id == attempt_id
                            )
                        )
                        assert stored_review is not None

                    review_get = client.get("/api/practice/sessions/current")
                    assert review_get.status_code == 200
                    assert review_get.json()["session"]["status"] == "evaluating"
                    assert review_get.json()["session"]["version"] == 4
                    recommendation_before_refresh = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-recommender",
                        attempt_id=attempt_id,
                    )
                    assert recommendation_before_refresh == []

                    first_recommendation_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert first_recommendation_refresh.status_code == 200
                    first_recommendation_body = first_recommendation_refresh.json()
                    assert first_recommendation_body["status"] == "evaluating"
                    assert first_recommendation_body["version"] == 4
                    recommendation_runs = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-recommender",
                        attempt_id=attempt_id,
                    )
                    assert len(recommendation_runs) == 1
                    assert recommendation_runs[0].status is AgentRunStatus.QUEUED

                    second_recommendation_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert second_recommendation_refresh.status_code == 200
                    assert second_recommendation_refresh.json() == (
                        first_recommendation_body
                    )
                    recommendation_runs = await runs_for(
                        database,
                        user_id=owner.id,
                        agent_id="practice-recommender",
                        attempt_id=attempt_id,
                    )
                    assert len(recommendation_runs) == 1

                    assert await build_worker(
                        database,
                        PracticeRecommendationAgent(
                            FakeLLMProvider(
                                [recommendation_output(action)],
                                provider="fake-recommendation-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    references_pending = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert references_pending.status_code == 200
                    assert references_pending.json()["status"] == "evaluating"
                    await complete_required_reference_answers(database)
                    async with database.sessionmaker() as session:
                        stored_recommendation = await session.scalar(
                            select(PracticeRecommendation).where(
                                PracticeRecommendation.attempt_id == attempt_id
                            )
                        )
                        assert stored_recommendation is not None
                        assert stored_recommendation.action == action

                    still_evaluating = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert still_evaluating.status_code == 200
                    assert still_evaluating.json()["session"]["status"] == (
                        "evaluating"
                    )
                    assert still_evaluating.json()["session"]["version"] == 4

                    final_response = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert final_response.status_code == 200
                    final_body = final_response.json()
                    assert_public_review_contract(final_body, action)

                    async with database.sessionmaker() as session:
                        persisted_attempt = await session.get(
                            PracticeAttempt,
                            attempt_id,
                        )
                        persisted_session = await session.get(
                            PracticeSession,
                            UUID(session_id),
                        )
                        assert persisted_attempt is not None
                        assert persisted_session is not None
                        assert persisted_attempt.status == "review"
                        assert persisted_attempt.completed_at is not None
                        assert persisted_attempt.completed_at.tzinfo is not None
                        completed_at = persisted_attempt.completed_at
                        assert persisted_session.status == "active"
                        assert persisted_session.version == 5
                        assert persisted_session.completed_at is None
                        assert persisted_session.completion_reason is None

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 4},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json() == final_body

                    async with database.sessionmaker() as session:
                        persisted_attempt = await session.get(
                            PracticeAttempt,
                            attempt_id,
                        )
                        persisted_session = await session.get(
                            PracticeSession,
                            UUID(session_id),
                        )
                        assert persisted_attempt is not None
                        assert persisted_session is not None
                        assert persisted_attempt.completed_at == completed_at
                        assert persisted_session.version == 5
                        assert persisted_attempt.status == "review"
                        assert len(
                            list(
                                (
                                    await session.scalars(
                                        select(PracticeEvaluation).where(
                                            PracticeEvaluation.attempt_id
                                            == attempt_id
                                        )
                                    )
                                ).all()
                            )
                        ) == 1
                        assert len(
                            list(
                                (
                                    await session.scalars(
                                        select(PracticeReview).where(
                                            PracticeReview.attempt_id == attempt_id
                                        )
                                    )
                                ).all()
                            )
                        ) == 1
                        assert len(
                            list(
                                (
                                    await session.scalars(
                                        select(PracticeRecommendation).where(
                                            PracticeRecommendation.attempt_id
                                            == attempt_id
                                        )
                                    )
                                ).all()
                            )
                        ) == 1

                    old_question_id = UUID(final_body["question"]["id"])
                    async with database.sessionmaker() as session:
                        with pytest.raises(PracticeSessionStateError) as error:
                            await PracticeSessionService(
                                session,
                                llm_model="fake-practice-model",
                                question_generation_service_factory=(
                                    lambda _session, **_kwargs: FailingEnqueueService()
                                ),
                            ).continue_to_next_question(
                                user_id=owner.id,
                                session_id=UUID(session_id),
                                expected_version=5,
                                question_id=old_question_id,
                            )
                    assert error.value.code == (
                        PRACTICE_QUESTION_GENERATION_UNAVAILABLE
                    )

                    async with database.sessionmaker() as session:
                        persisted_attempts = list(
                            (
                                await session.scalars(
                                    select(PracticeAttempt).where(
                                        PracticeAttempt.session_id
                                        == UUID(session_id)
                                    )
                                )
                            ).all()
                        )
                        question_generation_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == "question-generator",
                                    )
                                )
                            ).all()
                        )
                        persisted_attempt = await session.get(
                            PracticeAttempt,
                            attempt_id,
                        )
                        persisted_session = await session.get(
                            PracticeSession,
                            UUID(session_id),
                        )
                        assert len(persisted_attempts) == 1
                        assert len(question_generation_runs) == 1
                        assert persisted_attempt is not None
                        assert persisted_session is not None
                        assert persisted_attempt.status == "review"
                        assert persisted_attempt.completed_at == completed_at
                        assert persisted_session.version == 5

                    async with database.sessionmaker() as session:
                        continued = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).continue_to_next_question(
                            user_id=owner.id,
                            session_id=UUID(session_id),
                            expected_version=5,
                            question_id=old_question_id,
                        )
                        assert continued.session.status == "active"
                        assert continued.session.version == 6
                        assert continued.attempt.attempt_number == 2
                        assert continued.attempt.status == "generatingQuestion"
                        assert continued.attempt.retry_of_attempt_id is None
                        assert continued.attempt.question_card_id is None
                        assert continued.attempt.completed_at is None
                        assert continued.question_generation_run.status is AgentRunStatus.QUEUED
                        assert continued.question_generation_run.id is not None
                        assert continued.question_generation_run.idempotency_key == (
                            practice_question_generation_idempotency_key(
                                UUID(session_id),
                                continued.attempt.id,
                            )
                        )
                        next_attempt_id = continued.attempt.id
                        next_run_id = continued.question_generation_run.id

                    async with database.sessionmaker() as session:
                        old_attempt = await session.get(PracticeAttempt, attempt_id)
                        next_attempt = await session.get(
                            PracticeAttempt,
                            next_attempt_id,
                        )
                        persisted_session = await session.get(
                            PracticeSession,
                            UUID(session_id),
                        )
                        assert old_attempt is not None
                        assert next_attempt is not None
                        assert persisted_session is not None
                        assert old_attempt.status == "completed"
                        assert old_attempt.completed_at == completed_at
                        assert next_attempt.status == "generatingQuestion"
                        assert next_attempt.completed_at is None
                        assert persisted_session.version == 6
                        assert len(
                            list(
                                (
                                    await session.scalars(
                                        select(PracticeAttempt).where(
                                            PracticeAttempt.session_id
                                            == UUID(session_id)
                                        )
                                    )
                                ).all()
                            )
                        ) == 2

                    async with database.sessionmaker() as session:
                        replay = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).continue_to_next_question(
                            user_id=owner.id,
                            session_id=UUID(session_id),
                            expected_version=5,
                            question_id=old_question_id,
                        )
                    assert replay.session.version == 6
                    assert replay.attempt.id == next_attempt_id
                    assert replay.question_generation_run.id == next_run_id

                    current_generating = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert current_generating.status_code == 200
                    assert current_generating.json()["session"]["status"] == (
                        "generatingQuestion"
                    )
                    assert current_generating.json()["session"]["version"] == 6

                    assert await build_worker(
                        database,
                        QuestionGenerationAgent(
                            FakeLLMProvider(
                                [question_output(project_id)],
                                provider="fake-next-question-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    next_answering = client.post(
                        f"/api/practice/sessions/{session_id}/question-generation/refresh",
                        json={"version": 6},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert next_answering.status_code == 200
                    next_answering_body = next_answering.json()
                    assert next_answering_body["status"] == "answering"
                    assert next_answering_body["version"] == 7
                    assert UUID(next_answering_body["attemptId"]) == next_attempt_id

                    async with database.sessionmaker() as session:
                        old_attempt = await session.get(PracticeAttempt, attempt_id)
                        next_attempt = await session.get(
                            PracticeAttempt,
                            next_attempt_id,
                        )
                        next_card = await session.get(
                            QuestionCard,
                            UUID(next_answering_body["question"]["id"]),
                        )
                        question_run = await session.get(AgentRun, next_run_id)
                        assert old_attempt is not None
                        assert next_attempt is not None
                        assert next_card is not None
                        assert old_attempt.status == "completed"
                        assert next_attempt.status == "answering"
                        assert next_attempt.question_card_id == next_card.id
                        assert next_attempt.question_generation_run_id == next_run_id
                        assert old_attempt.question_card_id != next_card.id
                        assert question_run is not None
                        assert question_run.agent_id == "question-generator"
                        assert question_run.status is AgentRunStatus.SUCCEEDED
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_review_enqueue_failure_rolls_back_real_db_without_losing_evaluation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = (
                    await prepare_evaluation_ready_attempt(database)
                )

                async with database.sessionmaker() as session:
                    with pytest.raises(PracticeSessionStateError) as error:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-review-model",
                            review_generation_service_factory=(
                                lambda _session, **_kwargs: FailingEnqueueService()
                            ),
                        ).refresh_evaluation_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=4,
                        )
                    assert error.value.code == (
                        PRACTICE_REVIEW_GENERATION_UNAVAILABLE
                    )

                async with database.sessionmaker() as session:
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == attempt.id
                        )
                    )
                    review_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "practice-reviewer",
                                    AgentRun.payload["attemptId"].as_string()
                                    == str(attempt.id),
                                )
                            )
                        ).all()
                    )
                    assert stored_session is not None
                    assert stored_attempt is not None
                    assert stored_session.version == 4
                    assert stored_attempt.status == "evaluating"
                    assert evaluation is not None
                    assert review_runs == []
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_recommendation_enqueue_failure_rolls_back_real_db_with_prior_artifacts() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = (
                    await prepare_review_ready_attempt(database)
                )

                async with database.sessionmaker() as session:
                    with pytest.raises(PracticeSessionStateError) as error:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-recommendation-model",
                            recommendation_generation_service_factory=(
                                lambda _session, **_kwargs: FailingEnqueueService()
                            ),
                        ).refresh_evaluation_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=4,
                        )
                    assert error.value.code == (
                        PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE
                    )

                async with database.sessionmaker() as session:
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == attempt.id
                        )
                    )
                    review = await session.scalar(
                        select(PracticeReview).where(
                            PracticeReview.attempt_id == attempt.id
                        )
                    )
                    recommendation_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "practice-recommender",
                                    AgentRun.payload["attemptId"].as_string()
                                    == str(attempt.id),
                                )
                            )
                        ).all()
                    )
                    assert stored_session is not None
                    assert stored_attempt is not None
                    assert stored_session.version == 4
                    assert stored_attempt.status == "evaluating"
                    assert evaluation is not None
                    assert review is not None
                    assert recommendation_runs == []
            finally:
                await database.reset()

    asyncio.run(run_test())
