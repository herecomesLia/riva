from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.practice_sessions import (
    PracticeFollowUpReferenceAnswerResponse,
    PracticeMainReferenceAnswerResponse,
    PracticeReferenceAnswerNotRequestedResponse,
)
from riva.schemas.training_records import (
    TargetedPracticeAttemptRecordResponse,
    TargetedPracticeFollowUpReferenceAnswerRequest,
    TargetedPracticeMainReferenceAnswerRequest,
    TargetedPracticeQuestionRecordResponse,
    TargetedPracticeReferenceAnswerRequest,
    TargetedPracticeSetupResponse,
    TargetedPracticeTrainingRecordDetailResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordKind,
    TrainingRecordReferenceAnswerResponse,
    TrainingRecordsOverviewResponse,
    TrainingRecordsPageResponse,
    TrainingRecordStatus,
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
    assert (
        detail([attempt(1)]).model_dump(mode="json", by_alias=True)["durationSeconds"]
        == 60
    )


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
    follow_up = TypeAdapter(PracticeFollowUpReferenceAnswerResponse).validate_python(
        {"status": "notRequested"}
    )
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


def test_training_record_overview_uses_wire_aliases() -> None:
    role_id = uuid4()
    overview = TrainingRecordsOverviewResponse(
        total_record_count=3,
        completed_record_count=1,
        total_duration_seconds=1200,
        answered_question_count=4,
        average_score=75.0,
        target_roles=[
            TrainingRecordTargetRoleResponse(
                id=role_id,
                title="Backend Engineer",
                company="Riva",
            )
        ],
        by_kind={
            "targetedPractice": {
                "recordCount": 3,
                "completedRecordCount": 1,
                "averageScore": 75.0,
            },
            "mockInterview": {
                "recordCount": 0,
                "completedRecordCount": 0,
                "averageScore": None,
            },
        },
    )

    payload = overview.model_dump(mode="json", by_alias=True)
    assert payload["totalRecordCount"] == 3
    assert payload["totalDurationSeconds"] == 1200
    assert payload["answeredQuestionCount"] == 4
    assert payload["targetRoles"][0]["id"] == str(role_id)
    assert payload["byKind"] == {
        "targetedPractice": {
            "recordCount": 3,
            "completedRecordCount": 1,
            "averageScore": 75.0,
        },
        "mockInterview": {
            "recordCount": 0,
            "completedRecordCount": 0,
            "averageScore": None,
        },
    }


def test_training_record_reference_answer_request_is_discriminated_and_camel_case() -> (
    None
):
    attempt_id = uuid4()
    follow_up_id = uuid4()

    main = TypeAdapter(TargetedPracticeReferenceAnswerRequest).validate_python(
        {
            "subject": "mainQuestion",
            "questionId": str(attempt_id),
        }
    )
    follow_up = TypeAdapter(TargetedPracticeReferenceAnswerRequest).validate_python(
        {
            "subject": "followUp",
            "questionId": str(attempt_id),
            "followUpId": str(follow_up_id),
        }
    )

    assert isinstance(main, TargetedPracticeMainReferenceAnswerRequest)
    assert main.question_id == attempt_id
    assert isinstance(follow_up, TargetedPracticeFollowUpReferenceAnswerRequest)
    assert follow_up.question_id == attempt_id
    assert follow_up.follow_up_id == follow_up_id


def test_training_record_reference_answer_request_rejects_wrong_shape() -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(TargetedPracticeReferenceAnswerRequest).validate_python(
            {
                "subject": "followUp",
                "questionId": str(uuid4()),
            }
        )

    with pytest.raises(ValidationError):
        TypeAdapter(TargetedPracticeReferenceAnswerRequest).validate_python(
            {
                "subject": "mainQuestion",
                "questionId": str(uuid4()),
                "followUpId": str(uuid4()),
            }
        )


def test_training_record_reference_answer_response_reuses_practice_union() -> None:
    record_id = uuid4()
    attempt_id = uuid4()
    response = TrainingRecordReferenceAnswerResponse.model_validate(
        {
            "target": {
                "kind": "targetedPractice",
                "recordId": str(record_id),
                "questionId": str(attempt_id),
                "subject": "mainQuestion",
            },
            "referenceAnswer": {"status": "generating"},
        }
    )

    assert response.target.question_id == attempt_id
    assert response.reference_answer.status == "generating"
    assert response.model_dump(mode="json", by_alias=True)["referenceAnswer"] == {
        "status": "generating",
        "content": None,
        "viewedBeforeSubmission": False,
    }


def test_training_record_reference_answer_contract_is_publicly_exported() -> None:
    from riva import schemas
    from riva.schemas import training_records

    names = (
        "TargetedPracticeMainReferenceAnswerRequest",
        "TargetedPracticeFollowUpReferenceAnswerRequest",
        "TargetedPracticeReferenceAnswerRequest",
        "TargetedPracticeMainReferenceAnswerTargetResponse",
        "TargetedPracticeFollowUpReferenceAnswerTargetResponse",
        "TargetedPracticeReferenceAnswerTargetResponse",
        "TrainingRecordReferenceAnswerResponse",
    )
    for name in names:
        assert getattr(schemas, name) is getattr(training_records, name)
