import asyncio
from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.agents import (
    FollowUpAgent,
    PracticeReferenceAnswerAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfileProjectExperience,
    JobDescriptionAnalysis,
    PracticeAnswer,
    PracticeAttempt,
    PracticeSession,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerOutput,
    PracticeFollowUpReferenceAnswerRunPayload,
    PracticeReferenceAnswerKind,
    PracticeReferenceAnswerTargetType,
)
from riva.services.question_generation import QuestionGenerationService
from riva.services.reference_answer_generation import (
    ReferenceAnswerGenerationService,
    practice_follow_up_reference_answer_idempotency_key,
    practice_main_reference_answer_idempotency_key,
)
from riva.services.practice_sessions import PracticeSessionService
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    FollowUpHandler,
    PracticeReferenceAnswerHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    seed_context,
)


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def worker(database: Database, handler: object, agent_id: str) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(handler)  # type: ignore[arg-type]
    return AgentWorker(
        worker_id=f"{agent_id}-integration-worker",
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


def follow_up_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    return worker(
        database,
        FollowUpHandler(
            session_factory=database.sessionmaker,
            agent=FollowUpAgent(provider, model="fake-follow-up-model"),
        ),
        "follow-up-generator",
    )


def reference_answer_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    return worker(
        database,
        PracticeReferenceAnswerHandler(
            session_factory=database.sessionmaker,
            agent=PracticeReferenceAnswerAgent(
                provider,
                model="fake-reference-model",
            ),
        ),
        "reference-answer",
    )


async def prepare_follow_up_question(
    database: Database,
) -> tuple[UUID, UUID, UUID, UUID, UUID, UUID, dict[str, object]]:
    owner, role, _, project_id = await seed_context(database)
    question_response = {
        "prompt": "Explain how you designed the payment workflows.",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": ["Technical decision-making"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "Untrusted label",
                "reason": "Relevant project evidence.",
            }
        ],
        "answer_hints": ["Explain your personal contribution."],
        "answer_framework": ["Context", "Decision", "Result"],
        "follow_up_directions": ["Technical rationale"],
        "scoring_focus": ["Evidence of personal contribution"],
    }
    async with database.sessionmaker() as session:
        question_run = await QuestionGenerationService(
            session,
            llm_model="fake-question-model",
        ).enqueue_generation(
            user_id=owner.id,
            target_role_id=role.id,
            question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
            difficulty=QuestionCardDifficulty.BASIC,
            interaction_language="en",
            idempotency_key="reference-answer-follow-up-question",
        )

    question_provider = FakeLLMProvider(
        [question_response],
        provider="fake-question-provider",
        usage=LLMUsage(input_tokens=20, output_tokens=10),
    )
    assert await worker(
        database,
        QuestionGenerationHandler(
            session_factory=database.sessionmaker,
            agent=QuestionGenerationAgent(
                question_provider,
                model="fake-question-model",
            ),
        ),
        "question-generation",
    ).process_one()

    async with database.sessionmaker() as session:
        card = await session.scalar(
            select(QuestionCard).where(
                QuestionCard.source_agent_run_id == question_run.id
            )
        )
        assert card is not None
        frozen_context = await session.get(
            PracticeQuestionReferenceContext,
            card.id,
        )
        assert frozen_context is not None
        practice_session = PracticeSession(
            id=uuid4(),
            user_id=owner.id,
            target_role_id=role.id,
            language=card.language,
            version=2,
            status="active",
            initial_question_type=card.question_type,
            initial_difficulty=card.difficulty,
            source="personalized",
            prioritize_weaknesses=False,
            started_at=START,
            created_at=START,
            updated_at=START,
        )
        attempt = PracticeAttempt(
            id=uuid4(),
            user_id=owner.id,
            session_id=practice_session.id,
            attempt_number=1,
            question_type=card.question_type,
            difficulty=card.difficulty,
            status="answering",
            question_generation_run_id=question_run.id,
            question_card_id=card.id,
            created_at=START,
            updated_at=START,
        )
        session.add_all([practice_session, attempt])
        await session.commit()
        session_id = practice_session.id
        attempt_id = attempt.id
        card_id = card.id
        frozen_snapshot = frozen_context.frozen_context

    async with database.sessionmaker() as session:
        main_context = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
            clock=lambda: START,
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=session_id,
            expected_version=2,
            question_id=card_id,
            content="I led the rollout and reduced failures by 20 percent.",
        )
    assert main_context.attempt.status == "answering"
    main_answer_id = main_context.main_answer.id

    q1_provider = FakeLLMProvider(
        [
            {
                "action": "askFollowUp",
                "prompt": "What evidence supports follow-up 1?",
                "focus": "Attribution evidence",
                "answer_hints": ["Name the metric."],
                "answer_framework": ["Baseline", "Result"],
            }
        ],
        provider="fake-follow-up-provider",
    )
    assert await follow_up_worker(database, q1_provider).process_one()

    async with database.sessionmaker() as session:
        refreshed = await PracticeSessionService(
            session,
            clock=lambda: START,
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=3,
        )
        assert refreshed.attempt.status == "answeringFollowUp"
        assert refreshed.follow_up_question is not None
        assert refreshed.follow_up_question.order == 1
        q1_id = refreshed.follow_up_question.id

    return (
        owner.id,
        session_id,
        attempt_id,
        card_id,
        main_answer_id,
        q1_id,
        frozen_snapshot,
    )


def test_reference_answer_worker_persists_artifact_from_frozen_context() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, _, project_id = await seed_context(database)
                question_response = {
                    "prompt": "Explain how you designed the payment workflows.",
                    "question_type": "projectDeepDive",
                    "difficulty": "basic",
                    "assessed_capabilities": ["Technical decision-making"],
                    "recommended_materials": [
                        {
                            "type": "projectExperience",
                            "id": str(project_id),
                            "label": "Untrusted label",
                            "reason": "Relevant project evidence.",
                        }
                    ],
                    "answer_hints": ["Explain your personal contribution."],
                    "answer_framework": ["Context", "Decision", "Result"],
                    "follow_up_directions": ["Technical rationale"],
                    "scoring_focus": ["Evidence of personal contribution"],
                }
                async with database.sessionmaker() as session:
                    question_run = await QuestionGenerationService(
                        session,
                        llm_model="fake-question-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="reference-answer-question",
                    )

                question_provider = FakeLLMProvider(
                    [question_response],
                    provider="fake-question-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                question_handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(
                        question_provider,
                        model="fake-question-model",
                    ),
                )
                assert await worker(
                    database,
                    question_handler,
                    "question-generation",
                ).process_one()

                async with database.sessionmaker() as session:
                    card = await session.scalar(
                        select(QuestionCard).where(
                            QuestionCard.source_agent_run_id == question_run.id
                        )
                    )
                    assert card is not None
                    context = await session.get(
                        PracticeQuestionReferenceContext,
                        card.id,
                    )
                    assert context is not None
                    old_summary = context.frozen_context["targetRole"][
                        "rivaSummary"
                    ]
                    old_evidence = context.frozen_context["candidateEvidence"]
                    frozen_project = next(
                        evidence
                        for evidence in old_evidence
                        if evidence["id"] == str(project_id)
                    )
                    stored_question_run = await session.get(AgentRun, question_run.id)
                    assert stored_question_run is not None
                    assert stored_question_run.status is AgentRunStatus.SUCCEEDED

                    project = await session.get(
                        CareerProfileProjectExperience,
                        project_id,
                    )
                    analysis = await session.get(JobDescriptionAnalysis, role.id)
                    assert project is not None
                    assert analysis is not None
                    project.role = "CURRENT PROJECT ROLE MUST NOT BE USED"
                    project.responsibilities = [
                        "CURRENT PROJECT RESPONSIBILITY MUST NOT BE USED"
                    ]
                    project.achievements = [
                        "CURRENT PROJECT ACHIEVEMENT MUST NOT BE USED"
                    ]
                    analysis.riva_summary = "CURRENT JD MUST NOT BE USED"
                    await session.commit()

                    reference_run = await ReferenceAnswerGenerationService(
                        session,
                        llm_model="fake-reference-model",
                    ).enqueue_main_generation(
                        user_id=owner.id,
                        question_card_id=card.id,
                        idempotency_key=practice_main_reference_answer_idempotency_key(
                            card.id
                        ),
                    )

                reference_response = {
                    "targetType": "main",
                    "kind": "personalizedExample",
                    "answer": "A grounded reference answer.",
                    "keyPoints": [
                        "State the decision.",
                        "Explain the evidence.",
                    ],
                    "commonMistakes": ["Inventing a metric."],
                }
                reference_provider = FakeLLMProvider(
                    [reference_response],
                    provider="fake-reference-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                reference_handler = PracticeReferenceAnswerHandler(
                    session_factory=database.sessionmaker,
                    agent=PracticeReferenceAnswerAgent(
                        reference_provider,
                        model="fake-reference-model",
                    ),
                )
                assert await worker(
                    database,
                    reference_handler,
                    "reference-answer",
                ).process_one()

                assert reference_provider.calls
                rendered = reference_provider.calls[0].messages[-1].content
                assert old_summary in rendered
                assert "CURRENT JD MUST NOT BE USED" not in rendered
                assert frozen_project["name"] in rendered
                assert frozen_project["role"] in rendered
                assert frozen_project["responsibilities"][0] in rendered
                assert frozen_project["achievements"][0] in rendered
                assert frozen_project["skills"][0] in rendered
                assert (
                    "CURRENT PROJECT RESPONSIBILITY MUST NOT BE USED"
                    not in rendered
                )
                assert (
                    "CURRENT PROJECT ACHIEVEMENT MUST NOT BE USED"
                    not in rendered
                )
                assert "CURRENT PROJECT ROLE MUST NOT BE USED" not in rendered

                async with database.sessionmaker() as session:
                    stored_reference_run = await session.get(
                        AgentRun,
                        reference_run.id,
                    )
                    artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.source_agent_run_id
                            == reference_run.id
                        )
                    )
                    assert stored_reference_run is not None
                    assert stored_reference_run.status is AgentRunStatus.SUCCEEDED
                    assert artifact is not None
                    assert artifact.source_agent_run_id == reference_run.id
                    assert artifact.generated_at.tzinfo is not None
                    assert artifact.question_card_id == card.id
                    assert artifact.answer == reference_response["answer"]
                    assert artifact.key_points == reference_response["keyPoints"]
                    assert artifact.common_mistakes == reference_response[
                        "commonMistakes"
                    ]
                    assert stored_reference_run.result is not None
                    assert stored_reference_run.result["answer"] == artifact.answer
            finally:
                await database.reset()

    asyncio.run(run_test())


def assert_follow_up_reference_payload(
    run: AgentRun,
    *,
    user_id: UUID,
    question_card_id: UUID,
    attempt_id: UUID,
    main_answer_id: UUID,
    follow_up_question_id: UUID,
    frozen_context: dict[str, object],
    previous_follow_ups: list[dict[str, object]],
) -> PracticeFollowUpReferenceAnswerRunPayload:
    assert run.user_id == user_id
    assert run.agent_id == "practice-reference-answer-generator"
    assert run.status is AgentRunStatus.QUEUED
    assert run.payload["targetType"] == PracticeReferenceAnswerTargetType.FOLLOW_UP
    assert run.payload["questionCardId"] == str(question_card_id)
    assert run.payload["attemptId"] == str(attempt_id)
    assert run.payload["mainAnswerId"] == str(main_answer_id)
    assert run.payload["followUpQuestionId"] == str(follow_up_question_id)
    assert run.payload["previousFollowUps"] == previous_follow_ups
    assert run.payload["expectedKind"] == (
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT
    )
    assert run.payload["referenceContext"] == frozen_context

    payload = PracticeFollowUpReferenceAnswerRunPayload.model_validate(
        run.payload
    )
    assert payload.target_type == PracticeReferenceAnswerTargetType.FOLLOW_UP
    assert payload.question_card_id == question_card_id
    assert payload.attempt_id == attempt_id
    assert payload.main_answer_id == main_answer_id
    assert payload.follow_up_question_id == follow_up_question_id
    assert [
        item.model_dump(mode="json", by_alias=True)
        for item in payload.previous_follow_ups
    ] == previous_follow_ups
    assert payload.expected_kind == (
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT
    )
    assert (
        payload.reference_context.model_dump(mode="json", by_alias=True)
        == frozen_context
    )
    return payload


def assert_follow_up_artifact(
    artifact: PracticeReferenceAnswerArtifact,
    *,
    question_card_id: UUID,
    follow_up_question_id: UUID,
    source_agent_run_id: UUID,
) -> None:
    assert artifact.target_type == PracticeReferenceAnswerTargetType.FOLLOW_UP
    assert artifact.kind == PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT
    assert artifact.question_card_id == question_card_id
    assert artifact.follow_up_question_id == follow_up_question_id
    assert artifact.source_agent_run_id == source_agent_run_id
    assert artifact.addressed_gap
    assert artifact.generated_at.tzinfo is not None
    assert artifact.generated_at.utcoffset() is not None


def test_reference_answer_follow_up_q1_q2_lifecycle_and_lineage() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner_id,
                    session_id,
                    attempt_id,
                    card_id,
                    main_answer_id,
                    q1_id,
                    frozen_context,
                ) = await prepare_follow_up_question(database)

                async with database.sessionmaker() as session:
                    q1_run = await ReferenceAnswerGenerationService(
                        session,
                        llm_model="fake-reference-model",
                    ).enqueue_follow_up_generation(
                        user_id=owner_id,
                        question_card_id=card_id,
                        follow_up_question_id=q1_id,
                        idempotency_key=(
                            practice_follow_up_reference_answer_idempotency_key(
                                q1_id
                            )
                        ),
                    )
                    assert_follow_up_reference_payload(
                        q1_run,
                        user_id=owner_id,
                        question_card_id=card_id,
                        attempt_id=attempt_id,
                        main_answer_id=main_answer_id,
                        follow_up_question_id=q1_id,
                        frozen_context=frozen_context,
                        previous_follow_ups=[],
                    )

                q1_response = {
                    "targetType": "followUp",
                    "kind": "personalizedSupplement",
                    "addressedGap": "The answer needs measurable attribution.",
                    "answer": "Tie the decision to the measurable outcome.",
                    "keyPoints": [
                        "Name the baseline.",
                        "Connect the result to your action.",
                    ],
                    "commonMistakes": ["Claiming a team result as personal impact."],
                }
                q1_reference_provider = FakeLLMProvider(
                    [q1_response],
                    provider="fake-reference-provider",
                )
                assert await reference_answer_worker(
                    database,
                    q1_reference_provider,
                ).process_one()

                async with database.sessionmaker() as session:
                    stored_q1_run = await session.get(AgentRun, q1_run.id)
                    q1_artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.source_agent_run_id
                            == q1_run.id
                        )
                    )
                    assert stored_q1_run is not None
                    assert stored_q1_run.status is AgentRunStatus.SUCCEEDED
                    assert q1_artifact is not None
                    assert_follow_up_artifact(
                        q1_artifact,
                        question_card_id=card_id,
                        follow_up_question_id=q1_id,
                        source_agent_run_id=q1_run.id,
                    )
                    q1_output = PracticeFollowUpReferenceAnswerOutput.model_validate(
                        q1_response
                    )
                    replayed = await ReferenceAnswerGenerationService(
                        session
                    ).persist_success(stored_q1_run, q1_output)
                    q1_count = await session.scalar(
                        select(func.count())
                        .select_from(PracticeReferenceAnswerArtifact)
                        .where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == card_id,
                            PracticeReferenceAnswerArtifact.follow_up_question_id
                            == q1_id,
                        )
                    )
                    assert replayed == q1_output
                    assert q1_count == 1

                async with database.sessionmaker() as session:
                    submitted = await PracticeSessionService(
                        session,
                        llm_model="fake-follow-up-model",
                        clock=lambda: START,
                    ).submit_follow_up_answer(
                        user_id=owner_id,
                        session_id=session_id,
                        expected_version=4,
                        question_id=card_id,
                        follow_up_question_id=q1_id,
                        content="The deployment reduced checkout failures by 20 percent.",
                    )
                    assert submitted.attempt.status == "answering"
                    assert submitted.session.version == 5
                    follow_up_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner_id,
                                    AgentRun.agent_id == "follow-up-generator",
                                )
                            )
                        ).all()
                    )
                    assert any(
                        run.status is AgentRunStatus.QUEUED
                        and run.payload.get("nextFollowUpOrder") == 2
                        for run in follow_up_runs
                    )

                q2_response = {
                    "action": "askFollowUp",
                    "prompt": "What trade-off did you manage in follow-up 2?",
                    "focus": "Trade-off reasoning",
                    "answer_hints": ["Name the constraint."],
                    "answer_framework": ["Constraint", "Decision", "Outcome"],
                }
                q2_follow_up_provider = FakeLLMProvider(
                    [q2_response],
                    provider="fake-follow-up-provider",
                )
                assert await follow_up_worker(
                    database,
                    q2_follow_up_provider,
                ).process_one()

                async with database.sessionmaker() as session:
                    refreshed = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_follow_up_generation(
                        user_id=owner_id,
                        session_id=session_id,
                        expected_version=5,
                    )
                    assert refreshed.attempt.status == "answeringFollowUp"
                    assert refreshed.session.version == 6
                    assert refreshed.follow_up_question is not None
                    q2_id = refreshed.follow_up_question.id
                    q1_answer = await session.scalar(
                        select(PracticeAnswer).where(
                            PracticeAnswer.attempt_id == attempt_id,
                            PracticeAnswer.follow_up_question_id == q1_id,
                        )
                    )
                    assert q1_answer is not None
                    q2_run = await ReferenceAnswerGenerationService(
                        session,
                        llm_model="fake-reference-model",
                    ).enqueue_follow_up_generation(
                        user_id=owner_id,
                        question_card_id=card_id,
                        follow_up_question_id=q2_id,
                        idempotency_key=(
                            practice_follow_up_reference_answer_idempotency_key(
                                q2_id
                            )
                        ),
                    )
                    assert_follow_up_reference_payload(
                        q2_run,
                        user_id=owner_id,
                        question_card_id=card_id,
                        attempt_id=attempt_id,
                        main_answer_id=main_answer_id,
                        follow_up_question_id=q2_id,
                        frozen_context=frozen_context,
                        previous_follow_ups=[
                            {
                                "order": 1,
                                "questionId": str(q1_id),
                                "answerId": str(q1_answer.id),
                            }
                        ],
                    )

                q2_reference_response = {
                    "targetType": "followUp",
                    "kind": "personalizedSupplement",
                    "addressedGap": "The answer needs explicit trade-off reasoning.",
                    "answer": "State the constraint, explain the trade-off, and close with the outcome.",
                    "keyPoints": [
                        "Name the constraint.",
                        "Explain the decision and outcome.",
                    ],
                    "commonMistakes": ["Listing a trade-off without the decision."],
                }
                q2_reference_provider = FakeLLMProvider(
                    [q2_reference_response],
                    provider="fake-reference-provider",
                )
                assert await reference_answer_worker(
                    database,
                    q2_reference_provider,
                ).process_one()

                async with database.sessionmaker() as session:
                    stored_q2_run = await session.get(AgentRun, q2_run.id)
                    q1_artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.follow_up_question_id
                            == q1_id
                        )
                    )
                    q2_artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.follow_up_question_id
                            == q2_id
                        )
                    )
                    follow_up_artifacts = list(
                        (
                            await session.scalars(
                                select(PracticeReferenceAnswerArtifact).where(
                                    PracticeReferenceAnswerArtifact.question_card_id
                                    == card_id,
                                    PracticeReferenceAnswerArtifact.target_type
                                    == PracticeReferenceAnswerTargetType.FOLLOW_UP,
                                )
                            )
                        ).all()
                    )
                    assert q1_artifact is not None
                    assert q2_artifact is not None
                    assert stored_q2_run is not None
                    assert stored_q2_run.status is AgentRunStatus.SUCCEEDED
                    assert_follow_up_artifact(
                        q1_artifact,
                        question_card_id=card_id,
                        follow_up_question_id=q1_id,
                        source_agent_run_id=q1_run.id,
                    )
                    assert_follow_up_artifact(
                        q2_artifact,
                        question_card_id=card_id,
                        follow_up_question_id=q2_id,
                        source_agent_run_id=q2_run.id,
                    )
                    assert q1_artifact.id != q2_artifact.id
                    assert q1_artifact.source_agent_run_id != (
                        q2_artifact.source_agent_run_id
                    )
                    assert len(follow_up_artifacts) == 2
                    card_count = await session.scalar(
                        select(func.count())
                        .select_from(QuestionCard)
                        .where(QuestionCard.id == card_id)
                    )
                    assert card_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_reference_answer_worker_uses_enqueued_q1_context_after_progress() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    owner_id,
                    session_id,
                    attempt_id,
                    card_id,
                    main_answer_id,
                    q1_id,
                    frozen_context,
                ) = await prepare_follow_up_question(database)

                async with database.sessionmaker() as session:
                    q1_run = await ReferenceAnswerGenerationService(
                        session,
                        llm_model="fake-reference-model",
                    ).enqueue_follow_up_generation(
                        user_id=owner_id,
                        question_card_id=card_id,
                        follow_up_question_id=q1_id,
                        idempotency_key=(
                            practice_follow_up_reference_answer_idempotency_key(
                                q1_id
                            )
                        ),
                    )
                    assert_follow_up_reference_payload(
                        q1_run,
                        user_id=owner_id,
                        question_card_id=card_id,
                        attempt_id=attempt_id,
                        main_answer_id=main_answer_id,
                        follow_up_question_id=q1_id,
                        frozen_context=frozen_context,
                        previous_follow_ups=[],
                    )

                async with database.sessionmaker() as session:
                    submitted = await PracticeSessionService(
                        session,
                        llm_model="fake-follow-up-model",
                        clock=lambda: START,
                    ).submit_follow_up_answer(
                        user_id=owner_id,
                        session_id=session_id,
                        expected_version=4,
                        question_id=card_id,
                        follow_up_question_id=q1_id,
                        content="LATE Q1 ANSWER MUST NOT ENTER REFERENCE INPUT.",
                    )
                    assert submitted.attempt.status == "answering"
                    assert submitted.session.version == 5
                    follow_up_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner_id,
                                    AgentRun.agent_id == "follow-up-generator",
                                )
                            )
                        ).all()
                    )
                    assert any(
                        run.status is AgentRunStatus.QUEUED
                        and run.payload.get("nextFollowUpOrder") == 2
                        for run in follow_up_runs
                    )
                    submitted_answer = await session.scalar(
                        select(PracticeAnswer).where(
                            PracticeAnswer.attempt_id == attempt_id,
                            PracticeAnswer.follow_up_question_id == q1_id,
                        )
                    )
                    assert submitted_answer is not None

                reference_response = {
                    "targetType": "followUp",
                    "kind": "personalizedSupplement",
                    "addressedGap": "The answer needs measurable attribution.",
                    "answer": "Tie the decision to the measurable outcome.",
                    "keyPoints": [
                        "Name the baseline.",
                        "Connect the result to your action.",
                    ],
                    "commonMistakes": ["Claiming a team result as personal impact."],
                }
                reference_provider = FakeLLMProvider(
                    [reference_response],
                    provider="fake-reference-provider",
                )
                assert await reference_answer_worker(
                    database,
                    reference_provider,
                ).process_one()
                assert reference_provider.calls
                rendered = reference_provider.calls[0].messages[-1].content
                assert "I led the rollout and reduced failures by 20 percent." in rendered
                assert "What evidence supports follow-up 1?" in rendered
                assert "Attribution evidence" in rendered
                assert submitted_answer.content not in rendered

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, q1_run.id)
                    artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.source_agent_run_id
                            == q1_run.id
                        )
                    )
                    current_attempt = await session.get(PracticeAttempt, attempt_id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert artifact is not None
                    assert_follow_up_artifact(
                        artifact,
                        question_card_id=card_id,
                        follow_up_question_id=q1_id,
                        source_agent_run_id=q1_run.id,
                    )
                    assert current_attempt is not None
                    assert current_attempt.status == "answering"
                    artifact_count = await session.scalar(
                        select(func.count())
                        .select_from(PracticeReferenceAnswerArtifact)
                        .where(
                            PracticeReferenceAnswerArtifact.question_card_id
                            == card_id,
                            PracticeReferenceAnswerArtifact.target_type
                            == PracticeReferenceAnswerTargetType.FOLLOW_UP,
                        )
                    )
                    assert artifact_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
