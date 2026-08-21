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
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus, PracticeFollowUpQuestion, QuestionCard
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_answer_workflow import seed_answering_session
from tests.integration.test_practice_follow_up_answer_workflow import (
    follow_up_question_output,
    follow_up_refresh,
    prepare_question_and_main_answer,
    run_follow_up_worker,
)
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    evaluation_output,
    review_output,
)
from tests.integration.test_practice_review_workflow import (
    complete_required_reference_answers,
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
        session_digest_key="practice-guidance-reveal-api-test-key",
        session_cookie_secure=False,
    )


async def question_generation_run_count(
    database: Database,
    *,
    user_id: UUID,
    run_id: UUID,
) -> int:
    async with database.sessionmaker() as session:
        return len(
            list(
                (
                    await session.scalars(
                        select(AgentRun).where(
                            AgentRun.id == run_id,
                            AgentRun.user_id == user_id,
                        )
                    )
                ).all()
            )
        )


def test_main_guidance_reveal_is_private_durable_and_versioned_over_http() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, practice_session, _attempt, card = await seed_answering_session(
                    database
                )
                assert card.answer_hints
                assert card.answer_framework
                assert card.answer_hints_revealed is False
                assert card.answer_framework_revealed is False
                before_runs = await question_generation_run_count(
                    database,
                    user_id=owner.id,
                    run_id=card.source_agent_run_id,
                )

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {"Origin": TRUSTED_ORIGIN}
                path = f"/api/practice/sessions/{practice_session.id}"
                hint_path = f"{path}/questions/hint"
                framework_path = f"{path}/questions/framework"

                with TestClient(app) as client:
                    initial = client.get("/api/practice/sessions/current")
                    assert initial.status_code == 200
                    initial_body = initial.json()["session"]
                    assert initial_body["status"] == "answering"
                    assert initial_body["question"]["answerHints"] == {
                        "status": "notRequested",
                        "content": None,
                    }
                    assert initial_body["question"]["answerFramework"] == {
                        "status": "notRequested",
                        "content": None,
                    }

                    hinted = client.post(
                        hint_path,
                        json={
                            "version": initial_body["version"],
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert hinted.status_code == 200
                    hinted_body = hinted.json()
                    assert hinted_body["version"] == initial_body["version"] + 1
                    assert hinted_body["question"]["answerHints"] == {
                        "status": "revealed",
                        "content": list(card.answer_hints),
                    }
                    assert hinted_body["question"]["answerFramework"] == {
                        "status": "notRequested",
                        "content": None,
                    }

                    framed = client.post(
                        framework_path,
                        json={
                            "version": hinted_body["version"],
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert framed.status_code == 200
                    framed_body = framed.json()
                    assert framed_body["version"] == hinted_body["version"] + 1
                    assert (
                        framed_body["question"]["answerHints"]["status"] == "revealed"
                    )
                    assert framed_body["question"]["answerFramework"] == {
                        "status": "revealed",
                        "content": list(card.answer_framework),
                    }

                    recovered = client.get("/api/practice/sessions/current")
                    assert recovered.status_code == 200
                    assert recovered.json()["session"] == framed_body

                    same_value = client.post(
                        hint_path,
                        json={
                            "version": framed_body["version"],
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert same_value.status_code == 200
                    assert same_value.json()["version"] == framed_body["version"] + 1
                    assert same_value.json()["question"] == framed_body["question"]

                    stale = client.post(
                        framework_path,
                        json={
                            "version": framed_body["version"],
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert stale.status_code == 409

                    for invalid_body in (
                        {"questionId": str(card.id)},
                        {"version": 0, "questionId": str(card.id)},
                        {"version": 99, "questionId": "not-a-uuid"},
                        {
                            "version": same_value.json()["version"],
                            "questionId": str(card.id),
                            "content": ["forbidden"],
                        },
                    ):
                        invalid = client.post(
                            hint_path,
                            json=invalid_body,
                            headers=headers,
                        )
                        assert invalid.status_code == 422

                async with database.sessionmaker() as session:
                    stored_card = await session.get(QuestionCard, card.id)
                    assert stored_card is not None
                    assert stored_card.answer_hints_revealed is True
                    assert stored_card.answer_framework_revealed is True
                after_runs = await question_generation_run_count(
                    database,
                    user_id=owner.id,
                    run_id=card.source_agent_run_id,
                )
                assert before_runs == after_runs == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_follow_up_guidance_reveal_survives_answering_q1_and_resets_q2_over_http() -> (
    None
):
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    attempt_id,
                    card_id,
                ) = await prepare_question_and_main_answer(database)
                await run_follow_up_worker(database, follow_up_question_output(1))
                await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=3,
                )

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {"Origin": TRUSTED_ORIGIN}
                path = f"/api/practice/sessions/{session_id}"

                with TestClient(app) as client:
                    initial = client.get("/api/practice/sessions/current")
                    assert initial.status_code == 200
                    initial_body = initial.json()["session"]
                    assert initial_body["status"] == "answeringFollowUp"
                    question_1_id = initial_body["currentFollowUp"]["question"]["id"]
                    assert initial_body["currentFollowUp"]["question"][
                        "answerHints"
                    ] == {
                        "status": "notRequested",
                        "content": None,
                    }

                    hinted = client.post(
                        f"{path}/follow-ups/hint",
                        json={
                            "version": initial_body["version"],
                            "questionId": str(card_id),
                            "followUpQuestionId": question_1_id,
                        },
                        headers=headers,
                    )
                    assert hinted.status_code == 200
                    hinted_body = hinted.json()
                    assert hinted_body["version"] == initial_body["version"] + 1
                    assert (
                        hinted_body["currentFollowUp"]["question"]["answerHints"][
                            "status"
                        ]
                        == "revealed"
                    )

                    framed = client.post(
                        f"{path}/follow-ups/framework",
                        json={
                            "version": hinted_body["version"],
                            "questionId": str(card_id),
                            "followUpQuestionId": question_1_id,
                        },
                        headers=headers,
                    )
                    assert framed.status_code == 200
                    framed_body = framed.json()
                    assert framed_body["version"] == hinted_body["version"] + 1
                    assert (
                        framed_body["currentFollowUp"]["question"]["answerFramework"][
                            "status"
                        ]
                        == "revealed"
                    )

                    submitted = client.post(
                        f"{path}/answers/follow-up",
                        json={
                            "version": framed_body["version"],
                            "questionId": str(card_id),
                            "followUpQuestionId": question_1_id,
                            "content": "The metric improved by 20 percent.",
                        },
                        headers=headers,
                    )
                    assert submitted.status_code == 202
                    submitted_body = submitted.json()
                    assert submitted_body["status"] == "generatingFollowUp"
                    assert submitted_body["version"] == framed_body["version"] + 1
                    assert (
                        submitted_body["followUpExchanges"][0]["question"][
                            "answerHints"
                        ]["status"]
                        == "revealed"
                    )
                    assert (
                        submitted_body["followUpExchanges"][0]["question"][
                            "answerFramework"
                        ]["status"]
                        == "revealed"
                    )

                    await run_follow_up_worker(database, follow_up_question_output(2))
                    next_question = client.post(
                        f"{path}/follow-up-generation/refresh",
                        json={"version": submitted_body["version"]},
                        headers=headers,
                    )
                    assert next_question.status_code == 200
                    next_body = next_question.json()
                    assert next_body["status"] == "answeringFollowUp"
                    assert next_body["version"] == submitted_body["version"] + 1
                    assert (
                        next_body["followUpExchanges"][0]["question"]["answerHints"][
                            "status"
                        ]
                        == "revealed"
                    )
                    assert (
                        next_body["followUpExchanges"][0]["question"][
                            "answerFramework"
                        ]["status"]
                        == "revealed"
                    )
                    assert (
                        next_body["currentFollowUp"]["question"]["id"] != question_1_id
                    )
                    assert next_body["currentFollowUp"]["question"]["answerHints"] == {
                        "status": "notRequested",
                        "content": None,
                    }
                    assert next_body["currentFollowUp"]["question"][
                        "answerFramework"
                    ] == {
                        "status": "notRequested",
                        "content": None,
                    }

                    recovered = client.get("/api/practice/sessions/current")
                    assert recovered.status_code == 200
                    assert recovered.json()["session"] == next_body

                async with database.sessionmaker() as session:
                    questions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpQuestion)
                                .where(
                                    PracticeFollowUpQuestion.attempt_id == attempt_id
                                )
                                .order_by(PracticeFollowUpQuestion.order)
                            )
                        ).all()
                    )
                    assert len(questions) == 2
                    assert questions[0].answer_hints_revealed is True
                    assert questions[0].answer_framework_revealed is True
                    assert questions[1].answer_hints_revealed is False
                    assert questions[1].answer_framework_revealed is False
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_main_guidance_reveal_survives_review_and_retry_over_http() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, practice_session, _attempt, card = await seed_answering_session(
                    database
                )
                async with database.sessionmaker() as session:
                    cards_before = list(
                        (
                            await session.scalars(
                                select(QuestionCard).where(
                                    QuestionCard.user_id == owner.id
                                )
                            )
                        ).all()
                    )

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {"Origin": TRUSTED_ORIGIN}
                path = f"/api/practice/sessions/{practice_session.id}"

                with TestClient(app) as client:
                    initial = client.get("/api/practice/sessions/current")
                    assert initial.status_code == 200
                    initial_body = initial.json()["session"]
                    revealed = client.post(
                        f"{path}/questions/hint",
                        json={
                            "version": initial_body["version"],
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert revealed.status_code == 200
                    revealed_body = revealed.json()
                    assert revealed_body["version"] == initial_body["version"] + 1
                    assert revealed_body["question"]["answerHints"]["status"] == (
                        "revealed"
                    )

                    async with database.sessionmaker() as session:
                        submitted = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).submit_primary_answer(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=revealed_body["version"],
                            question_id=card.id,
                            content="I owned the rollout and reduced failures.",
                        )
                    assert submitted.session.version == revealed_body["version"] + 1

                    await run_follow_up_worker(
                        database,
                        {"action": "complete"},
                    )
                    async with database.sessionmaker() as session:
                        follow_up_ready = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).refresh_follow_up_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=submitted.session.version,
                        )
                    assert (
                        follow_up_ready.session.version == submitted.session.version + 1
                    )

                    assert await build_worker(
                        database,
                        PracticeEvaluationAgent(
                            FakeLLMProvider(
                                [evaluation_output()],
                                provider="practice-guidance-evaluation-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    async with database.sessionmaker() as session:
                        evaluation_ready = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).refresh_evaluation_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=follow_up_ready.session.version,
                        )
                    assert (
                        evaluation_ready.session.version
                        == follow_up_ready.session.version
                    )

                    assert await build_worker(
                        database,
                        PracticeReviewAgent(
                            FakeLLMProvider(
                                [review_output()],
                                provider="practice-guidance-review-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    async with database.sessionmaker() as session:
                        review_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.agent_id == "practice-reviewer"
                                    )
                                )
                            ).all()
                        )
                        assert len(review_runs) == 1
                        assert review_runs[0].status is AgentRunStatus.SUCCEEDED, (
                            review_runs[0].error_code
                        )
                    async with database.sessionmaker() as session:
                        recommendation_pending = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).refresh_evaluation_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=evaluation_ready.session.version,
                        )
                    assert recommendation_pending.attempt.status == "evaluating"
                    assert await build_worker(
                        database,
                        PracticeRecommendationAgent(
                            FakeLLMProvider(
                                [
                                    {
                                        "action": "retryCurrent",
                                        "reason": "Repeat the current question to strengthen the evidence.",
                                    }
                                ],
                                provider="practice-guidance-recommendation-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()
                    async with database.sessionmaker() as session:
                        references_pending = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).refresh_evaluation_generation(
                            user_id=owner.id,
                            session_id=practice_session.id,
                            expected_version=evaluation_ready.session.version,
                        )
                    assert references_pending.attempt.status == "evaluating"
                    assert references_pending.session.version == (
                        evaluation_ready.session.version
                    )
                    review = None
                    for _ in range(5):
                        await complete_required_reference_answers(database)
                        async with database.sessionmaker() as session:
                            review = await PracticeSessionService(
                                session,
                                llm_model="fake-practice-model",
                            ).refresh_evaluation_generation(
                                user_id=owner.id,
                                session_id=practice_session.id,
                                expected_version=evaluation_ready.session.version,
                            )
                        if review.attempt.status == "review":
                            break
                    assert review is not None
                    assert review.attempt.status == "review"

                    retried = client.post(
                        f"{path}/questions/retry",
                        json={
                            "version": review.session.version,
                            "questionId": str(card.id),
                        },
                        headers=headers,
                    )
                    assert retried.status_code == 200, retried.json()
                    retried_body = retried.json()
                    assert retried_body["status"] == "answering"
                    assert retried_body["version"] == review.session.version + 1
                    assert retried_body["question"]["id"] == str(card.id)
                    assert (
                        retried_body["question"]["answerHints"]
                        == revealed_body["question"]["answerHints"]
                    )
                    assert retried_body["question"]["answerFramework"] == {
                        "status": "notRequested",
                        "content": None,
                    }

                async with database.sessionmaker() as session:
                    cards_after = list(
                        (
                            await session.scalars(
                                select(QuestionCard).where(
                                    QuestionCard.user_id == owner.id
                                )
                            )
                        ).all()
                    )
                    stored_card = await session.get(QuestionCard, card.id)
                    assert stored_card is not None
                    assert stored_card.answer_hints_revealed is True
                    assert stored_card.answer_framework_revealed is False
                assert len(cards_after) == len(cards_before) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
