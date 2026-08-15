import asyncio
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.practice import get_practice_api_service
from riva.db import get_db_session
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
)
from riva.schemas.evaluation import EvaluationRunPayload
from riva.services.evaluation_generation import practice_evaluation_idempotency_key
from riva.services.follow_up_generation import practice_follow_up_idempotency_key
from riva.services.practice_api import PracticeAPIService
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_practice_answer_api import (
    TRUSTED_ORIGIN,
    ask_output,
    build_worker as build_answer_worker,
    evaluation_output,
    settings,
    start_answering,
)
from tests.integration.test_practice_review_workflow import (
    build_worker as build_review_worker,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration


def headers() -> dict[str, str]:
    return {"Origin": TRUSTED_ORIGIN}


async def prepare_q1(
    client: TestClient,
    database: Database,
    role_id: UUID,
    project_id: UUID,
) -> tuple[str, dict[str, object], dict[str, object]]:
    session_id, answering = await start_answering(
        client,
        database,
        role_id,
        project_id,
    )
    main = client.post(
        f"/api/practice/sessions/{session_id}/answers/main",
        json={
            "version": 2,
            "questionId": answering["question"]["id"],  # type: ignore[index]
            "content": "I owned the rollout and reduced failures.",
        },
        headers=headers(),
    )
    assert main.status_code == 202

    assert await build_answer_worker(
        database,
        agent=FollowUpAgent(
            FakeLLMProvider([ask_output()], provider="fake-follow-up-provider"),
            model="fake-practice-model",
        ),
    ).process_one()
    refreshed = client.post(
        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
        json={"version": 3},
        headers=headers(),
    )
    assert refreshed.status_code == 200
    q1 = refreshed.json()
    assert q1["status"] == "answeringFollowUp"
    assert q1["version"] == 4
    return session_id, main.json(), q1


async def load_graph(
    database: Database,
    *,
    session_id: str,
    user_id: UUID,
) -> dict[str, object]:
    async with database.sessionmaker() as session:
        attempt = await session.scalar(
            select(PracticeAttempt).where(
                PracticeAttempt.session_id == UUID(session_id)
            )
        )
        assert attempt is not None
        answers = list(
            (
                await session.scalars(
                    select(PracticeAnswer)
                    .where(PracticeAnswer.attempt_id == attempt.id)
                    .order_by(PracticeAnswer.order)
                )
            ).all()
        )
        questions = list(
            (
                await session.scalars(
                    select(PracticeFollowUpQuestion)
                    .where(PracticeFollowUpQuestion.attempt_id == attempt.id)
                    .order_by(PracticeFollowUpQuestion.order)
                )
            ).all()
        )
        decisions = list(
            (
                await session.scalars(
                    select(PracticeFollowUpDecision)
                    .where(PracticeFollowUpDecision.attempt_id == attempt.id)
                    .order_by(PracticeFollowUpDecision.order)
                )
            ).all()
        )
        runs = [
            run
            for run in (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "follow-up-generator",
                    )
                )
            ).all()
            if run.payload.get("attemptId") == str(attempt.id)
        ]
        return {
            "attempt": attempt,
            "answers": answers,
            "questions": questions,
            "decisions": decisions,
            "runs": runs,
        }


async def complete_downstream_pipeline(
    client: TestClient,
    database: Database,
    *,
    session_id: str,
    evaluation_version: int,
) -> dict[str, object]:
    evaluation_provider = FakeLLMProvider(
        [evaluation_output()],
        provider="fake-evaluation-provider",
    )
    assert await build_answer_worker(
        database,
        agent=PracticeEvaluationAgent(
            evaluation_provider,
            model="fake-practice-model",
        ),
    ).process_one()

    review_started = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": evaluation_version},
        headers=headers(),
    )
    assert review_started.status_code == 200
    assert review_started.json()["status"] == "evaluating"

    assert await build_review_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider([review_output()], provider="fake-review-provider"),
            model="fake-practice-model",
        ),
    ).process_one()
    recommendation_started = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": evaluation_version},
        headers=headers(),
    )
    assert recommendation_started.status_code == 200
    assert recommendation_started.json()["status"] == "evaluating"

    assert await build_review_worker(
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
    final = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": evaluation_version},
        headers=headers(),
    )
    assert final.status_code == 200
    return final.json()


def test_follow_up_answer_api_one_exchange_projects_all_answered_and_downstream_review() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, main, q1 = await prepare_q1(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    q1_id = q1["currentFollowUp"]["question"]["id"]  # type: ignore[index]
                    a1 = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 4,
                            "questionId": q1["question"]["id"],  # type: ignore[index]
                            "followUpQuestionId": q1_id,
                            "content": "The metric improved by 20 percent.",
                        },
                        headers=headers(),
                    )
                    assert a1.status_code == 202
                    a1_body = a1.json()
                    assert a1_body["status"] == "generatingFollowUp"
                    assert a1_body["version"] == 5
                    assert a1_body["followUpExchanges"][0]["status"] == "answered"
                    assert a1_body["followUpExchanges"][0]["question"]["id"] == q1_id
                    a1_id = a1_body["followUpExchanges"][0]["answer"]["id"]
                    assert a1_body["followUpExchanges"][0]["answer"]["order"] == 2
                    assert a1_body["mainAnswer"] == main["mainAnswer"]

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 4,
                            "questionId": q1["question"]["id"],  # type: ignore[index]
                            "followUpQuestionId": q1_id,
                            "content": "The metric improved by 20 percent.",
                        },
                        headers=headers(),
                    )
                    assert replay.status_code == 202
                    assert replay.json() == a1_body
                    assert client.get(
                        "/api/practice/sessions/current"
                    ).json()["session"] == a1_body
                    changed_replay = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 4,
                            "questionId": q1["question"]["id"],  # type: ignore[index]
                            "followUpQuestionId": q1_id,
                            "content": "Changed answer.",
                        },
                        headers=headers(),
                    )
                    assert changed_replay.status_code == 409
                    assert changed_replay.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    assert await build_answer_worker(
                        database,
                        agent=FollowUpAgent(
                            FakeLLMProvider(
                                [{"action": "complete"}],
                                provider="fake-follow-up-provider",
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    evaluating = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 5},
                        headers=headers(),
                    )
                    assert evaluating.status_code == 200
                    evaluating_body = evaluating.json()
                    assert evaluating_body["status"] == "evaluating"
                    assert evaluating_body["version"] == 6
                    assert evaluating_body["followUpCompletion"] == {
                        "status": "completed",
                        "reason": "allAnswered",
                    }
                    assert len(evaluating_body["followUpExchanges"]) == 1

                    graph = await load_graph(
                        database,
                        session_id=session_id,
                        user_id=owner.id,
                    )
                    assert len(graph["answers"]) == 2
                    assert len(graph["questions"]) == 1
                    assert len(graph["decisions"]) == 2
                    assert len(graph["runs"]) == 2
                    attempt = graph["attempt"]
                    assert isinstance(attempt, PracticeAttempt)
                    evaluation_run = await _load_evaluation_run(
                        database,
                        owner.id,
                        attempt.id,
                    )
                    payload = EvaluationRunPayload.model_validate(
                        evaluation_run.payload
                    )
                    assert payload.follow_up_question_1_id == UUID(q1_id)
                    assert payload.follow_up_answer_1_id == UUID(a1_id)
                    assert payload.follow_up_question_2_id is None
                    assert payload.follow_up_answer_2_id is None
                    assert payload.terminal_follow_up_decision_id == (
                        graph["decisions"][1].id  # type: ignore[index]
                    )

                    final = await complete_downstream_pipeline(
                        client,
                        database,
                        session_id=session_id,
                        evaluation_version=6,
                    )
                    assert final["status"] == "review"
                    assert final["version"] == 7
                    assert final["followUpCompletion"]["reason"] == (
                        "allAnswered"  # type: ignore[index]
                    )
                    assert len(final["followUpExchanges"]) == 1
                    assert final["followUpExchanges"][0]["answer"]["id"] == (
                        a1_id  # type: ignore[index]
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_follow_up_answer_api_two_exchanges_replays_a2_without_order3() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, _main, q1 = await prepare_q1(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    q1_id = q1["currentFollowUp"]["question"]["id"]  # type: ignore[index]
                    a1 = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 4,
                            "questionId": q1["question"]["id"],  # type: ignore[index]
                            "followUpQuestionId": q1_id,
                            "content": "The metric improved.",
                        },
                        headers=headers(),
                    )
                    assert a1.status_code == 202

                    assert await build_answer_worker(
                        database,
                        agent=FollowUpAgent(
                            FakeLLMProvider([ask_output()], provider="fake-follow-up-provider"),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    q2_response = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 5},
                        headers=headers(),
                    )
                    assert q2_response.status_code == 200
                    q2 = q2_response.json()
                    assert q2["status"] == "answeringFollowUp"
                    assert q2["version"] == 6
                    assert len(q2["followUpExchanges"]) == 1
                    q2_id = q2["currentFollowUp"]["question"]["id"]
                    assert client.get(
                        "/api/practice/sessions/current"
                    ).json()["session"] == q2

                    a2 = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 6,
                            "questionId": q2["question"]["id"],
                            "followUpQuestionId": q2_id,
                            "content": "The result stayed reliable.",
                        },
                        headers=headers(),
                    )
                    assert a2.status_code == 202
                    a2_body = a2.json()
                    assert a2_body["status"] == "evaluating"
                    assert a2_body["version"] == 7
                    assert a2_body["followUpCompletion"]["reason"] == "allAnswered"
                    assert [
                        exchange["question"]["id"]
                        for exchange in a2_body["followUpExchanges"]
                    ] == [q1_id, q2_id]
                    a2_id = a2_body["followUpExchanges"][1]["answer"]["id"]

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 6,
                            "questionId": q2["question"]["id"],
                            "followUpQuestionId": q2_id,
                            "content": "The result stayed reliable.",
                        },
                        headers=headers(),
                    )
                    assert replay.status_code == 202
                    assert replay.json() == a2_body
                    wrong_question_replay = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 6,
                            "questionId": q2["question"]["id"],
                            "followUpQuestionId": str(uuid4()),
                            "content": "The result stayed reliable.",
                        },
                        headers=headers(),
                    )
                    assert wrong_question_replay.status_code == 409
                    assert wrong_question_replay.json() == {
                        "error": "practice_session_version_conflict"
                    }
                    assert client.get(
                        "/api/practice/sessions/current"
                    ).json()["session"] == a2_body

                    graph = await load_graph(
                        database,
                        session_id=session_id,
                        user_id=owner.id,
                    )
                    assert len(graph["answers"]) == 3
                    assert len(graph["questions"]) == 2
                    assert len(graph["decisions"]) == 2
                    assert len(graph["runs"]) == 2
                    assert {
                        run.idempotency_key for run in graph["runs"]  # type: ignore[union-attr]
                    } == {
                        practice_follow_up_idempotency_key(
                            graph["attempt"].id,  # type: ignore[union-attr]
                            1,
                        ),
                        practice_follow_up_idempotency_key(
                            graph["attempt"].id,  # type: ignore[union-attr]
                            2,
                        ),
                    }
                    attempt = graph["attempt"]
                    assert isinstance(attempt, PracticeAttempt)
                    evaluation_run = await _load_evaluation_run(
                        database,
                        owner.id,
                        attempt.id,
                    )
                    payload = EvaluationRunPayload.model_validate(
                        evaluation_run.payload
                    )
                    assert payload.follow_up_question_1_id == UUID(q1_id)
                    assert payload.follow_up_answer_1_id == (
                        graph["answers"][1].id  # type: ignore[index]
                    )
                    assert payload.follow_up_question_2_id == UUID(q2_id)
                    assert payload.follow_up_answer_2_id == UUID(a2_id)

                    evaluation_provider = FakeLLMProvider(
                        [evaluation_output()],
                        provider="fake-evaluation-provider",
                    )
                    assert await build_answer_worker(
                        database,
                        agent=PracticeEvaluationAgent(
                            evaluation_provider,
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    assert any(
                        "The metric improved." in message.content
                        and "The result stayed reliable." in message.content
                        for message in evaluation_provider.calls[0].messages
                    )
                    async with database.sessionmaker() as session:
                        evaluation = await session.scalar(
                            select(PracticeEvaluation).where(
                                PracticeEvaluation.attempt_id == attempt.id
                            )
                        )
                    assert evaluation is not None
            finally:
                await database.reset()

    asyncio.run(run_test())


class FailingFollowUpGenerationService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing follow-up model")


def test_follow_up_answer_api_rolls_back_a1_when_order2_enqueue_is_unavailable() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                async def get_failing_service(
                    session: AsyncSession = Depends(get_db_session),
                ) -> PracticeAPIService:
                    return PracticeAPIService(
                        session,
                        llm_provider="qwen",
                        llm_model="fake-practice-model",
                        practice_service_factory=(
                            lambda service_session, **service_kwargs: PracticeSessionService(
                                service_session,
                                follow_up_generation_service_factory=(
                                    lambda _session, **_kwargs: FailingFollowUpGenerationService()
                                ),
                                **service_kwargs,
                            )
                        ),
                    )

                with TestClient(app) as client:
                    session_id, _main, q1 = await prepare_q1(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    app.dependency_overrides[get_practice_api_service] = (
                        get_failing_service
                    )
                    response = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 4,
                            "questionId": q1["question"]["id"],  # type: ignore[index]
                            "followUpQuestionId": q1["currentFollowUp"][
                                "question"
                            ]["id"],  # type: ignore[index]
                            "content": "This must roll back.",
                        },
                        headers=headers(),
                    )
                    assert response.status_code == 503
                    assert response.json() == {
                        "error": "practice_follow_up_generation_unavailable"
                    }

                    graph = await load_graph(
                        database,
                        session_id=session_id,
                        user_id=owner.id,
                    )
                    attempt = graph["attempt"]
                    assert isinstance(attempt, PracticeAttempt)
                    assert attempt.status == "answeringFollowUp"
                    assert attempt.session_id == UUID(session_id)
                    async with database.sessionmaker() as session:
                        practice_session = await session.scalar(
                            select(PracticeSession).where(
                                PracticeSession.id == UUID(session_id)
                            )
                        )
                    assert practice_session is not None
                    assert practice_session.version == 4
                    assert len(graph["answers"]) == 1
                    assert len(graph["runs"]) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


async def _load_evaluation_run(
    database: Database,
    user_id: UUID,
    attempt_id: UUID,
) -> AgentRun:
    async with database.sessionmaker() as session:
        run = await session.scalar(
            select(AgentRun).where(
                AgentRun.user_id == user_id,
                AgentRun.agent_id == "practice-evaluator",
                AgentRun.idempotency_key
                == practice_evaluation_idempotency_key(attempt_id),
            )
        )
        assert run is not None
        assert run.status in {AgentRunStatus.QUEUED, AgentRunStatus.SUCCEEDED}
        return run
