import asyncio
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import PracticeRecommendationAgent, PracticeReviewAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import PracticeAttempt, QuestionCard
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
    build_follow_up_worker,
    evaluation_response,
    seed_answering_session,
)
from tests.integration.test_practice_answer_api import start_answering
from tests.integration.test_practice_review_workflow import (
    build_worker,
    complete_required_reference_answers,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-question-flags-api-test-key",
        session_cookie_secure=False,
    )


async def prepare_review_session(
    database: Database,
    url: str,
) -> tuple[object, UUID, UUID, object]:
    owner, practice_session, _attempt, card = await seed_answering_session(
        database
    )
    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
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
    async with database.sessionmaker() as session:
        recommendation_pending = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=4,
        )
    assert recommendation_pending.attempt.status == "evaluating"
    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider([recommendation_output("retryCurrent")]),
            model="fake-recommendation-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        references_pending = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=4,
        )
    assert references_pending.attempt.status == "evaluating"
    await complete_required_reference_answers(database)
    app = create_app(settings(url))
    app.dependency_overrides[require_current_user] = lambda: owner
    return app, practice_session.id, card.id, owner


def test_practice_question_flags_persist_from_answering_over_http() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    question_id = answering["question"]["id"]

                    saved = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/saved",
                        json={
                            "version": answering["version"],
                            "questionId": str(question_id),
                            "isSaved": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert saved.status_code == 200
                    assert saved.json()["status"] == "answering"
                    assert saved.json()["version"] == answering["version"] + 1
                    assert saved.json()["question"]["isSaved"] is True

                    weak = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/weak",
                        json={
                            "version": saved.json()["version"],
                            "questionId": str(question_id),
                            "isMarkedWeak": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert weak.status_code == 200
                    assert weak.json()["status"] == "answering"
                    assert weak.json()["version"] == saved.json()["version"] + 1
                    assert weak.json()["question"] == {
                        **saved.json()["question"],
                        "isMarkedWeak": True,
                    }

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"]["question"]["isSaved"] is True
                    assert current.json()["session"]["question"]["isMarkedWeak"] is True

                async with database.sessionmaker() as session:
                    card = await session.get(QuestionCard, UUID(question_id))
                    assert card is not None
                    assert card.user_id == owner.id
                    assert card.is_saved is True
                    assert card.is_marked_weak is True
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_question_flags_enter_review_summary_from_real_data() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                app, session_id, question_id, owner = await prepare_review_session(
                    database,
                    url,
                )

                with TestClient(app) as client:
                    evaluating = client.get("/api/practice/sessions/current")
                    assert evaluating.status_code == 200
                    evaluating_body = evaluating.json()["session"]
                    assert evaluating_body["status"] == "evaluating"

                    review = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": evaluating_body["version"]},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert review.status_code == 200
                    review_body = review.json()
                    assert review_body["status"] == "review"
                    review_snapshot = {
                        "evaluation": review_body["evaluation"],
                        "review": review_body["review"],
                        "mainAnswer": review_body["mainAnswer"],
                        "followUpExchanges": review_body["followUpExchanges"],
                        "followUpCompletion": review_body["followUpCompletion"],
                    }

                    saved = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/saved",
                        json={
                            "version": review_body["version"],
                            "questionId": str(question_id),
                            "isSaved": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert saved.status_code == 200
                    weak = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/weak",
                        json={
                            "version": saved.json()["version"],
                            "questionId": str(question_id),
                            "isMarkedWeak": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert weak.status_code == 200
                    assert weak.json()["status"] == "review"
                    assert {
                        key: weak.json()[key] for key in review_snapshot
                    } == review_snapshot

                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": weak.json()["version"]},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert completed.status_code == 200
                    assert completed.json()["questionsCompleted"] == 1
                    assert completed.json()["savedQuestionCount"] == 1
                    assert completed.json()["markedWeakQuestionCount"] == 1

                async with database.sessionmaker() as session:
                    card = await session.get(QuestionCard, question_id)
                    assert card is not None
                    assert card.user_id == owner.id
                    assert card.is_saved is True
                    assert card.is_marked_weak is True
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_question_flags_follow_retry_without_cloning_the_card() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                app, session_id, question_id, owner = await prepare_review_session(
                    database,
                    url,
                )

                with TestClient(app) as client:
                    evaluating = client.get("/api/practice/sessions/current")
                    assert evaluating.status_code == 200
                    assert evaluating.json()["session"]["status"] == "evaluating"
                    review = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": evaluating.json()["session"]["version"]},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert review.status_code == 200, review.json()
                    review_body = review.json()

                    async with database.sessionmaker() as session:
                        before_cards = list(
                            (
                                await session.scalars(
                                    select(QuestionCard).where(
                                        QuestionCard.user_id == owner.id
                                    )
                                )
                            ).all()
                        )

                    retried = client.post(
                        f"/api/practice/sessions/{session_id}/questions/retry",
                        json={
                            "version": review_body["version"],
                            "questionId": str(question_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert retried.status_code == 200, retried.json()
                    assert retried.json()["status"] == "answering"
                    assert retried.json()["question"]["id"] == str(question_id)

                    saved = client.patch(
                        f"/api/practice/sessions/{session_id}/questions/saved",
                        json={
                            "version": retried.json()["version"],
                            "questionId": str(question_id),
                            "isSaved": True,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert saved.status_code == 200
                    assert saved.json()["question"]["isSaved"] is True

                async with database.sessionmaker() as session:
                    after_cards = list(
                        (
                            await session.scalars(
                                select(QuestionCard).where(
                                    QuestionCard.user_id == owner.id
                                )
                            )
                        ).all()
                    )
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    assert len(after_cards) == len(before_cards)
                    assert len(attempts) == 2
                    assert {
                        attempt.question_card_id for attempt in attempts
                    } == {question_id}
                    assert after_cards[0].is_saved is True
            finally:
                await database.reset()

    asyncio.run(run_test())
