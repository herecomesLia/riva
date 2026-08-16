import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpQuestion,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
)
from riva.schemas.practice_reference_answer import PracticeReferenceFrozenContext
from riva.services.practice_sessions import (
    PRACTICE_SESSION_NOT_FOUND,
    PracticeAnsweredFollowUpExchangeContext,
    PracticeCompletedSessionWorkflowContext,
    PracticeEndedEarlySessionWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionStateError,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
)
from riva.services.training_records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordService,
    TrainingRecordStateError,
)
from riva.schemas.training_records import TrainingRecordKind


NOW = datetime(2026, 8, 15, 9, 0, tzinfo=UTC)


def frozen_context(title: str = "Backend Engineer", company: str | None = "Riva"):
    return PracticeReferenceFrozenContext.model_validate(
        {
            "targetRole": {
                "title": title,
                "company": company,
                "rivaSummary": "Build reliable services.",
                "responsibilities": [],
                "qualificationRequirements": {
                    "education": [],
                    "graduationCohorts": [],
                    "majors": [],
                    "experience": [],
                    "languages": [],
                    "certifications": [],
                    "other": [],
                },
                "requiredSkills": {
                    "programmingLanguages": [],
                    "frameworksAndLibraries": [],
                    "platforms": [],
                    "tools": [],
                    "conceptsAndMethods": [],
                    "databasesAndMiddleware": [],
                    "other": [],
                },
                "businessDomains": [],
            },
            "candidateEvidence": [],
        }
    )


def card(owner_id: UUID, *, question_type: str = "behavioral") -> QuestionCard:
    return QuestionCard(
        id=uuid4(),
        user_id=owner_id,
        target_role_id=uuid4(),
        profile_id=uuid4(),
        source_agent_run_id=uuid4(),
        matching_analysis_run_id=uuid4(),
        language="en",
        question_type=question_type,
        difficulty="basic",
        prompt="Tell me about a difficult decision.",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=[],
        answer_framework=[],
        follow_up_directions=[],
        scoring_focus=[],
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        is_saved=True,
        is_marked_weak=True,
    )


def answer(attempt_id: UUID, *, order: int = 1, submitted_at: datetime = NOW):
    return PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt_id,
        kind="main" if order == 1 else "followUp",
        order=order,
        content=f"Answer {order}",
        follow_up_question_id=None,
        submitted_at=submitted_at,
    )


def practice_attempt(
    owner_id: UUID,
    session_id: UUID,
    question: QuestionCard,
    number: int,
    *,
    retry_of_attempt_id: UUID | None = None,
    status: str = "completed",
    completed_at: datetime | None = NOW + timedelta(minutes=5),
) -> PracticeAttempt:
    return PracticeAttempt(
        id=uuid4(),
        user_id=owner_id,
        session_id=session_id,
        attempt_number=number,
        question_type=question.question_type,
        difficulty=question.difficulty,
        status=status,
        question_generation_run_id=uuid4(),
        question_card_id=question.id,
        retry_of_attempt_id=retry_of_attempt_id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=completed_at,
    )


def evaluation(attempt_id: UUID) -> PracticeEvaluation:
    return PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=uuid4(),
        overall_score=82,
        dimension_scores=[
            {
                "dimension": "relevance",
                "score": 82,
                "explanation": "Relevant.",
            },
            {
                "dimension": "structure",
                "score": 82,
                "explanation": "Structured.",
            },
            {
                "dimension": "specificity",
                "score": 82,
                "explanation": "Specific.",
            },
            {
                "dimension": "communication",
                "score": 82,
                "explanation": "Clear.",
            },
        ],
        focus_assessments=[],
        evaluated_at=NOW + timedelta(minutes=2),
    )


def review(attempt_id: UUID, weaknesses: list[str]) -> PracticeReview:
    return PracticeReview(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=uuid4(),
        overall_performance="A grounded response.",
        highlights=["Clear decision"],
        main_issues=["Add evidence"],
        improvement_suggestions=["Quantify impact"],
        reusable_answer_structure=["Context", "Decision", "Result"],
        exposed_weaknesses=weaknesses,
        reviewed_at=NOW + timedelta(minutes=3),
    )


def recommendation(attempt_id: UUID) -> PracticeRecommendation:
    return PracticeRecommendation(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=uuid4(),
        action="nextQuestion",
        reason="Continue with evidence.",
        next_question_type="technicalFoundation",
        next_difficulty="pressure",
        focus_areas=["Evidence"],
        recommended_at=NOW + timedelta(minutes=4),
    )


def review_context(
    session: PracticeSession,
    attempt: PracticeAttempt,
    question: QuestionCard,
    *,
    follow_up_completion_reason: str = "noFollowUpRequired",
    follow_up_exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...] = (),
    follow_up_question: PracticeFollowUpQuestion | None = None,
    evaluation_created_at: datetime = NOW + timedelta(minutes=1),
    weakness: list[str] | None = None,
) -> PracticeReviewWorkflowContext:
    return PracticeReviewWorkflowContext(
        session=session,
        attempt=attempt,
        question_card=question,
        main_answer=answer(attempt.id),
        follow_up_generation_run=SimpleNamespace(created_at=NOW),
        follow_up_decision=SimpleNamespace(action="complete"),
        follow_up_question=follow_up_question,
        follow_up_exchanges=follow_up_exchanges,
        follow_up_completion_reason=follow_up_completion_reason,
        evaluation_generation_run=SimpleNamespace(created_at=evaluation_created_at),
        evaluation=evaluation(attempt.id),
        review=review(attempt.id, weakness or []),
        review_generation_run=SimpleNamespace(created_at=NOW + timedelta(minutes=3)),
        recommendation_generation_run=SimpleNamespace(
            created_at=NOW + timedelta(minutes=4)
        ),
        recommendation=recommendation(attempt.id),
    )


class FakePracticeSessionService:
    def __init__(self, context: object):
        self.context = context

    async def get_session_context(self, **_: object) -> object:
        if isinstance(self.context, BaseException):
            raise self.context
        return self.context


class FakeReferenceAnswerService:
    def __init__(self, frozen: PracticeReferenceFrozenContext):
        self.frozen = frozen
        self.main_cutoffs: list[datetime | None] = []
        self.follow_up_cutoffs: list[datetime | None] = []

    async def get_question_reference_context(self, **_: object):
        return self.frozen

    async def get_main_generation_state(self, *, submitted_at, **_: object):
        self.main_cutoffs.append(submitted_at)
        return PracticeReferenceAnswerWorkflowState(
            status=PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            generation_run=None,
            artifact=None,
            output=None,
            viewed_before_submission=False,
        )

    async def get_follow_up_generation_state(self, *, submitted_at, **_: object):
        self.follow_up_cutoffs.append(submitted_at)
        return PracticeReferenceAnswerWorkflowState(
            status=PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            generation_run=None,
            artifact=None,
            output=None,
            viewed_before_submission=False,
        )


def service(context, reference: FakeReferenceAnswerService):
    return TrainingRecordService(
        object(),
        practice_service_factory=lambda _session: FakePracticeSessionService(
            context
        ),
        reference_answer_generation_service_factory=lambda _session: reference,
    )


class FakeListResult:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self):
        return iter(self.rows)


class FakeListSession:
    def __init__(self, rows: list[dict[str, object]], total_items: int) -> None:
        self.rows = rows
        self.total_items = total_items
        self.scalar_calls: list[object] = []
        self.execute_calls: list[object] = []

    async def scalar(self, statement: object) -> int:
        self.scalar_calls.append(statement)
        return self.total_items

    async def execute(self, statement: object) -> FakeListResult:
        self.execute_calls.append(statement)
        return FakeListResult(self.rows)


def test_list_training_records_projects_summary_and_rounds_average_score() -> None:
    record_id = uuid4()
    role_id = uuid4()
    started_at = NOW
    ended_at = NOW + timedelta(seconds=61, microseconds=900_000)
    fake_session = FakeListSession(
        rows=[
            {
                "record_id": record_id,
                "language": "en",
                "started_at": started_at,
                "ended_at": ended_at,
                "question_type": "behavioral",
                "difficulty": "basic",
                "target_role_id": role_id,
                "target_role_title": "Backend Engineer",
                "target_role_company": "Riva",
                "answered_question_count": 1,
                "total_question_count": 2,
                "overall_score": 81.25,
                "review_summary": "Needs more evidence.",
                "record_status": "partiallyCompleted",
            }
        ],
        total_items=3,
    )

    result = asyncio.run(
        TrainingRecordService(fake_session).list_training_records(
            user_id=uuid4(),
            page=2,
            page_size=2,
        )
    )

    assert result.items[0].record_id == record_id
    assert result.items[0].duration_seconds == 61
    assert result.items[0].overall_score == 81.3
    assert result.items[0].review_summary == "Needs more evidence."
    assert result.pagination.model_dump() == {
        "page": 2,
        "pageSize": 2,
        "totalItems": 3,
        "totalPages": 2,
    }
    assert len(fake_session.scalar_calls) == 1
    assert len(fake_session.execute_calls) == 1


def test_list_training_records_mock_only_filter_is_an_empty_page() -> None:
    fake_session = FakeListSession(rows=[], total_items=99)

    result = asyncio.run(
        TrainingRecordService(fake_session).list_training_records(
            user_id=uuid4(),
            kinds=[TrainingRecordKind.MOCK_INTERVIEW],
        )
    )

    assert result.items == []
    assert result.pagination.total_items == 0
    assert result.pagination.total_pages == 0
    assert fake_session.scalar_calls == []
    assert fake_session.execute_calls == []


def completed_session(owner_id: UUID, session_id: UUID) -> PracticeSession:
    return PracticeSession(
        id=session_id,
        user_id=owner_id,
        target_role_id=uuid4(),
        language="en",
        version=7,
        status="completed",
        initial_question_type="behavioral",
        initial_difficulty="basic",
        source="personalized",
        prioritize_weaknesses=True,
        started_at=NOW,
        completed_at=NOW + timedelta(minutes=20),
        completion_reason="reviewCompleted",
        created_at=NOW,
        updated_at=NOW + timedelta(minutes=20),
    )


def test_completed_record_projects_attempt_order_retry_and_aggregates() -> None:
    owner_id = uuid4()
    session_id = uuid4()
    session = completed_session(owner_id, session_id)
    question = card(owner_id)
    question.target_role_id = session.target_role_id
    first = practice_attempt(owner_id, session_id, question, 1)
    second = practice_attempt(
        owner_id,
        session_id,
        question,
        2,
        retry_of_attempt_id=first.id,
        completed_at=NOW + timedelta(minutes=10),
    )
    contexts = (
        review_context(
            session,
            second,
            question,
            weakness=["shared", "weak-b"],
        ),
        review_context(
            session,
            first,
            question,
            weakness=["weak-a", "shared"],
        ),
    )
    context = PracticeCompletedSessionWorkflowContext(
        session=session,
        final_attempt=second,
        final_review_context=contexts[0],
        attempt_review_contexts=contexts,
    )
    reference = FakeReferenceAnswerService(frozen_context())

    result = asyncio.run(
        service(context, reference).get_targeted_practice_record(
            user_id=owner_id,
            record_id=session_id,
        )
    )

    assert result.record_id == session_id
    assert result.status == "completed"
    assert [item.attempt_number for item in result.attempts] == [1, 2]
    assert result.attempts[1].retry_of_attempt_id == first.id
    assert result.attempts[0].question.question_card_id == question.id
    assert result.exposed_weaknesses == ["weak-a", "shared", "weak-b"]
    assert result.recommendation is not None
    assert result.target_role.title == "Backend Engineer"
    assert result.target_role.company == "Riva"
    assert reference.main_cutoffs == [NOW, NOW]


def test_ended_early_pending_follow_up_uses_evaluation_run_cutoff() -> None:
    owner_id = uuid4()
    session_id = uuid4()
    session = completed_session(owner_id, session_id)
    question = card(owner_id)
    question.target_role_id = session.target_role_id
    attempt = practice_attempt(owner_id, session_id, question, 1)
    q1 = PracticeFollowUpQuestion(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=uuid4(),
        order=1,
        prompt="What was the trade-off?",
        focus="Trade-off",
        answer_hints=[],
        answer_framework=[],
        created_at=NOW + timedelta(seconds=1),
    )
    q2 = PracticeFollowUpQuestion(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=uuid4(),
        order=2,
        prompt="What changed afterward?",
        focus="Result",
        answer_hints=[],
        answer_framework=[],
        created_at=NOW + timedelta(seconds=3),
    )
    q1_answer = answer(
        attempt.id,
        order=2,
        submitted_at=NOW + timedelta(seconds=2),
    )
    q1_answer.follow_up_question_id = q1.id
    context = review_context(
        session,
        attempt,
        question,
        follow_up_completion_reason="endedEarly",
        follow_up_exchanges=(
            PracticeAnsweredFollowUpExchangeContext(q1, q1_answer),
        ),
        follow_up_question=q2,
        evaluation_created_at=NOW + timedelta(seconds=10),
    )
    completed = PracticeCompletedSessionWorkflowContext(
        session=session,
        final_attempt=attempt,
        final_review_context=context,
        attempt_review_contexts=(context,),
    )
    reference = FakeReferenceAnswerService(frozen_context())

    result = asyncio.run(
        service(completed, reference).get_targeted_practice_record(
            user_id=owner_id,
            record_id=session_id,
        )
    )

    assert [item.order for item in result.attempts[0].follow_ups] == [1, 2]
    assert result.attempts[0].follow_ups[1].answer is None
    assert reference.follow_up_cutoffs == [
        NOW + timedelta(seconds=2),
        NOW + timedelta(seconds=10),
    ]


def test_ended_early_without_reviewed_attempt_has_null_unfinished_artifacts() -> None:
    owner_id = uuid4()
    session_id = uuid4()
    session = completed_session(owner_id, session_id)
    session.completion_reason = "userEndedEarly"
    question = card(owner_id)
    question.target_role_id = session.target_role_id
    unfinished = practice_attempt(
        owner_id,
        session_id,
        question,
        1,
        status="endedEarly",
    )
    context = PracticeEndedEarlySessionWorkflowContext(
        session=session,
        unfinished_attempt=unfinished,
        question_context=SimpleNamespace(question_card=question),
        completed_attempt_review_contexts=(),
    )
    reference = FakeReferenceAnswerService(frozen_context())

    result = asyncio.run(
        service(context, reference).get_targeted_practice_record(
            user_id=owner_id,
            record_id=session_id,
        )
    )

    assert result.status == "endedEarly"
    assert result.attempts[0].completed_at is None
    assert result.attempts[0].main_answer is None
    assert result.attempts[0].evaluation is None
    assert result.attempts[0].review is None
    assert result.attempts[0].recommendation is None


@pytest.mark.parametrize(
    "context, expected",
    [
        (SimpleNamespace(), TRAINING_RECORD_NOT_FOUND),
        (
            PracticeSessionStateError(PRACTICE_SESSION_NOT_FOUND),
            TRAINING_RECORD_NOT_FOUND,
        ),
    ],
)
def test_active_or_missing_sessions_are_not_exposed_as_records(
    context, expected
) -> None:
    reference = FakeReferenceAnswerService(frozen_context())
    with pytest.raises(TrainingRecordStateError) as error:
        asyncio.run(
            service(context, reference).get_targeted_practice_record(
                user_id=uuid4(),
                record_id=uuid4(),
            )
        )
    assert error.value.code == expected


def test_structural_error_is_state_conflict() -> None:
    owner_id = uuid4()
    session_id = uuid4()
    session = completed_session(owner_id, session_id)
    question = card(owner_id)
    question.target_role_id = session.target_role_id
    attempt = practice_attempt(owner_id, session_id, question, 2)
    context = PracticeCompletedSessionWorkflowContext(
        session=session,
        final_attempt=attempt,
        final_review_context=SimpleNamespace(attempt=attempt),
        attempt_review_contexts=(SimpleNamespace(attempt=attempt),),
    )
    reference = FakeReferenceAnswerService(frozen_context())
    with pytest.raises(TrainingRecordStateError) as error:
        asyncio.run(
            service(context, reference).get_targeted_practice_record(
                user_id=owner_id,
                record_id=session_id,
            )
        )
    assert error.value.code == TRAINING_RECORD_STATE_CONFLICT
