import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from riva.agents import (
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus
from riva.services.practice_api import PracticeAPIService
from riva.services.practice_sessions import (
    PracticeEvaluationWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
)
from riva.services.reference_answer_generation import (
    practice_follow_up_reference_answer_idempotency_key,
    practice_main_reference_answer_idempotency_key,
)
from riva.workers import AgentWorker
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
)
from tests.integration.test_practice_follow_up_answer_workflow import (
    follow_up_refresh,
    prepare_question_and_main_answer,
    run_follow_up_worker,
    submit_follow_up,
)
from tests.integration.test_practice_reference_answer_workflow import (
    build_reference_worker,
    follow_up_reference_response,
    main_reference_response,
)
from tests.integration.test_practice_review_workflow import (
    build_worker,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 15, 9, 30, tzinfo=UTC)


def _review_workers(
    database: Database,
) -> tuple[AgentWorker, AgentWorker]:
    return (
        build_worker(
            database,
            PracticeReviewAgent(
                FakeLLMProvider([review_output()]),
                model="fake-review-model",
            ),
        ),
        build_worker(
            database,
            PracticeRecommendationAgent(
                FakeLLMProvider([recommendation_output("retryCurrent")]),
                model="fake-recommendation-model",
            ),
        ),
    )


async def _complete_two_follow_up_pipeline(
    database: Database,
) -> tuple[object, object, object, object, object, object]:
    owner, session_id, attempt_id, card_id = await prepare_question_and_main_answer(
        database
    )

    await run_follow_up_worker(
        database,
        {
            "action": "askFollowUp",
            "prompt": "What evidence supports the result?",
            "focus": "Attribution evidence",
            "answer_hints": ["Name the metric."],
            "answer_framework": ["Baseline", "Result"],
        },
    )
    first = await follow_up_refresh(
        database,
        user_id=owner.id,
        session_id=session_id,
        expected_version=3,
    )
    first_question_id = first.follow_up_question.id

    first_answer = await submit_follow_up(
        database,
        user_id=owner.id,
        session_id=session_id,
        expected_version=4,
        question_id=card_id,
        follow_up_question_id=first_question_id,
        content="The experiment showed a measurable improvement.",
    )
    assert first_answer.session.version == 5

    await run_follow_up_worker(
        database,
        {
            "action": "askFollowUp",
            "prompt": "How did you control the rollout risk?",
            "focus": "Risk control",
            "answer_hints": ["Name the guardrail."],
            "answer_framework": ["Risk", "Guardrail"],
        },
    )
    second = await follow_up_refresh(
        database,
        user_id=owner.id,
        session_id=session_id,
        expected_version=5,
    )
    second_question_id = second.follow_up_question.id

    final_answer = await submit_follow_up(
        database,
        user_id=owner.id,
        session_id=session_id,
        expected_version=6,
        question_id=card_id,
        follow_up_question_id=second_question_id,
        content="I used a guarded rollout and a rollback threshold.",
    )
    assert final_answer.session.version == 7
    return (
        owner,
        session_id,
        attempt_id,
        card_id,
        first_question_id,
        second_question_id,
    )


def test_review_reference_answers_are_guaranteed_without_user_requests() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner,
                    session_id,
                    _attempt_id,
                    card_id,
                    first_question_id,
                    second_question_id,
                ) = await _complete_two_follow_up_pipeline(database)

                assert await build_evaluation_worker(
                    database,
                    FakeLLMProvider(
                        [
                            {
                                "overallScore": 82,
                                "dimensionScores": [
                                    {
                                        "dimension": dimension,
                                        "score": 82,
                                        "explanation": "Evidence is present.",
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
                        ],
                        provider="guarantee-evaluation-provider",
                        usage=LLMUsage(input_tokens=10, output_tokens=10),
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    evaluation_refresh = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=7,
                    )
                assert isinstance(evaluation_refresh, PracticeEvaluationWorkflowContext)

                review_worker, recommendation_worker = _review_workers(database)
                assert await review_worker.process_one()
                async with database.sessionmaker() as session:
                    review_refresh = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=7,
                    )
                assert isinstance(review_refresh, PracticeEvaluationWorkflowContext)

                assert await recommendation_worker.process_one()
                async with database.sessionmaker() as session:
                    pending = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=7,
                    )
                assert isinstance(pending, PracticeEvaluationWorkflowContext)
                assert pending.attempt.status == "evaluating"
                assert pending.session.version == 7

                async with database.sessionmaker() as session:
                    reference_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id
                                    == "practice-reference-answer-generator",
                                )
                                .order_by(AgentRun.created_at, AgentRun.id)
                            )
                        ).all()
                    )
                assert [run.idempotency_key for run in reference_runs] == [
                    practice_main_reference_answer_idempotency_key(card_id),
                    practice_follow_up_reference_answer_idempotency_key(
                        first_question_id
                    ),
                    practice_follow_up_reference_answer_idempotency_key(
                        second_question_id
                    ),
                ]
                assert all(run.status is AgentRunStatus.QUEUED for run in reference_runs)

                reference_worker = build_reference_worker(
                    database,
                    FakeLLMProvider(
                        [
                            main_reference_response(),
                            follow_up_reference_response(),
                            follow_up_reference_response(),
                        ],
                        provider="guarantee-reference-provider",
                        usage=LLMUsage(input_tokens=10, output_tokens=10),
                    ),
                )
                for _ in reference_runs:
                    assert await reference_worker.process_one()

                async with database.sessionmaker() as session:
                    final = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=7,
                    )
                assert isinstance(final, PracticeReviewWorkflowContext)
                assert final.attempt.status == "review"
                assert final.session.version == 8

                async with database.sessionmaker() as session:
                    response = await PracticeAPIService(
                        session,
                        llm_provider="qwen",
                        llm_model="fake-practice-model",
                    ).get_session(
                        user_id=owner.id,
                        session_id=session_id,
                    )
                assert response.status == "review"
                assert response.version == 8
                assert response.question.reference_answer.status == "revealed"
                assert response.question.reference_answer.viewed_before_submission is False
                assert all(
                    exchange.question.reference_answer.status == "revealed"
                    for exchange in response.follow_up_exchanges
                )
                assert all(
                    exchange.question.reference_answer.viewed_before_submission is False
                    for exchange in response.follow_up_exchanges
                )
            finally:
                await database.reset()

    asyncio.run(run_test())
