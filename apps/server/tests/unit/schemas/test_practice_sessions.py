from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.schemas.practice_sessions import (
    ContinuePracticeQuestionRequest,
    PracticeAttemptStatus,
    PracticeActiveSessionResponse,
    PracticeAnswerResponse,
    PracticeAnsweredFollowUpExchangeResponse,
    PracticeAnsweringFollowUpResponse,
    PracticeAnsweringResponse,
    PracticeEvaluatingResponse,
    PracticeEvaluationResponse,
    PracticeGeneratingFollowUpResponse,
    PracticeGeneratingQuestionResponse,
    PracticeAllAnsweredCompletionResponse,
    PracticeNoFollowUpRequiredCompletionResponse,
    PracticeQuestionResponse,
    PracticeReviewResponse,
    PracticeFollowUpQuestionResponse,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
    PracticeQuestionSource,
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
    PracticeSessionStatus,
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


def test_practice_session_selection_rejects_invalid_uuid_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(
            selection_payload(targetRoleId="not-a-uuid")
        )

    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(
            selection_payload(unexpectedField=True)
        )


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

    assert serialized == selection_payload(
        targetRoleId=str(selection.target_role_id)
    )
    assert restored == selection
    assert isinstance(restored.target_role_id, UUID)


def test_start_request_has_explicit_name_and_rejects_language() -> None:
    payload = selection_payload()
    request = StartPracticeSessionRequest.model_validate(payload)

    assert request.model_dump() == PracticeSessionSelection.model_validate(
        payload
    ).model_dump()
    with pytest.raises(ValidationError):
        StartPracticeSessionRequest.model_validate(
            {**payload, "language": "en"}
        )


def test_refresh_request_requires_positive_version_and_rejects_run_id() -> None:
    assert RefreshPracticeQuestionGenerationRequest.model_validate(
        {"version": 1}
    ).version == 1
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
        {"version": 5, "questionId": str(question_id), "questionType": "projectDeepDive"},
        {"version": 5, "questionId": str(question_id), "recommendation": "nextQuestion"},
        {"version": 5, "questionId": str(question_id), "focusAreas": ["evidence"]},
    ):
        with pytest.raises(ValidationError):
            ContinuePracticeQuestionRequest.model_validate(payload)


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


def test_submit_follow_up_answer_request_uses_camel_case_and_normalizes_content() -> None:
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
    request = RefreshPracticeFollowUpGenerationRequest.model_validate(
        {"version": 3}
    )

    assert request.model_dump(mode="json") == {"version": 3}
    with pytest.raises(ValidationError):
        RefreshPracticeFollowUpGenerationRequest.model_validate(
            {"version": 0}
        )
    with pytest.raises(ValidationError):
        RefreshPracticeFollowUpGenerationRequest.model_validate(
            {"version": 3, "attemptId": str(uuid4())}
        )


def test_refresh_evaluation_request_requires_positive_version_and_forbids_internal_fields() -> None:
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
                "createdAt": datetime(
                    2026, 8, 11, 12, 2, tzinfo=UTC
                ).isoformat(),
                "order": 1,
            },
            "answer": None,
        }
    if status == "evaluating":
        payload["followUpCompletion"] = {
            "status": "completed",
            "reason": "noFollowUpRequired",
        }
        payload["submittedAt"] = datetime(
            2026, 8, 11, 12, 3, tzinfo=UTC
        ).isoformat()
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
            "evaluatedAt": datetime(
                2026, 8, 11, 12, 3, tzinfo=UTC
            ).isoformat(),
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


def test_answered_follow_up_exchange_response_requires_answer_and_exact_status() -> None:
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


def test_public_follow_up_exchanges_reject_awaiting_items_and_more_than_two() -> None:
    payload = public_session_payload("evaluating")
    payload["followUpExchanges"] = [
        {
            "status": "awaitingAnswer",
            "question": public_session_payload("answeringFollowUp")[
                "currentFollowUp"
            ]["question"],
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


def test_answer_and_follow_up_question_public_projections_are_strict_and_aware() -> None:
    answer_payload = public_session_payload("generatingFollowUp")["mainAnswer"]
    question_payload = public_session_payload("answeringFollowUp")[
        "currentFollowUp"
    ]["question"]
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
        PracticeAnswerResponse.model_validate(
            {**answer_payload, "kind": "main"}
        )


def test_follow_up_public_response_rejects_naive_artifact_timestamps_and_history() -> None:
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
            "question": public_session_payload("answeringFollowUp")[
                "currentFollowUp"
            ]["question"],
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


def test_active_response_rejects_naive_timestamp_and_unknown_fields() -> None:
    payload = public_session_payload()
    payload["startedAt"] = "2026-08-11T12:00:00"
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)


def test_public_evaluation_response_is_strict_aware_and_hides_focus_assessments() -> None:
    payload = public_session_payload("review")["evaluation"]
    assert isinstance(payload, dict)
    evaluation = PracticeEvaluationResponse.model_validate(payload)

    assert evaluation.overall_score == 82
    assert len(evaluation.dimension_scores) == 4
    assert evaluation.evaluated_at.tzinfo is not None
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "overallScore": "82"}
        )
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "dimensionScores": [{"score": 82}] * 4}
        )
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "evaluatedAt": "2026-08-11T12:03:00"}
        )
    with pytest.raises(ValidationError):
        PracticeEvaluationResponse.model_validate(
            {**payload, "focusAssessments": []}
        )


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
        assert "nextQuestion" not in parsed.model_dump(mode="json", by_alias=True)[
            "review"
        ]["recommendation"]


def test_public_review_response_rejects_mixed_recommendation_union_and_missing_sections() -> None:
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
