from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.practice_sessions import (
    PracticeReferenceAnswerNotRequestedResponse,
    PracticeFollowUpReferenceAnswerResponse,
    PracticeMainReferenceAnswerResponse,
)
from riva.schemas.training_records import (
    TargetedPracticeAttemptRecordResponse,
    TargetedPracticeQuestionRecordResponse,
    TargetedPracticeSetupResponse,
    TargetedPracticeTrainingRecordDetailResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordKind,
    TrainingRecordStatus,
    TrainingRecordsPageResponse,
    TrainingRecordTargetRoleResponse,
)


def question() -> TargetedPracticeQuestionRecordResponse:
    return TargetedPracticeQuestionRecordResponse(
        question_card_id=uuid4(),
        prompt="Tell me about a difficult decision.",
        question_type="behavioral",
        difficulty="basic",
        assessed_capabilities=["Ownership"],
        is_saved=False,
        is_marked_weak=True,
        reference_answer=PracticeReferenceAnswerNotRequestedResponse(
            status="notRequested"
        ),
    )


def attempt(number: int) -> TargetedPracticeAttemptRecordResponse:
    return TargetedPracticeAttemptRecordResponse(
        attempt_id=uuid4(),
        attempt_number=number,
        retry_of_attempt_id=None,
        completed_at=None,
        question=question(),
        main_answer=None,
        follow_ups=[],
        evaluation=None,
        review=None,
        recommendation=None,
    )


def detail(
    attempts: list[TargetedPracticeAttemptRecordResponse],
) -> TargetedPracticeTrainingRecordDetailResponse:
    return TargetedPracticeTrainingRecordDetailResponse(
        record_id=uuid4(),
        kind=TrainingRecordKind.TARGETED_PRACTICE,
        status=TrainingRecordStatus.ENDED_EARLY,
        language="zh-CN",
        started_at=datetime(2026, 8, 15, 9, 0, tzinfo=UTC),
        ended_at=datetime(2026, 8, 15, 9, 1, tzinfo=UTC),
        duration_seconds=60,
        target_role=TrainingRecordTargetRoleResponse(
            id=uuid4(),
            title="Backend Engineer",
            company=None,
        ),
        setup=TargetedPracticeSetupResponse(
            source="personalized",
            prioritize_weaknesses=False,
        ),
        attempts=attempts,
        exposed_weaknesses=[],
        recommendation=None,
    )


def test_training_record_enums_and_wire_aliases_are_exact() -> None:
    assert {item.value for item in TrainingRecordKind} == {
        "targetedPractice",
        "mockInterview",
    }
    assert {item.value for item in TrainingRecordStatus} == {
        "completed",
        "endedEarly",
        "partiallyCompleted",
    }
    assert detail([attempt(1)]).model_dump(mode="json", by_alias=True)[
        "durationSeconds"
    ] == 60


def test_training_record_timestamps_and_duration_are_validated() -> None:
    payload = detail([attempt(1)]).model_dump(mode="python")
    payload["started_at"] = datetime(2026, 8, 15, 9, 0)
    with pytest.raises(ValidationError):
        TargetedPracticeTrainingRecordDetailResponse(**payload)

    payload = detail([attempt(1)]).model_dump(mode="python")
    payload["duration_seconds"] = -1
    with pytest.raises(ValidationError):
        TargetedPracticeTrainingRecordDetailResponse(**payload)

    with pytest.raises(ValidationError):
        TargetedPracticeTrainingRecordDetailResponse(
            **detail([attempt(2)]).model_dump(mode="python")
        )


def test_unfinished_attempt_fields_are_nullable() -> None:
    parsed = detail([attempt(1)])
    unfinished = parsed.attempts[0]
    assert unfinished.completed_at is None
    assert unfinished.main_answer is None
    assert unfinished.follow_ups == []
    assert unfinished.evaluation is None
    assert unfinished.review is None
    assert unfinished.recommendation is None


def test_reference_answer_fields_use_the_real_discriminated_unions() -> None:
    main = TypeAdapter(PracticeMainReferenceAnswerResponse).validate_python(
        {"status": "unavailable"}
    )
    follow_up = TypeAdapter(
        PracticeFollowUpReferenceAnswerResponse
    ).validate_python({"status": "notRequested"})
    assert main.status == "unavailable"
    assert follow_up.status == "notRequested"


def test_training_record_models_forbid_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        TrainingRecordTargetRoleResponse(
            id=uuid4(),
            title="Backend Engineer",
            company="Riva",
            current_title="must not be accepted",
        )


def test_training_record_summary_and_page_use_wire_aliases() -> None:
    summary = TargetedPracticeTrainingRecordSummaryResponse(
        record_id=uuid4(),
        kind="targetedPractice",
        language="en",
        status="partiallyCompleted",
        started_at=datetime(2026, 8, 15, 9, 0, tzinfo=UTC),
        ended_at=datetime(2026, 8, 15, 9, 2, tzinfo=UTC),
        duration_seconds=120,
        target_role=TrainingRecordTargetRoleResponse(
            id=uuid4(),
            title="Backend Engineer",
            company="Riva",
        ),
        answered_question_count=1,
        total_question_count=2,
        overall_score=81.5,
        review_summary="Needs more evidence.",
        question_type="behavioral",
        difficulty="basic",
    )
    page = TrainingRecordsPageResponse(
        items=[summary],
        pagination={
            "page": 1,
            "pageSize": 10,
            "totalItems": 1,
            "totalPages": 1,
        },
    )

    payload = page.model_dump(mode="json", by_alias=True)
    assert payload["items"][0]["recordId"] == str(summary.record_id)
    assert payload["items"][0]["answeredQuestionCount"] == 1
    assert payload["pagination"] == {
        "page": 1,
        "pageSize": 10,
        "totalItems": 1,
        "totalPages": 1,
    }
