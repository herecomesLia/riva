import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from riva.agents.evaluation import EvaluationGenerationService
from riva.agents.runtime.runs import AgentRunService
from riva.db.database import Database
from riva.models import (
    AgentRun,
    CompetencyEvidence,
    InterviewFollowUpQuestion,
    InterviewQuestion,
    InterviewReview,
    InterviewSession,
    InterviewTurnAssessment,
    PracticeEvaluation,
    User,
    UserCompetency,
)
from riva.schemas.evaluation import PracticeEvaluationOutput
from riva.schemas.interview_review import InterviewReviewOutput
from riva.schemas.interview_turn import InterviewTurnOutput
from riva.services.competency_ingestion import CompetencyIngestionService
from riva.services.interview_review import InterviewReviewService
from riva.services.interview_turn import InterviewTurnService
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_evaluation_generation import (
    enqueue as enqueue_evaluation,
)
from tests.integration.test_evaluation_generation import (
    evaluation_response,
    prepare_context,
)
from tests.integration.test_interview_completion_workflow import (
    _reach_candidate_questions,
    _review_output,
)
from tests.integration.test_interview_planning_workflow import (
    _app as interview_app,
)
from tests.integration.test_interview_planning_workflow import (
    _headers as interview_headers,
)
from tests.integration.test_interview_planning_workflow import (
    _planner_output,
    _start_and_begin,
)
from tests.integration.test_interview_planning_workflow import (
    _settings as interview_settings,
)
from tests.integration.test_interview_planning_workflow import (
    _worker as interview_worker,
)
from tests.integration.test_interview_turn_workflow import (
    _answer_request,
    _turn_output,
)
from tests.integration.test_interview_turn_workflow import (
    _seed as seed_interview_context,
)

pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 17, 10, tzinfo=UTC)


def _user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def _practice_context(user_id: UUID) -> tuple[object, object]:
    practice_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    attempt = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        question_type="behavioral",
        difficulty="basic",
    )
    return practice_session, attempt


def _practice_evaluation(attempt: object, *, unknown: bool = False) -> object:
    dimension = "unknownDimension" if unknown else "relevance"
    return SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        overall_score=80,
        dimension_scores=[
            {"dimension": dimension, "score": 75, "explanation": "Relevant."}
        ],
        evaluated_at=NOW,
    )


def _practice_review(attempt: object) -> object:
    return SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        highlights=["Clear ownership"],
        main_issues=["Needs evidence"],
        exposed_weaknesses=["Add a concrete result"],
        reviewed_at=NOW,
    )


def _interview_review(
    session_id: UUID,
    *,
    status: str,
    review: dict[str, object] | None,
) -> object:
    return SimpleNamespace(
        id=uuid4(),
        session_id=session_id,
        status=status,
        review=review,
        created_at=NOW,
    )


class _FailingCompetencyIngestion:
    async def ingest_practice_evaluation(self, **_kwargs: object) -> None:
        raise RuntimeError("injected competency ingestion failure")

    async def ingest_interview_turn(self, **_kwargs: object) -> None:
        raise RuntimeError("injected competency ingestion failure")

    async def ingest_interview_review(self, **_kwargs: object) -> None:
        raise RuntimeError("injected competency ingestion failure")


def test_practice_and_interview_ingestion_is_idempotent_and_atomic() -> None:
    database_url = get_integration_database_url()

    async def run() -> None:
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner_id = uuid4()
                other_id = uuid4()
                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            _user(owner_id, "workflow-owner"),
                            _user(other_id, "workflow-other"),
                        ]
                    )
                    await session.commit()

                practice_session, attempt = _practice_context(owner_id)
                evaluation = _practice_evaluation(attempt)
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    await ingestion.ingest_practice_evaluation(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_practice_evaluation(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 2

                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 2

                    with pytest.raises(ValueError, match="does not belong"):
                        await ingestion.ingest_practice_evaluation(
                            other_id,
                            practice_session,  # type: ignore[arg-type]
                            attempt,  # type: ignore[arg-type]
                            evaluation,  # type: ignore[arg-type]
                        )
                    await session.rollback()

                practice_review = _practice_review(attempt)
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_practice_review(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        practice_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert [item.signal_type for item in written] == [
                        "strength",
                        "weakness",
                    ]

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_practice_review(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        practice_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 2
                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 4

                interview_session = SimpleNamespace(id=uuid4(), user_id=owner_id)
                assessment = SimpleNamespace(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=uuid4(),
                    score=90,
                    decision="completeQuestion",
                    strengths=["Clear answer"],
                    issues=["Needs evidence"],
                    created_at=NOW,
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    await ingestion.ingest_interview_turn(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        assessment,  # type: ignore[arg-type]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_interview_turn(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        assessment,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 3

                complete_review = _interview_review(
                    interview_session.id,
                    status="complete",
                    review={
                        "overallScore": 87,
                        "dimensionScores": [
                            {
                                "dimension": dimension,
                                "score": 82,
                                "explanation": f"Evidence for {dimension}.",
                            }
                            for dimension in (
                                "relevance",
                                "structure",
                                "specificity",
                                "personalContribution",
                                "resultsAndEvidence",
                                "roleAlignment",
                                "communication",
                                "riskControl",
                            )
                        ],
                        "mainStrengths": ["Good framing"],
                        "exposedWeaknesses": ["Add a metric"],
                        "frequentIssues": ["Vague result"],
                        "riskPoints": ["Low specificity"],
                    },
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        complete_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(written) == 11

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        complete_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 11

                partial_review = _interview_review(
                    interview_session.id,
                    status="partial",
                    review={
                        "mainStrengths": ["Stayed focused"],
                        "exposedWeaknesses": ["Needs evidence"],
                        "frequentIssues": [],
                        "riskPoints": [],
                    },
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        partial_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert [item.signal_type for item in written] == [
                        "strength",
                        "weakness",
                    ]
                    assert all(item.score is None for item in written)

                unavailable_review = _interview_review(
                    interview_session.id,
                    status="unavailable",
                    review=None,
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    assert (
                        await ingestion.ingest_interview_review(
                            owner_id,
                            interview_session,  # type: ignore[arg-type]
                            unavailable_review,  # type: ignore[arg-type]
                        )
                        == []
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    with pytest.raises(
                        ValueError, match="unknown competency dimension"
                    ):
                        await ingestion.ingest_practice_evaluation(
                            owner_id,
                            practice_session,  # type: ignore[arg-type]
                            attempt,  # type: ignore[arg-type]
                            _practice_evaluation(attempt, unknown=True),  # type: ignore[arg-type]
                        )
                    await session.rollback()
                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 20

                async with database.sessionmaker() as session:
                    competencies = list(
                        (
                            await session.scalars(
                                select(UserCompetency).where(
                                    UserCompetency.user_id == owner_id
                                )
                            )
                        ).all()
                    )
                    assert {item.competency_key for item in competencies} == {
                        "answer_quality",
                        "relevance",
                        "structure",
                        "specificity",
                        "personal_contribution",
                        "results_and_evidence",
                        "role_alignment",
                        "communication",
                        "risk_control",
                    }
                    evidence_count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert evidence_count == 20
                    evidence = list(
                        (
                            await session.scalars(
                                select(CompetencyEvidence).where(
                                    CompetencyEvidence.user_id == owner_id
                                )
                            )
                        ).all()
                    )
                    practice_score = next(
                        item
                        for item in evidence
                        if item.source_entity_id == attempt.id
                        and item.signal_type == "score"
                    )
                    assert practice_score.source_session_id == practice_session.id
                    assert practice_score.source_entity_type == "practiceAttempt"
                    interview_score = next(
                        item
                        for item in evidence
                        if item.source_entity_id == assessment.id
                        and item.signal_type == "score"
                    )
                    assert interview_score.source_session_id == interview_session.id
                    assert interview_score.source_entity_type == "interviewTurn"
            finally:
                await database.drop_tables()

    asyncio.run(run())


def test_practice_evaluation_source_transaction_rolls_back_artifact_and_evidence() -> (
    None
):
    async def run() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = await prepare_context(
                    database,
                    "none",
                )
                run = await enqueue_evaluation(
                    database,
                    owner.id,
                    attempt.id,
                    "noFollowUpRequired",
                )

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="competency-rollback-practice",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed is not None
                    assert claimed.id == run.id

                    with pytest.raises(
                        RuntimeError,
                        match="injected competency ingestion failure",
                    ):
                        await EvaluationGenerationService(
                            session,
                            llm_model="fake-evaluation-model",
                            competency_ingestion_service_factory=(
                                lambda _session: _FailingCompetencyIngestion()
                            ),
                        ).persist_success(
                            claimed,
                            PracticeEvaluationOutput.model_validate(
                                evaluation_response(88)
                            ),
                        )

                    assert (
                        await session.scalar(
                            select(PracticeEvaluation).where(
                                PracticeEvaluation.attempt_id == attempt.id
                            )
                        )
                        is None
                    )
                    assert (
                        await session.scalar(
                            select(func.count())
                            .select_from(CompetencyEvidence)
                            .where(CompetencyEvidence.user_id == owner.id)
                        )
                        == 0
                    )
            finally:
                await database.reset()

    asyncio.run(run())


def test_interview_turn_source_transaction_rolls_back_all_follow_up_state() -> None:
    async def run() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner, role, _profile = await seed_interview_context(
                    database,
                    "competency-rollback-turn",
                )
                settings = interview_settings(database_url)
                provider = FakeLLMProvider(
                    [_planner_output(), _turn_output()],
                    provider="competency-rollback-turn-provider",
                )
                app = interview_app(database_url, owner)

                with TestClient(app) as client:
                    session_id, _opening, _generating = _start_and_begin(
                        client,
                        role.id,
                    )
                    assert await interview_worker(
                        database,
                        settings,
                        provider,
                    ).process_one()
                    question = await _one_interview_question(
                        database,
                        session_id,
                    )
                    submitted = _answer_request(
                        client,
                        session_id,
                        version=3,
                        question_id=question.id,
                    )
                    assert submitted.status_code == 202

                async with database.sessionmaker() as session:
                    queued = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-turn",
                        )
                    )
                    current = await session.get(InterviewSession, session_id)
                    assert queued is not None
                    assert current is not None
                    before_status = current.status
                    before_version = current.version

                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="competency-rollback-turn",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed is not None
                    assert claimed.id == queued.id

                    with pytest.raises(
                        RuntimeError,
                        match="injected competency ingestion failure",
                    ):
                        await InterviewTurnService(
                            session,
                            competency_ingestion_service_factory=(
                                lambda _session: _FailingCompetencyIngestion()
                            ),
                        ).persist_success(
                            claimed,
                            InterviewTurnOutput.model_validate(_turn_output()),
                        )

                    assert (
                        await session.scalar(
                            select(InterviewTurnAssessment).where(
                                InterviewTurnAssessment.session_id == session_id
                            )
                        )
                        is None
                    )
                    assert (
                        await session.scalar(
                            select(InterviewFollowUpQuestion).where(
                                InterviewFollowUpQuestion.session_id == session_id
                            )
                        )
                        is None
                    )
                    assert (
                        await session.scalar(
                            select(InterviewQuestion).where(
                                InterviewQuestion.session_id == session_id,
                                InterviewQuestion.order > 1,
                            )
                        )
                        is None
                    )
                    current = await session.get(InterviewSession, session_id)
                    assert current is not None
                    assert current.status == before_status == "generatingTurn"
                    assert current.version == before_version == 4
            finally:
                await database.reset()

    asyncio.run(run())


def test_interview_review_source_transaction_rolls_back_completion_state() -> None:
    async def run() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner, role, _profile = await seed_interview_context(
                    database,
                    "competency-rollback-review",
                )
                settings = interview_settings(database_url)
                provider = FakeLLMProvider(
                    [
                        _planner_output(2),
                        _turn_output("complete"),
                        _turn_output("complete"),
                    ],
                    provider="competency-rollback-review-provider",
                )
                app = interview_app(database_url, owner)

                with TestClient(app) as client:
                    session_id = await _reach_candidate_questions(
                        database,
                        settings,
                        client,
                        role.id,
                        provider,
                    )
                    finish = client.post(
                        f"/api/interview/sessions/{session_id}/finish",
                        json={"version": 7},
                        headers=interview_headers(),
                    )
                    assert finish.status_code == 202
                    assert finish.json()["session"]["status"] == ("generatingReview")

                async with database.sessionmaker() as session:
                    questions = list(
                        (
                            await session.scalars(
                                select(InterviewQuestion)
                                .where(InterviewQuestion.session_id == session_id)
                                .order_by(InterviewQuestion.order.asc())
                            )
                        ).all()
                    )
                    queued = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-review",
                        )
                    )
                    current = await session.get(InterviewSession, session_id)
                    assert queued is not None
                    assert current is not None
                    assert current.status == "generatingReview"
                    assert current.version == 8

                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="competency-rollback-review",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed is not None
                    assert claimed.id == queued.id

                    with pytest.raises(
                        RuntimeError,
                        match="injected competency ingestion failure",
                    ):
                        await InterviewReviewService(
                            session,
                            competency_ingestion_service_factory=(
                                lambda _session: _FailingCompetencyIngestion()
                            ),
                        ).persist_success(
                            claimed,
                            InterviewReviewOutput.model_validate(
                                _review_output([question.id for question in questions])
                            ),
                        )

                    assert (
                        await session.scalar(
                            select(InterviewReview).where(
                                InterviewReview.session_id == session_id
                            )
                        )
                        is None
                    )
                    current = await session.get(InterviewSession, session_id)
                    assert current is not None
                    assert current.status == "generatingReview"
                    assert current.version == 8
            finally:
                await database.reset()

    asyncio.run(run())


async def _one_interview_question(
    database: Database,
    session_id: UUID,
) -> InterviewQuestion:
    async with database.sessionmaker() as session:
        question = await session.scalar(
            select(InterviewQuestion).where(
                InterviewQuestion.session_id == session_id,
                InterviewQuestion.order == 1,
            )
        )
        assert question is not None
        return question
