from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.practice_sessions import (
    CompletePracticeSessionRequest,
    ContinuePracticeQuestionRequest,
    EndPracticeFollowUpsRequest,
    EndPracticeSessionEarlyRequest,
    PracticeActiveSessionResponse,
    PracticeAllAnsweredCompletionResponse,
    PracticeAnsweredFollowUpExchangeResponse,
    PracticeAnsweringFollowUpResponse,
    PracticeAnsweringResponse,
    PracticeAnswerResponse,
    PracticeAttemptStatus,
    PracticeCompletedSessionResponse,
    PracticeEndedEarlyFollowUpCompletionResponse,
    PracticeEvaluatingResponse,
    PracticeEvaluationResponse,
    PracticeFollowUpQuestionResponse,
    PracticeFollowUpReferenceAnswerRequest,
    PracticeFollowUpReferenceAnswerResponse,
    PracticeGeneratingFollowUpResponse,
    PracticeGeneratingQuestionResponse,
    PracticeGuidanceNotRequestedResponse,
    PracticeGuidanceRevealedResponse,
    PracticeGuidanceUnavailableResponse,
    PracticeMainReferenceAnswerResponse,
    PracticeNoFollowUpRequiredCompletionResponse,
    PracticeQuestionReferenceAnswerRequest,
    PracticeQuestionResponse,
    PracticeQuestionSource,
    PracticeReviewResponse,
    PracticeSessionCompletionReason,
    PracticeSessionResponse,
    PracticeSessionSelection,
    PracticeSessionStatus,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    RetryPracticeQuestionRequest,
    RevealPracticeFollowUpGuidanceRequest,
    RevealPracticeQuestionGuidanceRequest,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)


def selection_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "targetRoleId": str(uuid4()),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "source": "personalized",
        "prioritizeWeaknesses": False,
    }
    payload.update(overrides)
    return payload


def test_practice_selection_enums_cover_the_public_contract() -> None:
    assert {item.value for item in PracticeQuestionSource} == {
        "personalized",
        "saved",
        "history",
    }
    assert {item.value for item in QuestionCardQuestionType} == {
        "projectDeepDive",
        "behavioral",
        "businessUnderstanding",
        "motivation",
        "technicalFoundation",
    }
    assert {item.value for item in QuestionCardDifficulty} == {"basic", "pressure"}


def test_reference_answer_request_contract_is_strict() -> None:
    question_id = str(uuid4())
    follow_up_question_id = str(uuid4())
    main = PracticeQuestionReferenceAnswerRequest.model_validate(
        {"version": 3, "questionId": question_id}
    )
    follow_up = PracticeFollowUpReferenceAnswerRequest.model_validate(
        {
            "version": 4,
            "questionId": question_id,
            "followUpQuestionId": follow_up_question_id,
        }
    )

    assert main.model_dump(mode="json", by_alias=True) == {
        "version": 3,
        "questionId": question_id,
    }
    assert follow_up.model_dump(mode="json", by_alias=True) == {
        "version": 4,
        "questionId": question_id,
        "followUpQuestionId": follow_up_question_id,
    }
    for request_type, payload in (
        (
            PracticeQuestionReferenceAnswerRequest,
            {"version": 3, "questionId": question_id},
        ),
        (
            PracticeFollowUpReferenceAnswerRequest,
            {
                "version": 4,
                "questionId": question_id,
                "followUpQuestionId": follow_up_question_id,
            },
        ),
    ):
        for invalid in (
            {**payload, "version": 0},
            {**payload, "targetType": "main"},
            {**payload, "expectedKind": "personalizedExample"},
            {**payload, "content": "internal"},
            {**payload, "runId": str(uuid4())},
        ):
            with pytest.raises(ValidationError):
                request_type.model_validate(invalid)


def test_reference_answer_public_unions_cover_four_states_and_content_variants() -> (
    None
):
    main_adapter = TypeAdapter(PracticeMainReferenceAnswerResponse)
    follow_up_adapter = TypeAdapter(PracticeFollowUpReferenceAnswerResponse)
    common = {
        "answer": "A grounded answer.",
        "keyPoints": ["State the decision.", "Connect the evidence."],
        "commonMistakes": ["Inventing a metric."],
        "generatedAt": "2026-08-14T09:30:00+00:00",
    }

    for state in (
        {"status": "notRequested", "content": None, "viewedBeforeSubmission": False},
        {"status": "generating", "content": None, "viewedBeforeSubmission": False},
        {"status": "unavailable", "content": None, "viewedBeforeSubmission": False},
        {
            "status": "revealed",
            "content": {**common, "kind": "personalizedExample"},
            "viewedBeforeSubmission": True,
        },
        {
            "status": "revealed",
            "content": {**common, "kind": "technicalReference"},
            "viewedBeforeSubmission": False,
        },
    ):
        parsed = main_adapter.validate_python(state)
        assert parsed.status == state["status"]
        if parsed.status == "revealed":
            assert parsed.content.kind == state["content"]["kind"]
            assert parsed.content.generated_at.tzinfo is not None

    for state in (
        {"status": "notRequested", "content": None, "viewedBeforeSubmission": False},
        {"status": "generating", "content": None, "viewedBeforeSubmission": False},
        {"status": "unavailable", "content": None, "viewedBeforeSubmission": False},
        {
            "status": "revealed",
            "content": {
                **common,
                "kind": "personalizedSupplement",
                "addressedGap": "Connect the decision to the result.",
            },
            "viewedBeforeSubmission": True,
        },
        {
            "status": "revealed",
            "content": {
                **common,
                "kind": "technicalReference",
                "addressedGap": "Name the relevant technical trade-off.",
            },
            "viewedBeforeSubmission": False,
        },
    ):
        parsed = follow_up_adapter.validate_python(state)
        assert parsed.status == state["status"]
        if parsed.status == "revealed":
            assert parsed.content.kind == state["content"]["kind"]
            assert parsed.content.generated_at.tzinfo is not None

    with pytest.raises(ValidationError):
        main_adapter.validate_python(
            {
                "status": "revealed",
                "content": {**common, "kind": "personalizedSupplement"},
                "viewedBeforeSubmission": True,
            }
        )
    with pytest.raises(ValidationError):
        follow_up_adapter.validate_python(
            {
                "status": "revealed",
                "content": {**common, "kind": "personalizedSupplement"},
                "viewedBeforeSubmission": True,
            }
        )
    with pytest.raises(ValidationError):
        main_adapter.validate_python(
            {
                "status": "revealed",
                "content": {
                    **common,
                    "kind": "personalizedExample",
                    "addressedGap": "Must not be present.",
                },
                "viewedBeforeSubmission": True,
            }
        )
    with pytest.raises(ValidationError):
        follow_up_adapter.validate_python(
            {
                "status": "revealed",
                "content": {**common, "kind": "personalizedSupplement"},
                "viewedBeforeSubmission": True,
            }
        )
    with pytest.raises(ValidationError):
        main_adapter.validate_python(
            {
                "status": "revealed",
                "content": {
                    **common,
                    "kind": "personalizedExample",
                    "generatedAt": "2026-08-14T09:30:00",
                },
                "viewedBeforeSubmission": True,
            }
        )

    for adapter in (main_adapter, follow_up_adapter):
        for invalid in (
            {"status": "generating", "content": [], "viewedBeforeSubmission": False},
            {"status": "unavailable", "content": None, "viewedBeforeSubmission": True},
            {
                "status": "notRequested",
                "content": None,
                "viewedBeforeSubmission": False,
                "runId": str(uuid4()),
            },
        ):
            with pytest.raises(ValidationError):
                adapter.validate_python(invalid)


def test_practice_lifecycle_enums_are_exact() -> None:
    assert {item.value for item in PracticeSessionStatus} == {
        "active",
        "completed",
    }
    assert {item.value for item in PracticeSessionCompletionReason} == {
        "reviewCompleted",
        "userEndedEarly",
    }
    assert {item.value for item in PracticeAttemptStatus} == {
        "generatingQuestion",
        "answering",
        "answeringFollowUp",
        "evaluating",
        "review",
        "completed",
        "endedEarly",
    }


@pytest.mark.parametrize(
    "question_type",
    [item.value for item in QuestionCardQuestionType],
)
@pytest.mark.parametrize("difficulty", [item.value for item in QuestionCardDifficulty])
@pytest.mark.parametrize(
    "source",
    [item.value for item in PracticeQuestionSource],
)
def test_practice_session_selection_accepts_all_selection_values(
    question_type: str,
    difficulty: str,
    source: str,
) -> None:
    selection = PracticeSessionSelection.model_validate(
        selection_payload(
            questionType=question_type,
            difficulty=difficulty,
            source=source,
        )
    )

    assert selection.question_type == question_type
    assert selection.difficulty == difficulty
    assert selection.source == source


def test_practice_session_selection_uses_camel_case_and_standard_uuid() -> None:
    role_id = uuid4()
    selection = PracticeSessionSelection.model_validate(
        selection_payload(targetRoleId=str(role_id))
    )

    assert selection.target_role_id == role_id
    assert set(selection.model_dump()) == {
        "targetRoleId",
        "questionType",
        "difficulty",
        "source",
        "prioritizeWeaknesses",
    }
    assert selection.model_dump(mode="json")["targetRoleId"] == str(role_id)


def completed_session_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "status": "completed",
        "sessionId": str(uuid4()),
        "language": "en",
        "version": 6,
        "selection": selection_payload(),
        "startedAt": "2026-08-11T12:00:00+00:00",
        "attemptId": str(uuid4()),
        "attemptNumber": 2,
        "completionReason": "reviewCompleted",
        "completedAt": "2026-08-11T12:10:00+00:00",
        "questionsCompleted": 1,
        "retryCount": 1,
        "savedQuestionCount": 1,
        "markedWeakQuestionCount": 0,
        "finalAttemptAverageScore": 85,
        "nextStepSuggestion": "Practice the final answer structure.",
        "unfinishedAttempt": None,
    }
    payload.update(overrides)
    return payload


def test_completed_session_request_and_response_are_strict() -> None:
    request = CompletePracticeSessionRequest.model_validate({"version": 5})
    assert request.version == 5

    with pytest.raises(ValidationError):
        CompletePracticeSessionRequest.model_validate(
            {"version": 5, "questionId": str(uuid4())}
        )
    with pytest.raises(ValidationError):
        CompletePracticeSessionRequest.model_validate({"version": 0})

    end_request = EndPracticeSessionEarlyRequest.model_validate(
        {"version": 5, "questionId": str(uuid4())}
    )
    assert end_request.version == 5
    with pytest.raises(ValidationError):
        EndPracticeSessionEarlyRequest.model_validate(
            {"version": 5, "questionId": str(uuid4()), "attemptId": str(uuid4())}
        )

    response = PracticeCompletedSessionResponse.model_validate(
        completed_session_payload()
    )
    assert response.completion_reason == "reviewCompleted"
    assert response.completed_at.tzinfo is not None
    assert (
        TypeAdapter(PracticeSessionResponse)
        .validate_python(completed_session_payload())
        .status
        == "completed"
    )


@pytest.mark.parametrize(
    "request_type, flag_name",
    [
        (SetPracticeQuestionSavedRequest, "isSaved"),
        (SetPracticeQuestionWeakRequest, "isMarkedWeak"),
    ],
)
def test_question_flag_requests_are_strict_and_forbid_other_session_fields(
    request_type,
    flag_name: str,
) -> None:
    question_id = str(uuid4())
    request = request_type.model_validate(
        {"version": 4, "questionId": question_id, flag_name: True}
    )

    assert request.version == 4
    assert request.question_id == UUID(question_id)
    assert request.model_dump(mode="json", by_alias=True) == {
        "version": 4,
        "questionId": question_id,
        flag_name: True,
    }

    for invalid in (
        {},
        {"version": 0, "questionId": question_id, flag_name: True},
        {"version": 4, "questionId": "not-a-uuid", flag_name: True},
        {"version": 4, "questionId": question_id, flag_name: 1},
        {"version": 4, "questionId": question_id, flag_name: "true"},
        {
            "version": 4,
            "questionId": question_id,
            flag_name: True,
            "attemptId": str(uuid4()),
        },
    ):
        with pytest.raises(ValidationError):
            request_type.model_validate(invalid)


def test_early_completed_response_requires_the_unfinished_attempt_contract() -> None:
    session_id = uuid4()
    attempt_id = uuid4()
    question_id = uuid4()
    selection = PracticeSessionSelection.model_validate(selection_payload())
    unfinished = {
        "attemptId": str(attempt_id),
        "attemptNumber": 2,
        "selection": selection.model_dump(mode="json"),
        "question": {
            "id": str(question_id),
            "prompt": "Tell me about the project.",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "assessedCapabilities": [],
            "recommendedMaterials": [],
            "isSaved": False,
            "isMarkedWeak": False,
        },
    }
    payload = completed_session_payload(
        sessionId=str(session_id),
        attemptId=str(attempt_id),
        attemptNumber=2,
        completionReason="userEndedEarly",
        questionsCompleted=0,
        retryCount=0,
        savedQuestionCount=0,
        markedWeakQuestionCount=0,
        finalAttemptAverageScore=0,
        nextStepSuggestion=None,
        selection=selection.model_dump(mode="json"),
        unfinishedAttempt=unfinished,
    )
    response = PracticeCompletedSessionResponse.model_validate(payload)
    assert response.completion_reason == "userEndedEarly"
    assert response.unfinished_attempt is not None
    assert response.unfinished_attempt.question.id == question_id

    with pytest.raises(ValidationError):
        PracticeCompletedSessionResponse.model_validate(
            {**payload, "attemptId": str(uuid4())}
        )


@pytest.mark.parametrize(
    "field, value",
    [
        ("completedAt", "2026-08-11T12:10:00"),
        ("completionReason", "userEndedEarly"),
        ("finalAttemptAverageScore", 85.5),
        ("finalAttemptAverageScore", "85"),
        ("savedQuestionCount", 2),
        ("sourceAgentRunId", str(uuid4())),
    ],
)
def test_completed_session_response_rejects_invalid_or_internal_fields(
    field: str,
    value: object,
) -> None:
    payload = completed_session_payload(**{field: value})
    with pytest.raises(ValidationError):
        PracticeCompletedSessionResponse.model_validate(payload)


def test_practice_session_selection_rejects_invalid_uuid_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(
            selection_payload(targetRoleId="not-a-uuid")
        )

    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(selection_payload(unexpectedField=True))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("questionType", "other"),
        ("difficulty", "advanced"),
        ("source", "template"),
    ],
)
def test_practice_session_selection_rejects_invalid_enum_values(
    field: str,
    value: str,
) -> None:
    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(selection_payload(**{field: value}))


def test_practice_session_selection_round_trips_through_json() -> None:
    selection = PracticeSessionSelection.model_validate(selection_payload())
    serialized = selection.model_dump(mode="json")
    restored = PracticeSessionSelection.model_validate(serialized)

    assert serialized == selection_payload(targetRoleId=str(selection.target_role_id))
    assert restored == selection
    assert isinstance(restored.target_role_id, UUID)


def test_start_request_has_explicit_name_and_rejects_language() -> None:
    payload = selection_payload()
    request = StartPracticeSessionRequest.model_validate(payload)

    assert (
        request.model_dump()
        == PracticeSessionSelection.model_validate(payload).model_dump()
    )
    with pytest.raises(ValidationError):
        StartPracticeSessionRequest.model_validate({**payload, "language": "en"})


def test_refresh_request_requires_positive_version_and_rejects_run_id() -> None:
    assert (
        RefreshPracticeQuestionGenerationRequest.model_validate({"version": 1}).version
        == 1
    )
    with pytest.raises(ValidationError):
        RefreshPracticeQuestionGenerationRequest.model_validate({"version": 0})
    with pytest.raises(ValidationError):
        RefreshPracticeQuestionGenerationRequest.model_validate(
            {"version": 1, "runId": str(uuid4())}
        )


def test_continue_question_request_uses_only_public_provenance() -> None:
    question_id = uuid4()
    request = ContinuePracticeQuestionRequest.model_validate(
        {"version": 5, "questionId": str(question_id)}
    )

    assert request.version == 5
    assert request.question_id == question_id
    assert request.model_dump(mode="json") == {
        "version": 5,
        "questionId": str(question_id),
    }

    for payload in (
        {"questionId": str(question_id)},
        {"version": 0, "questionId": str(question_id)},
        {"version": 5, "questionId": "not-a-uuid"},
        {"version": 5, "questionId": str(question_id), "attemptId": str(uuid4())},
        {"version": 5, "questionId": str(question_id), "runId": str(uuid4())},
        {
            "version": 5,
            "questionId": str(question_id),
            "questionType": "projectDeepDive",
        },
        {
            "version": 5,
            "questionId": str(question_id),
            "recommendation": "nextQuestion",
        },
        {"version": 5, "questionId": str(question_id), "focusAreas": ["evidence"]},
    ):
        with pytest.raises(ValidationError):
            ContinuePracticeQuestionRequest.model_validate(payload)


def test_retry_question_request_uses_only_public_provenance() -> None:
    question_id = uuid4()
    request = RetryPracticeQuestionRequest.model_validate(
        {"version": 5, "questionId": str(question_id)}
    )

    assert request.version == 5
    assert request.question_id == question_id
    assert request.model_dump(mode="json") == {
        "version": 5,
        "questionId": str(question_id),
    }

    for payload in (
        {"questionId": str(question_id)},
        {"version": 0, "questionId": str(question_id)},
        {"version": 5, "questionId": "not-a-uuid"},
        {
            "version": 5,
            "questionId": str(question_id),
            "retryOfAttemptId": str(uuid4()),
        },
        {"version": 5, "questionId": str(question_id), "attemptId": str(uuid4())},
        {
            "version": 5,
            "questionId": str(question_id),
            "questionType": "projectDeepDive",
        },
    ):
        with pytest.raises(ValidationError):
            RetryPracticeQuestionRequest.model_validate(payload)


def test_submit_primary_answer_request_uses_camel_case_and_normalizes_content() -> None:
    question_id = uuid4()
    request = SubmitPrimaryAnswerRequest.model_validate(
        {
            "version": 2,
            "questionId": str(question_id),
            "content": "  My answer  ",
        }
    )

    assert request.version == 2
    assert request.question_id == question_id
    assert request.content == "My answer"
    assert request.model_dump(mode="json") == {
        "version": 2,
        "questionId": str(question_id),
        "content": "My answer",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"version": 0, "questionId": str(uuid4()), "content": "answer"},
        {"version": 1, "questionId": "not-a-uuid", "content": "answer"},
        {"version": 1, "questionId": str(uuid4()), "content": "   "},
        {
            "version": 1,
            "questionId": str(uuid4()),
            "content": "x" * 20_001,
        },
        {
            "version": 1,
            "questionId": str(uuid4()),
            "content": "answer",
            "language": "en",
        },
        {
            "version": 1,
            "questionId": str(uuid4()),
            "content": "answer",
            "runId": str(uuid4()),
        },
    ],
)
def test_submit_primary_answer_request_rejects_invalid_or_internal_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        SubmitPrimaryAnswerRequest.model_validate(payload)


def test_submit_follow_up_answer_request_uses_camel_case_and_normalizes_content() -> (
    None
):
    question_id = uuid4()
    follow_up_question_id = uuid4()
    request = SubmitFollowUpAnswerRequest.model_validate(
        {
            "version": 4,
            "questionId": str(question_id),
            "followUpQuestionId": str(follow_up_question_id),
            "content": "  Follow-up answer  ",
        }
    )

    assert request.version == 4
    assert request.question_id == question_id
    assert request.follow_up_question_id == follow_up_question_id
    assert request.content == "Follow-up answer"
    assert request.model_dump(mode="json") == {
        "version": 4,
        "questionId": str(question_id),
        "followUpQuestionId": str(follow_up_question_id),
        "content": "Follow-up answer",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {
            "version": 0,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "answer",
        },
        {
            "version": 4,
            "questionId": "not-a-uuid",
            "followUpQuestionId": str(uuid4()),
            "content": "answer",
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": "not-a-uuid",
            "content": "answer",
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "   ",
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "x" * 20_001,
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "answer",
            "order": 1,
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "answer",
            "attemptId": str(uuid4()),
        },
        {
            "version": 4,
            "questionId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "content": "answer",
            "completionReason": "allAnswered",
        },
    ],
)
def test_submit_follow_up_answer_request_rejects_invalid_or_internal_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        SubmitFollowUpAnswerRequest.model_validate(payload)


def test_refresh_follow_up_request_requires_only_positive_version() -> None:
    request = RefreshPracticeFollowUpGenerationRequest.model_validate({"version": 3})

    assert request.model_dump(mode="json") == {"version": 3}
    with pytest.raises(ValidationError):
        RefreshPracticeFollowUpGenerationRequest.model_validate({"version": 0})
    with pytest.raises(ValidationError):
        RefreshPracticeFollowUpGenerationRequest.model_validate(
            {"version": 3, "attemptId": str(uuid4())}
        )


def test_end_follow_ups_request_uses_only_public_provenance_and_strict_aliases() -> (
    None
):
    question_id = uuid4()
    follow_up_question_id = uuid4()
    request = EndPracticeFollowUpsRequest.model_validate(
        {
            "version": 4,
            "questionId": str(question_id),
            "followUpQuestionId": str(follow_up_question_id),
        }
    )

    assert request.version == 4
    assert request.question_id == question_id
    assert request.follow_up_question_id == follow_up_question_id
    assert request.model_dump(mode="json") == {
        "version": 4,
        "questionId": str(question_id),
        "followUpQuestionId": str(follow_up_question_id),
    }
    with pytest.raises(ValidationError):
        EndPracticeFollowUpsRequest.model_validate(
            {
                "version": 0,
                "questionId": str(question_id),
                "followUpQuestionId": str(follow_up_question_id),
            }
        )
    with pytest.raises(ValidationError):
        EndPracticeFollowUpsRequest.model_validate(
            {
                "version": 4,
                "questionId": "not-a-uuid",
                "followUpQuestionId": str(follow_up_question_id),
            }
        )
    with pytest.raises(ValidationError):
        EndPracticeFollowUpsRequest.model_validate(
            {
                "version": 4,
                "questionId": str(question_id),
                "followUpQuestionId": str(follow_up_question_id),
                "attemptId": str(uuid4()),
            }
        )


def test_refresh_evaluation_request_requires_positive_version_and_forbids_internal_fields() -> (
    None
):
    request = RefreshPracticeEvaluationRequest.model_validate({"version": 4})
    assert request.model_dump(mode="json") == {"version": 4}
    with pytest.raises(ValidationError):
        RefreshPracticeEvaluationRequest.model_validate({"version": 0})
    with pytest.raises(ValidationError):
        RefreshPracticeEvaluationRequest.model_validate(
            {"version": 4, "runId": str(uuid4())}
        )


def public_session_payload(status: str = "generatingQuestion") -> dict[str, object]:
    payload: dict[str, object] = {
        "status": status,
        "sessionId": str(uuid4()),
        "language": "en",
        "version": 1,
        "selection": selection_payload(),
        "startedAt": datetime(2026, 8, 11, 12, 0, tzinfo=UTC).isoformat(),
        "attemptId": str(uuid4()),
        "attemptNumber": 1,
    }
    if status in {
        "answering",
        "generatingFollowUp",
        "answeringFollowUp",
        "evaluating",
        "review",
    }:
        payload["question"] = {
            "id": str(uuid4()),
            "prompt": "Tell me about a project.",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "assessedCapabilities": ["Ownership"],
            "recommendedMaterials": [
                {
                    "type": "projectExperience",
                    "id": str(uuid4()),
                    "label": "Migration project",
                    "reason": "Relevant evidence",
                }
            ],
            "isSaved": False,
            "isMarkedWeak": True,
        }
    if status in {
        "generatingFollowUp",
        "answeringFollowUp",
        "evaluating",
        "review",
    }:
        payload["mainAnswer"] = {
            "id": str(uuid4()),
            "content": "My answer",
            "createdAt": datetime(2026, 8, 11, 12, 1, tzinfo=UTC).isoformat(),
            "order": 1,
        }
        payload["followUpExchanges"] = []
    if status == "answeringFollowUp":
        payload["currentFollowUp"] = {
            "status": "awaitingAnswer",
            "question": {
                "id": str(uuid4()),
                "prompt": "What metric changed?",
                "createdAt": datetime(2026, 8, 11, 12, 2, tzinfo=UTC).isoformat(),
                "order": 1,
            },
            "answer": None,
        }
    if status == "evaluating":
        payload["followUpCompletion"] = {
            "status": "completed",
            "reason": "noFollowUpRequired",
        }
        payload["submittedAt"] = datetime(2026, 8, 11, 12, 3, tzinfo=UTC).isoformat()
    if status == "review":
        payload["followUpCompletion"] = {
            "status": "completed",
            "reason": "noFollowUpRequired",
        }
        payload["evaluation"] = {
            "overallScore": 82,
            "dimensionScores": [
                {
                    "dimension": dimension,
                    "score": 82,
                    "explanation": f"Supports {dimension}.",
                }
                for dimension in (
                    "relevance",
                    "structure",
                    "specificity",
                    "communication",
                )
            ],
            "evaluatedAt": datetime(2026, 8, 11, 12, 3, tzinfo=UTC).isoformat(),
        }
        payload["review"] = {
            "overallPerformance": "Strong answer.",
            "highlights": ["Shows ownership."],
            "mainIssues": ["Attribution evidence is brief."],
            "improvementSuggestions": ["Name the baseline."],
            "reusableAnswerStructure": ["Context", "Evidence", "Result"],
            "exposedWeaknesses": ["Attribution evidence"],
            "recommendation": {
                "action": "retryCurrent",
                "reason": "Practice the current question again.",
            },
        }
    return payload


def answered_exchange_payload(
    *,
    question_order: int,
    answer_order: int,
) -> dict[str, object]:
    return {
        "status": "answered",
        "question": {
            "id": str(uuid4()),
            "prompt": f"What metric changed ({question_order})?",
            "createdAt": datetime(
                2026,
                8,
                11,
                12,
                2 + question_order,
                tzinfo=UTC,
            ).isoformat(),
            "order": question_order,
        },
        "answer": {
            "id": str(uuid4()),
            "content": f"The result was sustained ({question_order}).",
            "createdAt": datetime(
                2026,
                8,
                11,
                12,
                4 + question_order,
                tzinfo=UTC,
            ).isoformat(),
            "order": answer_order,
        },
    }


def test_answered_follow_up_exchange_response_requires_answer_and_exact_status() -> (
    None
):
    payload = answered_exchange_payload(question_order=1, answer_order=2)
    exchange = PracticeAnsweredFollowUpExchangeResponse.model_validate(payload)

    assert exchange.status == "answered"
    assert exchange.question.order == 1
    assert exchange.answer.order == 2

    with pytest.raises(ValidationError):
        PracticeAnsweredFollowUpExchangeResponse.model_validate(
            {**payload, "status": "awaitingAnswer"}
        )
    with pytest.raises(ValidationError):
        PracticeAnsweredFollowUpExchangeResponse.model_validate(
            {**payload, "answer": None}
        )
    with pytest.raises(ValidationError):
        PracticeAnsweredFollowUpExchangeResponse.model_validate(
            {
                **payload,
                "question": {
                    **payload["question"],  # type: ignore[index]
                    "order": 3,
                },
            }
        )


@pytest.mark.parametrize("status", ["generatingFollowUp", "answeringFollowUp"])
def test_public_follow_up_states_project_answered_exchanges_without_awaiting_items(
    status: str,
) -> None:
    payload = public_session_payload(status)
    payload["followUpExchanges"] = [
        answered_exchange_payload(question_order=1, answer_order=2)
    ]
    if status == "answeringFollowUp":
        current_follow_up = payload["currentFollowUp"]
        assert isinstance(current_follow_up, dict)
        current_follow_up["question"]["order"] = 2  # type: ignore[index]

    parsed = TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)
    assert len(parsed.follow_up_exchanges) == 1  # type: ignore[union-attr]
    assert parsed.follow_up_exchanges[0].status == "answered"  # type: ignore[union-attr]


@pytest.mark.parametrize("status", ["evaluating", "review"])
@pytest.mark.parametrize("exchange_count", [1, 2])
def test_public_all_answered_completion_accepts_one_or_two_exchanges(
    status: str,
    exchange_count: int,
) -> None:
    payload = public_session_payload(status)
    payload["followUpCompletion"] = {
        "status": "completed",
        "reason": "allAnswered",
    }
    payload["followUpExchanges"] = [
        answered_exchange_payload(
            question_order=order,
            answer_order=order + 1,
        )
        for order in range(1, exchange_count + 1)
    ]

    parsed = TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)
    assert parsed.follow_up_completion.reason == "allAnswered"  # type: ignore[union-attr]
    assert len(parsed.follow_up_exchanges) == exchange_count  # type: ignore[union-attr]


@pytest.mark.parametrize("status", ["evaluating", "review"])
@pytest.mark.parametrize("exchange_count", [0, 1])
def test_public_ended_early_completion_projects_the_unanswered_question(
    status: str,
    exchange_count: int,
) -> None:
    payload = public_session_payload(status)
    exchanges = (
        [answered_exchange_payload(question_order=1, answer_order=2)]
        if exchange_count
        else []
    )
    current_follow_up = public_session_payload("answeringFollowUp")["currentFollowUp"]
    assert isinstance(current_follow_up, dict)
    unanswered_question = current_follow_up["question"]
    assert isinstance(unanswered_question, dict)
    unanswered_question["order"] = exchange_count + 1
    payload["followUpExchanges"] = exchanges
    payload["followUpCompletion"] = {
        "status": "endedEarly",
        "unansweredQuestion": unanswered_question,
    }
    if status == "evaluating":
        payload["submittedAt"] = datetime(2026, 8, 11, 12, 3, tzinfo=UTC).isoformat()
    else:
        payload.update(
            {
                "evaluation": public_session_payload("review")["evaluation"],
                "review": public_session_payload("review")["review"],
            }
        )

    parsed = TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)
    assert parsed.follow_up_completion.status == "endedEarly"  # type: ignore[union-attr]
    assert parsed.follow_up_completion.unanswered_question.order == (  # type: ignore[union-attr]
        exchange_count + 1
    )
    assert len(parsed.follow_up_exchanges) == exchange_count  # type: ignore[union-attr]
    assert isinstance(
        PracticeEndedEarlyFollowUpCompletionResponse.model_validate(
            parsed.follow_up_completion.model_dump(mode="json")  # type: ignore[union-attr]
        ),
        PracticeEndedEarlyFollowUpCompletionResponse,
    )


@pytest.mark.parametrize("status", ["evaluating", "review"])
def test_public_ended_early_completion_rejects_invalid_snapshot(
    status: str,
) -> None:
    payload = public_session_payload(status)
    unanswered = public_session_payload("answeringFollowUp")["currentFollowUp"]
    assert isinstance(unanswered, dict)
    unanswered_question = unanswered["question"]
    assert isinstance(unanswered_question, dict)
    exchanges = [
        answered_exchange_payload(question_order=1, answer_order=2),
        answered_exchange_payload(question_order=2, answer_order=3),
    ]
    payload["followUpExchanges"] = exchanges
    payload["followUpCompletion"] = {
        "status": "endedEarly",
        "unansweredQuestion": {
            **unanswered_question,
            "order": 2,
        },
    }
    if status == "evaluating":
        payload["submittedAt"] = datetime(2026, 8, 11, 12, 3, tzinfo=UTC).isoformat()
    else:
        review_payload = public_session_payload("review")
        payload["evaluation"] = review_payload["evaluation"]
        payload["review"] = review_payload["review"]
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    one_exchange = answered_exchange_payload(question_order=1, answer_order=2)
    duplicate_question = one_exchange["question"]
    assert isinstance(duplicate_question, dict)
    payload["followUpExchanges"] = [one_exchange]
    payload["followUpCompletion"] = {
        "status": "endedEarly",
        "unansweredQuestion": {
            **unanswered_question,
            "id": duplicate_question["id"],
            "order": 2,
        },
    }
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)


def test_public_follow_up_exchanges_reject_awaiting_items_and_more_than_two() -> None:
    payload = public_session_payload("evaluating")
    payload["followUpExchanges"] = [
        {
            "status": "awaitingAnswer",
            "question": public_session_payload("answeringFollowUp")["currentFollowUp"][
                "question"
            ],
            "answer": None,
        }
    ]
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload("evaluating")
    payload["followUpExchanges"] = [
        answered_exchange_payload(question_order=order, answer_order=order + 1)
        for order in (1, 2, 3)
    ]
    payload["followUpCompletion"] = {
        "status": "completed",
        "reason": "allAnswered",
    }
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload("evaluating")
    payload["followUpCompletion"] = {
        "status": "completed",
        "reason": "endedEarly",
    }
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)


def test_active_response_union_exposes_only_supported_states() -> None:
    adapter = TypeAdapter(PracticeActiveSessionResponse)
    generating = adapter.validate_python(public_session_payload())
    answering = adapter.validate_python(public_session_payload("answering"))
    generating_follow_up = adapter.validate_python(
        public_session_payload("generatingFollowUp")
    )
    answering_follow_up = adapter.validate_python(
        public_session_payload("answeringFollowUp")
    )
    evaluating = adapter.validate_python(public_session_payload("evaluating"))

    assert isinstance(generating, PracticeGeneratingQuestionResponse)
    assert isinstance(answering, PracticeAnsweringResponse)
    assert isinstance(answering.question, PracticeQuestionResponse)
    assert isinstance(generating_follow_up, PracticeGeneratingFollowUpResponse)
    assert isinstance(answering_follow_up, PracticeAnsweringFollowUpResponse)
    assert isinstance(evaluating, PracticeEvaluatingResponse)
    assert generating_follow_up.follow_up_exchanges == []
    assert answering_follow_up.current_follow_up.answer is None
    assert answering_follow_up.current_follow_up.question.answer_hints.content is None
    assert evaluating.follow_up_completion.model_dump(mode="json") == {
        "status": "completed",
        "reason": "noFollowUpRequired",
    }
    review = adapter.validate_python(public_session_payload("review"))
    assert isinstance(review, PracticeReviewResponse)
    assert review.evaluation.overall_score == 82
    assert review.review.recommendation.action == "retryCurrent"


def test_answer_and_follow_up_question_public_projections_are_strict_and_aware() -> (
    None
):
    answer_payload = public_session_payload("generatingFollowUp")["mainAnswer"]
    question_payload = public_session_payload("answeringFollowUp")["currentFollowUp"][
        "question"
    ]
    assert isinstance(answer_payload, dict)
    assert isinstance(question_payload, dict)

    answer = PracticeAnswerResponse.model_validate(answer_payload)
    question = PracticeFollowUpQuestionResponse.model_validate(question_payload)

    assert answer.created_at.tzinfo is not None
    assert question.created_at.tzinfo is not None
    assert question.answer_hints.content is None
    assert question.answer_framework.content is None
    assert question.reference_answer.viewed_before_submission is False
    assert "templateId" not in question.model_dump(mode="json")
    for field in ("focus", "sourceAgentRunId", "attemptId", "templateId"):
        with pytest.raises(ValidationError):
            PracticeFollowUpQuestionResponse.model_validate(
                {**question_payload, field: "internal"}
            )
    with pytest.raises(ValidationError):
        PracticeAnswerResponse.model_validate({**answer_payload, "kind": "main"})


def test_follow_up_public_response_rejects_naive_artifact_timestamps_and_history() -> (
    None
):
    payload = public_session_payload("answeringFollowUp")
    current_follow_up = payload["currentFollowUp"]
    assert isinstance(current_follow_up, dict)
    question = current_follow_up["question"]
    assert isinstance(question, dict)
    question["createdAt"] = "2026-08-11T12:02:00"
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload("evaluating")
    payload["submittedAt"] = "2026-08-11T12:03:00"
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload("generatingFollowUp")
    payload["followUpExchanges"] = [
        {
            "status": "awaitingAnswer",
            "question": public_session_payload("answeringFollowUp")["currentFollowUp"][
                "question"
            ],
            "answer": None,
        }
    ]
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)


def test_question_projection_hides_internal_fields_and_defaults_guidance() -> None:
    payload = public_session_payload("answering")["question"]
    assert isinstance(payload, dict)
    payload["sourceAgentRunId"] = str(uuid4())
    with pytest.raises(ValidationError):
        PracticeQuestionResponse.model_validate(payload)

    payload.pop("sourceAgentRunId")
    question = PracticeQuestionResponse.model_validate(payload)
    serialized = question.model_dump(mode="json")
    assert serialized["recommendedMaterials"][0]["type"] == "projectExperience"
    assert serialized["answerHints"] == {
        "status": "notRequested",
        "content": None,
    }
    assert serialized["answerFramework"] == {
        "status": "notRequested",
        "content": None,
    }
    assert serialized["referenceAnswer"] == {
        "status": "notRequested",
        "content": None,
        "viewedBeforeSubmission": False,
    }
    assert "templateId" not in serialized
    assert "followUpDirections" not in serialized
    assert "scoringFocus" not in serialized


def test_practice_guidance_variants_are_strict_and_nonempty_when_revealed() -> None:
    assert PracticeGuidanceNotRequestedResponse(status="notRequested").model_dump(
        mode="json"
    ) == {
        "status": "notRequested",
        "content": None,
    }
    assert PracticeGuidanceRevealedResponse(
        status="revealed",
        content=["Context", "Action"],
    ).model_dump(mode="json") == {
        "status": "revealed",
        "content": ["Context", "Action"],
    }
    assert PracticeGuidanceUnavailableResponse(status="unavailable").model_dump(
        mode="json"
    ) == {
        "status": "unavailable",
        "content": None,
    }

    with pytest.raises(ValidationError):
        PracticeGuidanceRevealedResponse(status="revealed", content=[])
    with pytest.raises(ValidationError):
        PracticeGuidanceUnavailableResponse(
            status="unavailable",
            content=["not allowed"],
        )
    with pytest.raises(ValidationError):
        PracticeGuidanceNotRequestedResponse(
            status="notRequested",
            content=["not allowed"],
        )
    with pytest.raises(ValidationError):
        PracticeGuidanceRevealedResponse(
            status="revealed",
            content=["Context"],
            extra=True,
        )


def test_question_and_follow_up_responses_accept_all_guidance_states() -> None:
    question_payload = public_session_payload("answering")["question"]
    assert isinstance(question_payload, dict)
    question_payload["answerHints"] = {
        "status": "revealed",
        "content": ["Use a concrete metric."],
    }
    question_payload["answerFramework"] = {
        "status": "unavailable",
        "content": None,
    }
    question = PracticeQuestionResponse.model_validate(question_payload)
    assert question.answer_hints.status == "revealed"
    assert question.answer_framework.status == "unavailable"

    follow_up_payload = public_session_payload("answeringFollowUp")["currentFollowUp"][
        "question"
    ]
    assert isinstance(follow_up_payload, dict)
    follow_up_payload["answerHints"] = {
        "status": "revealed",
        "content": ["Name the metric."],
    }
    follow_up_payload["answerFramework"] = {
        "status": "unavailable",
        "content": None,
    }
    follow_up = PracticeFollowUpQuestionResponse.model_validate(follow_up_payload)
    assert follow_up.answer_hints.status == "revealed"
    assert follow_up.answer_framework.status == "unavailable"


def test_reveal_guidance_requests_use_only_public_provenance() -> None:
    question_id = uuid4()
    follow_up_question_id = uuid4()
    question_request = RevealPracticeQuestionGuidanceRequest.model_validate(
        {"version": 2, "questionId": str(question_id)}
    )
    follow_up_request = RevealPracticeFollowUpGuidanceRequest.model_validate(
        {
            "version": 4,
            "questionId": str(question_id),
            "followUpQuestionId": str(follow_up_question_id),
        }
    )
    assert question_request.model_dump(mode="json") == {
        "version": 2,
        "questionId": str(question_id),
    }
    assert follow_up_request.model_dump(mode="json") == {
        "version": 4,
        "questionId": str(question_id),
        "followUpQuestionId": str(follow_up_question_id),
    }

    for request_type, payload in (
        (
            RevealPracticeQuestionGuidanceRequest,
            {"version": 0, "questionId": str(question_id)},
        ),
        (
            RevealPracticeFollowUpGuidanceRequest,
            {
                "version": 4,
                "questionId": str(question_id),
                "followUpQuestionId": str(follow_up_question_id),
                "content": ["forbidden"],
            },
        ),
    ):
        with pytest.raises(ValidationError):
            request_type.model_validate(payload)


def test_active_response_rejects_naive_timestamp_and_unknown_fields() -> None:
    payload = public_session_payload()
    payload["startedAt"] = "2026-08-11T12:00:00"
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)


def test_public_evaluation_response_is_strict_aware_and_hides_focus_assessments() -> (
    None
):
    payload = public_session_payload("review")["evaluation"]
    assert isinstance(payload, dict)
    evaluation = PracticeEvaluationResponse.model_validate(payload)

    assert evaluation.overall_score == 82
    assert len(evaluation.dimension_scores) == 4
    assert evaluation.evaluated_at.tzinfo is not None
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate({**payload, "overallScore": "82"})
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "dimensionScores": [{"score": 82}] * 4}
        )
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "evaluatedAt": "2026-08-11T12:03:00"}
        )
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate({**payload, "focusAssessments": []})


@pytest.mark.parametrize("action", ["retryCurrent", "nextQuestion"])
def test_public_review_response_validates_both_recommendation_branches(
    action: str,
) -> None:
    payload = public_session_payload("review")
    review = payload["review"]
    assert isinstance(review, dict)
    recommendation = review["recommendation"]
    assert isinstance(recommendation, dict)
    if action == "nextQuestion":
        recommendation.update(
            {
                "action": action,
                "nextQuestion": {
                    "questionType": "projectDeepDive",
                    "difficulty": "basic",
                    "focusAreas": ["Attribution evidence"],
                },
            }
        )
    else:
        recommendation["action"] = action
    parsed = PracticeReviewResponse.model_validate(payload)
    assert parsed.review.recommendation.action == action
    if action == "nextQuestion":
        assert parsed.review.recommendation.next_question.focus_areas == [
            "Attribution evidence"
        ]
    else:
        assert (
            "nextQuestion"
            not in parsed.model_dump(mode="json", by_alias=True)["review"][
                "recommendation"
            ]
        )


def test_public_review_response_rejects_mixed_recommendation_union_and_missing_sections() -> (
    None
):
    payload = public_session_payload("review")
    review = payload["review"]
    assert isinstance(review, dict)
    recommendation = review["recommendation"]
    assert isinstance(recommendation, dict)
    recommendation["nextQuestion"] = {
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "focusAreas": [],
    }
    with pytest.raises(ValidationError):
        PracticeReviewResponse.model_validate(payload)

    payload = public_session_payload("review")
    payload.pop("evaluation")
    with pytest.raises(ValidationError):
        PracticeReviewResponse.model_validate(payload)

    payload = public_session_payload("review")
    payload.pop("review")
    with pytest.raises(ValidationError):
        PracticeReviewResponse.model_validate(payload)
