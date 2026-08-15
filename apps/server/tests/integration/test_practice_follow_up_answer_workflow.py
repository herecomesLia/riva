import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlalchemy import select

from riva.agents import (
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
)
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.services.evaluation_generation import practice_evaluation_idempotency_key
from riva.services.follow_up_generation import practice_follow_up_idempotency_key
from riva.services.practice_sessions import (
    PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
    PracticeEvaluationWorkflowContext,
    PracticeSessionService,
    PracticeSessionStateError,
)
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_practice_answer_workflow import (
    build_evaluation_worker,
    build_follow_up_worker,
    build_question_worker,
    evaluation_response,
    question_response,
    seed_answering_session,
)
from tests.integration.test_practice_review_workflow import (
    build_worker,
    evaluation_output,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


def follow_up_question_output(order: int) -> dict[str, object]:
    return {
        "action": "askFollowUp",
        "prompt": f"What evidence supports follow-up {order}?",
        "focus": "Evidence",
        "answer_hints": ["Name the metric."],
        "answer_framework": ["Baseline", "Result"],
    }


class FailingFollowUpEnqueueService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing follow-up model")


async def prepare_question_and_main_answer(database):
    owner, practice_session, attempt, card = await seed_answering_session(
        database
    )
    async with database.sessionmaker() as session:
        main_context = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
            clock=lambda: START,
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=practice_session.id,
            expected_version=2,
            question_id=card.id,
            content="I owned the rollout and reduced failures.",
        )
    assert main_context.session.version == 3
    assert main_context.attempt.status == "answering"
    return owner, practice_session.id, attempt.id, card.id


async def run_follow_up_worker(database, response: dict[str, object]) -> None:
    provider = FakeLLMProvider(
        [response],
        provider="fake-follow-up-provider",
    )
    assert await build_follow_up_worker(database, provider).process_one()


async def follow_up_refresh(
    database,
    *,
    user_id: UUID,
    session_id: UUID,
    expected_version: int,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_follow_up_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
        )


async def submit_follow_up(
    database,
    *,
    user_id: UUID,
    session_id: UUID,
    expected_version: int,
    question_id: UUID,
    follow_up_question_id: UUID,
    content: str,
    **service_kwargs: object,
):
    async with database.sessionmaker() as session:
        return await PracticeSessionService(
            session,
            clock=lambda: START,
            **service_kwargs,
        ).submit_follow_up_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
            content=content,
        )


async def load_follow_up_graph(database, attempt_id: UUID) -> dict[str, list[object]]:
    async with database.sessionmaker() as session:
        return {
            "answers": list(
                (
                    await session.scalars(
                        select(PracticeAnswer)
                        .where(PracticeAnswer.attempt_id == attempt_id)
                        .order_by(PracticeAnswer.order)
                    )
                ).all()
            ),
            "questions": list(
                (
                    await session.scalars(
                        select(PracticeFollowUpQuestion)
                        .where(PracticeFollowUpQuestion.attempt_id == attempt_id)
                        .order_by(PracticeFollowUpQuestion.order)
                    )
                ).all()
            ),
            "decisions": list(
                (
                    await session.scalars(
                        select(PracticeFollowUpDecision)
                        .where(PracticeFollowUpDecision.attempt_id == attempt_id)
                        .order_by(PracticeFollowUpDecision.order)
                    )
                ).all()
            ),
        }


async def load_follow_up_runs(database, user_id: UUID, attempt_id: UUID) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "follow-up-generator",
                    )
                )
            ).all()
        )
    return [run for run in runs if run.payload.get("attemptId") == str(attempt_id)]


async def evaluation_run_for(database, user_id: UUID, attempt_id: UUID) -> AgentRun:
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
        return run


def test_practice_follow_up_one_exchange_reaches_real_evaluation_review_recommendation() -> None:
    async def run_test() -> None:
        from riva.db.database import Database

        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, card_id = (
                    await prepare_question_and_main_answer(database)
                )
                await run_follow_up_worker(
                    database,
                    follow_up_question_output(1),
                )
                first = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=3,
                )
                assert first.attempt.status == "answeringFollowUp"
                assert first.session.version == 4
                question_1_id = first.follow_up_question.id  # type: ignore[union-attr]

                answered = await submit_follow_up(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=4,
                    question_id=card_id,
                    follow_up_question_id=question_1_id,
                    content="The metric improved by 20 percent.",
                )
                assert answered.attempt.status == "answering"
                assert answered.session.version == 5
                assert len(answered.follow_up_exchanges) == 1

                await run_follow_up_worker(database, {"action": "complete"})
                evaluating = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=5,
                )
                assert isinstance(evaluating, PracticeEvaluationWorkflowContext)
                assert evaluating.attempt.status == "evaluating"
                assert evaluating.session.version == 6
                assert evaluating.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                )

                graph = await load_follow_up_graph(database, attempt_id)
                assert len(graph["answers"]) == 2
                assert len(graph["questions"]) == 1
                assert len(graph["decisions"]) == 2
                runs = await load_follow_up_runs(database, owner.id, attempt_id)
                assert len(runs) == 2
                assert {
                    run.idempotency_key
                    for run in runs
                } == {
                    practice_follow_up_idempotency_key(attempt_id, 1),
                    practice_follow_up_idempotency_key(attempt_id, 2),
                }
                evaluation_run = await evaluation_run_for(
                    database,
                    owner.id,
                    attempt_id,
                )
                evaluation_payload = EvaluationRunPayload.model_validate(
                    evaluation_run.payload
                )
                assert evaluation_payload.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                )
                assert evaluation_payload.terminal_follow_up_decision_id == (
                    graph["decisions"][1].id  # type: ignore[union-attr]
                )
                assert evaluation_payload.follow_up_question_1_id == (
                    graph["questions"][0].id  # type: ignore[union-attr]
                )
                assert evaluation_payload.follow_up_answer_1_id == (
                    graph["answers"][1].id  # type: ignore[union-attr]
                )
                assert evaluation_payload.follow_up_question_2_id is None
                assert evaluation_payload.follow_up_answer_2_id is None

                assert await build_evaluation_worker(
                    database,
                    PracticeEvaluationAgent(
                        FakeLLMProvider([evaluation_response()]),
                        model="fake-evaluation-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    evaluation = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.id == evaluation_run.id,
                            AgentRun.status == AgentRunStatus.SUCCEEDED,
                        )
                    )
                    assert evaluation is not None

                async with database.sessionmaker() as session:
                    review_started = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                    )
                assert review_started.attempt.status == "evaluating"
                assert review_started.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                )
                assert await build_worker(
                    database,
                    PracticeReviewAgent(
                        FakeLLMProvider([review_output()]),
                        model="fake-review-model",
                    ),
                ).process_one()

                async with database.sessionmaker() as session:
                    recommendation_started = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                    )
                assert recommendation_started.attempt.status == "evaluating"
                assert await build_worker(
                    database,
                    PracticeRecommendationAgent(
                        FakeLLMProvider([recommendation_output("retryCurrent")]),
                        model="fake-recommendation-model",
                    ),
                ).process_one()
                await complete_queued_reference_answers(database)

                async with database.sessionmaker() as session:
                    final = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_evaluation_generation(
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=6,
                    )
                assert final.attempt.status == "review"
                assert final.session.version == 7
                assert final.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                )
                assert len(final.follow_up_exchanges) == 1
                assert final.follow_up_exchanges[0].question.id == question_1_id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_two_exchanges_freezes_q1_a1_q2_a2_without_order3() -> None:
    async def run_test() -> None:
        from riva.agents import PracticeEvaluationAgent
        from riva.db.database import Database

        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, card_id = (
                    await prepare_question_and_main_answer(database)
                )
                await run_follow_up_worker(database, follow_up_question_output(1))
                first = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=3,
                )
                question_1_id = first.follow_up_question.id  # type: ignore[union-attr]
                answered = await submit_follow_up(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=4,
                    question_id=card_id,
                    follow_up_question_id=question_1_id,
                    content="The metric improved.",
                )
                assert answered.session.version == 5

                await run_follow_up_worker(database, follow_up_question_output(2))
                second = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=5,
                )
                assert second.attempt.status == "answeringFollowUp"
                assert second.session.version == 6
                question_2_id = second.follow_up_question.id  # type: ignore[union-attr]

                final_answer = await submit_follow_up(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=6,
                    question_id=card_id,
                    follow_up_question_id=question_2_id,
                    content="The result stayed reliable.",
                )
                assert final_answer.attempt.status == "evaluating"
                assert final_answer.session.version == 7
                assert len(final_answer.follow_up_exchanges) == 2

                graph = await load_follow_up_graph(database, attempt_id)
                assert len(graph["answers"]) == 3
                assert len(graph["questions"]) == 2
                assert len(graph["decisions"]) == 2
                runs = await load_follow_up_runs(database, owner.id, attempt_id)
                assert len(runs) == 2
                evaluation_run = await evaluation_run_for(database, owner.id, attempt_id)
                payload = EvaluationRunPayload.model_validate(evaluation_run.payload)
                assert payload.follow_up_completion_reason == (
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                )
                assert payload.terminal_follow_up_decision_id == graph["decisions"][1].id  # type: ignore[union-attr]
                assert payload.follow_up_question_1_id == graph["questions"][0].id  # type: ignore[union-attr]
                assert payload.follow_up_answer_1_id == graph["answers"][1].id  # type: ignore[union-attr]
                assert payload.follow_up_question_2_id == graph["questions"][1].id  # type: ignore[union-attr]
                assert payload.follow_up_answer_2_id == graph["answers"][2].id  # type: ignore[union-attr]

                assert await build_evaluation_worker(
                    database,
                    PracticeEvaluationAgent(
                        FakeLLMProvider([evaluation_response()]),
                        model="fake-evaluation-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    stored = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.id == evaluation_run.id,
                            AgentRun.status == AgentRunStatus.SUCCEEDED,
                        )
                    )
                    assert stored is not None
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_follow_up_answer_rolls_back_when_order2_enqueue_is_unavailable() -> None:
    async def run_test() -> None:
        from riva.db.database import Database

        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, session_id, attempt_id, card_id = (
                    await prepare_question_and_main_answer(database)
                )
                await run_follow_up_worker(database, follow_up_question_output(1))
                first = await follow_up_refresh(
                    database,
                    user_id=owner.id,
                    session_id=session_id,
                    expected_version=3,
                )
                question_1_id = first.follow_up_question.id  # type: ignore[union-attr]
                with pytest.raises(PracticeSessionStateError) as error:
                    await submit_follow_up(
                        database,
                        user_id=owner.id,
                        session_id=session_id,
                        expected_version=4,
                        question_id=card_id,
                        follow_up_question_id=question_1_id,
                        content="This must roll back.",
                        llm_model="fake-follow-up-model",
                        follow_up_generation_service_factory=(
                            lambda _session, **kwargs: FailingFollowUpEnqueueService()
                        ),
                    )
                assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE

                async with database.sessionmaker() as session:
                    attempt = await session.scalar(
                        select(PracticeSession).where(
                            PracticeSession.id == session_id
                        )
                    )
                    assert attempt is not None
                    assert attempt.version == 4
                    answers = list(
                        (
                            await session.scalars(
                                select(PracticeAnswer).where(
                                    PracticeAnswer.attempt_id == attempt_id
                                )
                            )
                        ).all()
                    )
                    assert len(answers) == 1
                    order2_runs = [
                        run
                        for run in (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.agent_id == "follow-up-generator",
                                    AgentRun.user_id == owner.id,
                                )
                            )
                        ).all()
                        if run.idempotency_key
                        == practice_follow_up_idempotency_key(attempt_id, 2)
                    ]
                    assert order2_runs == []
            finally:
                await database.reset()

    asyncio.run(run_test())
