import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import (
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
)
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
    evaluation_response,
)
from tests.integration.test_practice_review_workflow import (
    build_worker,
    recommendation_output,
    review_output,
)
from tests.integration.test_practice_follow_up_stop_workflow import (
    prepare_answering_follow_up,
)
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-follow-up-stop-api-test-key",
        session_cookie_secure=False,
    )


async def load_graph(
    database: Database,
    *,
    attempt_id: UUID,
    user_id: UUID,
) -> dict[str, object]:
    async with database.sessionmaker() as session:
        attempt = await session.get(PracticeAttempt, attempt_id)
        decisions = list(
            (
                await session.scalars(
                    select(PracticeFollowUpDecision).where(
                        PracticeFollowUpDecision.attempt_id == attempt_id
                    )
                )
            ).all()
        )
        questions = list(
            (
                await session.scalars(
                    select(PracticeFollowUpQuestion).where(
                        PracticeFollowUpQuestion.attempt_id == attempt_id
                    )
                )
            ).all()
        )
        answers = list(
            (
                await session.scalars(
                    select(PracticeAnswer).where(
                        PracticeAnswer.attempt_id == attempt_id
                    )
                )
            ).all()
        )
        runs = [
            run
            for run in (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "practice-evaluator",
                    )
                )
            ).all()
            if run.payload.get("attemptId") == str(attempt_id)
        ]
        return {
            "attempt": attempt,
            "decisions": decisions,
            "questions": questions,
            "answers": answers,
            "runs": runs,
        }


def test_practice_follow_up_stop_public_api_replay_poll_and_normal_completion() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    attempt_id,
                    question_id,
                    follow_up_question_id,
                ) = await prepare_answering_follow_up(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {"Origin": TRUSTED_ORIGIN}
                path = f"/api/practice/sessions/{session_id}/follow-ups/end"
                body = {
                    "version": 4,
                    "questionId": str(question_id),
                    "followUpQuestionId": str(follow_up_question_id),
                }

                with TestClient(app) as client:
                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"]["status"] == "answeringFollowUp"
                    assert current.json()["session"]["version"] == 4

                    stopped = client.post(path, json=body, headers=headers)
                    assert stopped.status_code == 202
                    stopped_body = stopped.json()
                    assert stopped_body["status"] == "evaluating"
                    assert stopped_body["version"] == 5
                    assert stopped_body["followUpExchanges"] == []
                    assert stopped_body["followUpCompletion"] == {
                        "status": "endedEarly",
                        "unansweredQuestion": {
                            "id": str(follow_up_question_id),
                            "prompt": "What evidence supports follow-up 1?",
                            "createdAt": stopped_body["followUpCompletion"][
                                "unansweredQuestion"
                            ]["createdAt"],
                            "order": 1,
                            "answerHints": {
                                "status": "notRequested",
                                "content": None,
                            },
                            "answerFramework": {
                                "status": "notRequested",
                                "content": None,
                            },
                            "referenceAnswer": {
                                "status": "notRequested",
                                "content": None,
                                "viewedBeforeSubmission": False,
                            },
                        },
                    }

                    graph = await load_graph(
                        database,
                        attempt_id=attempt_id,
                        user_id=owner.id,
                    )
                    assert len(graph["decisions"]) == 1
                    decision = graph["decisions"][0]
                    assert isinstance(decision, PracticeFollowUpDecision)
                    assert decision.action == "askFollowUp"
                    assert decision.follow_up_question_id == follow_up_question_id
                    assert len(graph["questions"]) == 1
                    question = graph["questions"][0]
                    assert isinstance(question, PracticeFollowUpQuestion)
                    assert question.id == follow_up_question_id
                    assert len(graph["answers"]) == 1
                    answer = graph["answers"][0]
                    assert isinstance(answer, PracticeAnswer)
                    assert answer.kind == "main"
                    assert len(graph["runs"]) == 1
                    async with database.sessionmaker() as session:
                        persisted_session = await session.get(
                            PracticeSession,
                            session_id,
                        )
                        persisted_attempt = await session.get(
                            PracticeAttempt,
                            attempt_id,
                        )
                        assert persisted_session is not None
                        assert persisted_attempt is not None
                        assert persisted_session.status == "active"
                        assert persisted_session.version == 5
                        assert persisted_session.completion_reason is None
                        assert persisted_session.completed_at is None
                        assert persisted_attempt.status == "evaluating"
                        assert persisted_attempt.completed_at is None

                    replay = client.post(path, json=body, headers=headers)
                    assert replay.status_code == 202
                    assert replay.json() == stopped_body

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"] == stopped_body

                    async with database.sessionmaker() as session:
                        evaluation_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == "practice-evaluator",
                                    )
                                )
                            ).all()
                        )
                        assert len(evaluation_runs) == 1

                    assert await build_evaluation_worker(
                        database,
                        PracticeEvaluationAgent(
                            FakeLLMProvider(
                                [evaluation_response()],
                                provider="fake-evaluation-provider",
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    pending = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 5},
                        headers=headers,
                    )
                    assert pending.status_code == 200
                    assert pending.json()["status"] == "evaluating"
                    assert pending.json()["followUpCompletion"] == stopped_body[
                        "followUpCompletion"
                    ]

                    assert await build_worker(
                        database,
                        PracticeReviewAgent(
                            FakeLLMProvider(
                                [review_output()],
                                provider="fake-review-provider",
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    review_pending = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 5},
                        headers=headers,
                    )
                    assert review_pending.status_code == 200
                    assert review_pending.json()["status"] == "evaluating"
                    assert review_pending.json()["followUpCompletion"] == stopped_body[
                        "followUpCompletion"
                    ]

                    assert await build_worker(
                        database,
                        PracticeRecommendationAgent(
                            FakeLLMProvider(
                                [recommendation_output("retryCurrent")],
                                provider="fake-recommendation-provider",
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    await complete_queued_reference_answers(database)
                    review = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 5},
                        headers=headers,
                    )
                    assert review.status_code == 200
                    review_body = review.json()
                    assert review_body["status"] == "review"
                    assert review_body["version"] == 6
                    assert review_body["followUpExchanges"] == []
                    assert review_body["followUpCompletion"] == stopped_body[
                        "followUpCompletion"
                    ]

                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": 6},
                        headers=headers,
                    )
                    assert completed.status_code == 200
                    assert completed.json()["status"] == "completed"
                    assert completed.json()["completionReason"] == "reviewCompleted"

                async with database.sessionmaker() as session:
                    persisted_attempt = await session.get(
                        PracticeAttempt,
                        attempt_id,
                    )
                    assert persisted_attempt is not None
                    assert persisted_attempt.status == "completed"
                    assert persisted_attempt.completed_at is not None
            finally:
                await database.reset()

    asyncio.run(run_test())
