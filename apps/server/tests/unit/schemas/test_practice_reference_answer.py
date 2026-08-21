from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerInput,
    PracticeFollowUpReferenceAnswerRunPayload,
    PracticeMainReferenceAnswerInput,
    PracticeMainReferenceAnswerRunPayload,
    PracticeReferenceAnswerInput,
    PracticeReferenceAnswerOutput,
    PracticeReferenceAnswerRunPayload,
    PracticeReferenceFrozenContext,
    PracticeReferenceQuestionContext,
)

MATERIAL_ID = UUID("11111111-1111-4111-8111-111111111111")
SECOND_MATERIAL_ID = UUID("22222222-2222-4222-8222-222222222222")


def role_payload() -> dict[str, object]:
    return {
        "title": "Backend Engineer",
        "company": "Riva",
        "rivaSummary": "Build reliable interview preparation products.",
        "responsibilities": ["Design service boundaries."],
        "qualificationRequirements": {
            "education": [],
            "graduationCohorts": [],
            "majors": [],
            "experience": ["Experience building backend services."],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        "requiredSkills": {
            "programmingLanguages": ["Python"],
            "frameworksAndLibraries": ["FastAPI"],
            "platforms": [],
            "tools": [],
            "conceptsAndMethods": ["API design"],
            "databasesAndMiddleware": ["PostgreSQL"],
            "other": [],
        },
        "businessDomains": ["Interview preparation"],
    }


def question_payload(
    *,
    question_type: str = "projectDeepDive",
    recommended_ids: list[UUID] | None = None,
) -> dict[str, object]:
    recommended_ids = (
        [MATERIAL_ID, MATERIAL_ID, SECOND_MATERIAL_ID]
        if recommended_ids is None
        else recommended_ids
    )
    return {
        "prompt": "How did you improve the payment workflow?",
        "questionType": question_type,
        "difficulty": "basic",
        "assessedCapabilities": ["Ownership"],
        "answerFramework": ["Context", "Decision", "Result"],
        "scoringFocus": ["Personal contribution", "Evidence"],
        "recommendedMaterialIds": [str(item) for item in recommended_ids],
    }


def work_evidence(*, evidence_id: UUID = MATERIAL_ID) -> dict[str, object]:
    return {
        "type": "workExperience",
        "id": str(evidence_id),
        "company": "Riva",
        "title": "Backend Engineer",
        "responsibilities": ["Designed the payment service boundary."],
        "achievements": ["Reduced payment failures."],
        "skills": ["Python", "FastAPI"],
    }


def project_evidence(
    *,
    evidence_id: UUID = SECOND_MATERIAL_ID,
) -> dict[str, object]:
    return {
        "type": "projectExperience",
        "id": str(evidence_id),
        "name": "Payment Platform",
        "role": "Technical owner",
        "responsibilities": ["Owned the rollout."],
        "achievements": ["Improved reliability."],
        "skills": ["PostgreSQL"],
    }


def main_payload(
    *,
    question_type: str = "projectDeepDive",
    expected_kind: str = "personalizedExample",
    evidence: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "targetType": "main",
        "interactionLanguage": "en",
        "expectedKind": expected_kind,
        "targetRole": role_payload(),
        "question": question_payload(question_type=question_type),
        "candidateEvidence": (
            [work_evidence(), project_evidence()] if evidence is None else evidence
        ),
    }


def follow_up_payload(
    *,
    question_type: str = "projectDeepDive",
    expected_kind: str = "personalizedSupplement",
    previous: list[dict[str, object]] | None = None,
    current_order: int = 1,
    evidence: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "targetType": "followUp",
        "interactionLanguage": "zh-CN",
        "expectedKind": expected_kind,
        "targetRole": role_payload(),
        "question": question_payload(question_type=question_type),
        "candidateEvidence": (
            [work_evidence(), project_evidence()] if evidence is None else evidence
        ),
        "mainAnswer": {"content": "我负责了服务边界和上线验证。"},
        "previousFollowUps": [] if previous is None else previous,
        "currentFollowUp": {
            "order": current_order,
            "prompt": "What evidence supports the result?",
            "focus": "Result attribution",
        },
    }


def output_payload(
    *,
    target_type: str = "main",
    kind: str = "personalizedExample",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "targetType": target_type,
        "kind": kind,
        "answer": "A grounded answer with a clear decision and supported result.",
        "keyPoints": ["It names the decision.", "It explains the evidence."],
        "commonMistakes": ["Claiming unsupported metrics."],
    }
    if target_type == "followUp":
        payload["addressedGap"] = "It adds the missing result attribution."
    return payload


def frozen_context_payload() -> dict[str, object]:
    return {
        "targetRole": role_payload(),
        "candidateEvidence": [],
    }


def parse_input(payload: dict[str, object]) -> object:
    return TypeAdapter(PracticeReferenceAnswerInput).validate_python(payload)


def parse_output(payload: dict[str, object]) -> object:
    return TypeAdapter(PracticeReferenceAnswerOutput).validate_python(payload)


def test_main_personalized_input_deduplicates_recommended_material_ids() -> None:
    parsed = PracticeMainReferenceAnswerInput.model_validate(main_payload())

    assert parsed.target_type == "main"
    assert parsed.expected_kind == "personalizedExample"
    assert parsed.question.recommended_material_ids == [
        MATERIAL_ID,
        SECOND_MATERIAL_ID,
    ]
    assert len(parsed.candidate_evidence) == 2


def test_main_technical_input_is_valid() -> None:
    parsed = PracticeMainReferenceAnswerInput.model_validate(
        main_payload(
            question_type="technicalFoundation",
            expected_kind="technicalReference",
        )
    )

    assert parsed.question.question_type.value == "technicalFoundation"
    assert parsed.expected_kind == "technicalReference"


def test_follow_up_personalized_input_with_q1_lineage_is_valid() -> None:
    parsed = PracticeFollowUpReferenceAnswerInput.model_validate(
        follow_up_payload(
            previous=[
                {
                    "order": 1,
                    "prompt": "What did you measure?",
                    "answer": "I compared the failure rate before and after.",
                }
            ],
            current_order=2,
        )
    )

    assert parsed.target_type == "followUp"
    assert parsed.current_follow_up.order == 2
    assert parsed.previous_follow_ups[0].order == 1


def test_follow_up_technical_input_is_valid() -> None:
    parsed = PracticeFollowUpReferenceAnswerInput.model_validate(
        follow_up_payload(
            question_type="technicalFoundation",
            expected_kind="technicalReference",
        )
    )

    assert parsed.expected_kind == "technicalReference"


@pytest.mark.parametrize(
    ("factory", "question_type", "expected_kind"),
    [
        (main_payload, "technicalFoundation", "personalizedExample"),
        (main_payload, "projectDeepDive", "technicalReference"),
        (follow_up_payload, "technicalFoundation", "personalizedSupplement"),
        (follow_up_payload, "projectDeepDive", "technicalReference"),
    ],
)
def test_expected_kind_must_match_question_type(
    factory: object,
    question_type: str,
    expected_kind: str,
) -> None:
    payload = factory(  # type: ignore[operator]
        question_type=question_type,
        expected_kind=expected_kind,
    )
    with pytest.raises(ValidationError, match="expected_kind"):
        (
            PracticeFollowUpReferenceAnswerInput.model_validate(payload)
            if factory is follow_up_payload
            else PracticeMainReferenceAnswerInput.model_validate(payload)
        )


def test_candidate_evidence_must_reference_selected_materials() -> None:
    payload = main_payload(evidence=[work_evidence(evidence_id=uuid4())])

    with pytest.raises(ValidationError, match="recommended materials"):
        PracticeMainReferenceAnswerInput.model_validate(payload)


def test_candidate_evidence_ids_must_not_repeat() -> None:
    duplicate = work_evidence()
    payload = main_payload(evidence=[duplicate, deepcopy(duplicate)])

    with pytest.raises(ValidationError, match="must be unique"):
        PracticeMainReferenceAnswerInput.model_validate(payload)


def test_candidate_evidence_can_be_empty() -> None:
    parsed = PracticeMainReferenceAnswerInput.model_validate(main_payload(evidence=[]))

    assert parsed.candidate_evidence == []


@pytest.mark.parametrize(
    "forbidden_field",
    ["mainAnswer", "previousFollowUps", "currentFollowUp"],
)
def test_main_input_forbids_follow_up_and_current_answer_context(
    forbidden_field: str,
) -> None:
    payload = main_payload()
    payload[forbidden_field] = {}

    with pytest.raises(ValidationError):
        PracticeMainReferenceAnswerInput.model_validate(payload)


@pytest.mark.parametrize(
    "evidence",
    [[work_evidence()], [project_evidence()], [work_evidence(), project_evidence()]],
)
def test_work_and_project_evidence_union_is_valid(
    evidence: list[dict[str, object]],
) -> None:
    parsed = PracticeMainReferenceAnswerInput.model_validate(
        main_payload(evidence=evidence)
    )

    assert [item.type for item in parsed.candidate_evidence] == [
        item["type"] for item in evidence
    ]


def test_follow_up_order_one_requires_no_previous_follow_ups() -> None:
    parsed = PracticeFollowUpReferenceAnswerInput.model_validate(follow_up_payload())

    assert parsed.current_follow_up.order == 1
    assert parsed.previous_follow_ups == []


def test_follow_up_order_gap_is_invalid() -> None:
    payload = follow_up_payload(
        previous=[
            {
                "order": 2,
                "prompt": "What did you measure?",
                "answer": "I compared the failure rate.",
            }
        ],
        current_order=2,
    )

    with pytest.raises(ValidationError, match="sequence"):
        PracticeFollowUpReferenceAnswerInput.model_validate(payload)


def test_follow_up_current_order_must_follow_previous_lineage() -> None:
    payload = follow_up_payload(
        previous=[
            {
                "order": 1,
                "prompt": "What did you measure?",
                "answer": "I compared the failure rate.",
            }
        ],
        current_order=1,
    )

    with pytest.raises(ValidationError, match="current_follow_up.order"):
        PracticeFollowUpReferenceAnswerInput.model_validate(payload)


def test_follow_up_cannot_exceed_maximum_lineage_length() -> None:
    previous = [
        {
            "order": order,
            "prompt": f"What did you measure {order}?",
            "answer": "I compared the failure rate.",
        }
        for order in (1, 2, 3)
    ]

    with pytest.raises(ValidationError):
        PracticeFollowUpReferenceAnswerInput.model_validate(
            follow_up_payload(previous=previous, current_order=2)
        )


def test_input_union_uses_target_type_discriminator() -> None:
    main = parse_input(main_payload())
    follow_up = parse_input(follow_up_payload())

    assert isinstance(main, PracticeMainReferenceAnswerInput)
    assert isinstance(follow_up, PracticeFollowUpReferenceAnswerInput)


@pytest.mark.parametrize(
    ("target_type", "kind"),
    [
        ("main", "personalizedExample"),
        ("main", "technicalReference"),
        ("followUp", "personalizedSupplement"),
        ("followUp", "technicalReference"),
    ],
)
def test_output_variants_are_valid(target_type: str, kind: str) -> None:
    parsed = parse_output(output_payload(target_type=target_type, kind=kind))

    assert parsed.target_type == target_type  # type: ignore[attr-defined]
    assert parsed.kind == kind  # type: ignore[attr-defined]


def test_main_output_cannot_contain_addressed_gap() -> None:
    payload = output_payload()
    payload["addressedGap"] = "Not valid for main."

    with pytest.raises(ValidationError):
        parse_output(payload)


def test_follow_up_output_requires_addressed_gap() -> None:
    payload = output_payload(
        target_type="followUp",
        kind="personalizedSupplement",
    )
    del payload["addressedGap"]

    with pytest.raises(ValidationError):
        parse_output(payload)


def test_frozen_context_forbids_extra_fields_and_round_trips_aliases() -> None:
    parsed = PracticeReferenceFrozenContext.model_validate(frozen_context_payload())

    assert parsed.candidate_evidence == []
    assert (
        parsed.model_dump(mode="json", by_alias=True)["targetRole"]["rivaSummary"]
        == role_payload()["rivaSummary"]
    )
    with pytest.raises(ValidationError):
        PracticeReferenceFrozenContext.model_validate(
            {**frozen_context_payload(), "untrusted": True}
        )


def test_main_reference_answer_run_payload_is_discriminated_and_frozen() -> None:
    payload = PracticeMainReferenceAnswerRunPayload.model_validate(
        {
            "targetType": "main",
            "questionCardId": str(uuid4()),
            "interactionLanguage": "en",
            "expectedKind": "personalizedExample",
            "referenceContext": frozen_context_payload(),
        }
    )

    parsed = TypeAdapter(PracticeReferenceAnswerRunPayload).validate_python(
        payload.model_dump(mode="json", by_alias=True)
    )
    assert isinstance(parsed, PracticeMainReferenceAnswerRunPayload)
    assert parsed.reference_context.target_role.title == "Backend Engineer"


@pytest.mark.parametrize(
    "previous",
    [
        [],
        [
            {
                "order": 1,
                "questionId": str(uuid4()),
                "answerId": str(uuid4()),
            }
        ],
    ],
)
def test_follow_up_reference_answer_run_payload_supports_q1_and_q2_lineage(
    previous: list[dict[str, object]],
) -> None:
    payload = PracticeFollowUpReferenceAnswerRunPayload.model_validate(
        {
            "targetType": "followUp",
            "questionCardId": str(uuid4()),
            "attemptId": str(uuid4()),
            "mainAnswerId": str(uuid4()),
            "followUpQuestionId": str(uuid4()),
            "previousFollowUps": previous,
            "interactionLanguage": "en",
            "expectedKind": "personalizedSupplement",
            "referenceContext": frozen_context_payload(),
        }
    )

    assert [item.order for item in payload.previous_follow_ups] == [
        item["order"] for item in previous
    ]


def test_follow_up_reference_answer_run_payload_rejects_lineage_gaps_and_extras() -> (
    None
):
    payload = {
        "targetType": "followUp",
        "questionCardId": str(uuid4()),
        "attemptId": str(uuid4()),
        "mainAnswerId": str(uuid4()),
        "followUpQuestionId": str(uuid4()),
        "previousFollowUps": [
            {
                "order": 2,
                "questionId": str(uuid4()),
                "answerId": str(uuid4()),
            }
        ],
        "interactionLanguage": "en",
        "expectedKind": "personalizedSupplement",
        "referenceContext": frozen_context_payload(),
    }
    with pytest.raises(ValidationError, match="sequence"):
        PracticeFollowUpReferenceAnswerRunPayload.model_validate(payload)

    payload["previousFollowUps"] = []
    payload["extra"] = True
    with pytest.raises(ValidationError):
        PracticeFollowUpReferenceAnswerRunPayload.model_validate(payload)


@pytest.mark.parametrize(
    ("target_type", "kind"),
    [
        ("main", "personalizedSupplement"),
        ("followUp", "personalizedExample"),
    ],
)
def test_output_kind_is_compatible_with_target_type(
    target_type: str,
    kind: str,
) -> None:
    with pytest.raises(ValidationError):
        parse_output(output_payload(target_type=target_type, kind=kind))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("keyPoints", ["Only one point"]),
        ("keyPoints", ["Point"] * 6),
        ("commonMistakes", []),
        ("commonMistakes", [f"Mistake {index}" for index in range(6)]),
        ("answer", "   "),
    ],
)
def test_output_content_constraints_are_enforced(
    field: str,
    value: object,
) -> None:
    payload = output_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        parse_output(payload)


@pytest.mark.parametrize("extra_field", ["generatedAt", "metadata"])
def test_output_rejects_artifacts_and_extra_fields(extra_field: str) -> None:
    payload = output_payload()
    payload[extra_field] = "not allowed"

    with pytest.raises(ValidationError):
        parse_output(payload)


def test_output_lists_strip_and_deduplicate_items() -> None:
    payload = output_payload()
    payload["keyPoints"] = [
        "  It names the decision. ",
        "It explains the evidence.",
        "It explains the evidence.",
    ]

    parsed = parse_output(payload)

    assert parsed.key_points == [  # type: ignore[attr-defined]
        "It names the decision.",
        "It explains the evidence.",
    ]


def test_all_models_forbid_extra_fields() -> None:
    payload = main_payload()
    payload["targetRole"] = {**role_payload(), "untrusted": "extra"}

    with pytest.raises(ValidationError):
        PracticeMainReferenceAnswerInput.model_validate(payload)


def test_question_context_rejects_extra_fields() -> None:
    payload = question_payload()
    payload["candidateEvidence"] = []
    payload["extra"] = "not allowed"

    with pytest.raises(ValidationError):
        PracticeReferenceQuestionContext.model_validate(payload)
