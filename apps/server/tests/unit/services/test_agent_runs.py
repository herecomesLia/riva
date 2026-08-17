import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from riva.schemas.job_description_parsing import JobDescriptionParsingRunPayload
from riva.schemas.matching_analysis import MatchingAnalysisRunPayload
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import (
    QuestionGenerationRunPayload,
    QuestionGenerationWeaknessEvidence,
)
from riva.schemas.resume_parsing import ResumeParsingRunPayload
from riva.schemas.practice_review import ReviewRunPayload
from riva.schemas.practice_reference_answer import (
    PracticeMainReferenceAnswerRunPayload,
)
from riva.schemas.interview_turn import InterviewTurnRunPayload
from riva.services.agent_runs import AgentRunService, _serialize_payload
from tests.unit.agents.test_interview_turn import turn_input


class ValidationSession:
    def __init__(self) -> None:
        self.rollback_count = 0

    async def rollback(self) -> None:
        self.rollback_count += 1


def enqueue(service: AgentRunService, payload: dict[str, object]):
    return service.enqueue(
        user_id=uuid4(),
        agent_id="test-agent",
        prompt_id="test-prompt",
        prompt_version="1",
        output_schema_id="test-output-v1",
        model="test-model",
        payload=payload,  # type: ignore[arg-type]
        idempotency_key="test-key",
        max_attempts=2,
        available_at=datetime(2026, 7, 30, tzinfo=UTC),
    )


def test_serialize_payload_accepts_approved_interaction_language_metadata() -> None:
    resume_document_id = uuid4()

    assert _serialize_payload(
        {
            "resumeDocumentId": resume_document_id,
            "interactionLanguage": "zh-CN",
        }
    ) == {
        "resumeDocumentId": str(resume_document_id),
        "interactionLanguage": "zh-CN",
    }


def test_serialize_payload_accepts_resource_snapshot_and_english_metadata() -> None:
    role_id = uuid4()

    assert _serialize_payload(
        {
            "roleId": role_id,
            "jobDescriptionVersion": 2,
            "interactionLanguage": "en",
        }
    ) == {
        "roleId": str(role_id),
        "jobDescriptionVersion": 2,
        "interactionLanguage": "en",
    }


def test_serialize_payload_accepts_question_generation_invocation_metadata() -> None:
    assert _serialize_payload(
        {
            "questionType": "technicalFoundation",
            "difficulty": "pressure",
        }
    ) == {
        "questionType": "technicalFoundation",
        "difficulty": "pressure",
    }


def test_serialize_payload_accepts_question_generation_weakness_focus() -> None:
    evidence = QuestionGenerationWeaknessEvidence(
        weakness="Ownership evidence",
        source_attempt_id=uuid4(),
        source_target_role_id=uuid4(),
        source_question_type=QuestionCardQuestionType.BEHAVIORAL,
        reviewed_at=datetime(2026, 8, 12, tzinfo=UTC),
    )

    assert _serialize_payload(
        {"weaknessFocus": [evidence.model_dump(mode="json", by_alias=True)]}
    ) == {
        "weaknessFocus": [evidence.model_dump(mode="json", by_alias=True)]
    }


@pytest.mark.parametrize("reason", ["noFollowUpRequired", "allAnswered"])
def test_serialize_payload_accepts_only_evaluation_completion_reason(
    reason: str,
) -> None:
    assert _serialize_payload(
        {"followUpCompletionReason": reason}
    ) == {"followUpCompletionReason": reason}


@pytest.mark.parametrize(
    "key",
    [
        "followUpCompletionReason",
        "completionReason",
        "evaluationMode",
        "rawAnswer",
        "answerText",
    ],
)
def test_serialize_payload_rejects_unapproved_evaluation_metadata(
    key: str,
) -> None:
    value = "unsupported" if key != "followUpCompletionReason" else "complete"

    with pytest.raises(ValueError):
        _serialize_payload({key: value})  # type: ignore[dict-item]


@pytest.mark.parametrize("order", [1, 2])
def test_serialize_payload_accepts_follow_up_order_metadata(order: int) -> None:
    assert _serialize_payload(
        {
            "attemptId": uuid4(),
            "questionCardId": uuid4(),
            "mainAnswerId": uuid4(),
            "interactionLanguage": "en",
            "nextFollowUpOrder": order,
            "previousFollowUpQuestionId": None,
            "previousFollowUpAnswerId": None,
        }
    )["nextFollowUpOrder"] == order


@pytest.mark.parametrize("order", [0, 3, True, "1"])
def test_serialize_payload_rejects_invalid_follow_up_order(order: object) -> None:
    with pytest.raises(ValueError):
        _serialize_payload(
            {"nextFollowUpOrder": order}  # type: ignore[dict-item]
        )


@pytest.mark.parametrize(
    "key",
    ["followUpSomething", "order", "rawAnswer", "prompt"],
)
def test_serialize_payload_does_not_widen_follow_up_metadata(key: str) -> None:
    with pytest.raises(ValueError):
        _serialize_payload({key: "private value"})  # type: ignore[dict-item]


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("questionType", "not-a-question-type"),
        ("difficulty", "not-a-difficulty"),
        ("questionType", "resumeParsing"),
        ("difficulty", "advanced"),
    ],
)
def test_serialize_payload_rejects_invalid_question_generation_metadata(
    key: str,
    value: str,
) -> None:
    with pytest.raises(ValueError):
        _serialize_payload({key: value})


def test_current_agent_payloads_are_accepted_after_alias_serialization() -> None:
    role_id = uuid4()
    profile_id = uuid4()
    resume_document_id = uuid4()
    payloads = [
        ResumeParsingRunPayload(
            resume_document_id=resume_document_id,
            interaction_language="zh-CN",
        ).model_dump(mode="json", by_alias=True),
        JobDescriptionParsingRunPayload(
            role_id=role_id,
            job_description_version=2,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
        MatchingAnalysisRunPayload(
            role_id=role_id,
            profile_id=profile_id,
            profile_version=3,
            job_description_version=2,
            job_description_analysis_version=1,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
    ]

    for payload in payloads:
        assert _serialize_payload(payload) == payload


def test_interview_turn_run_payload_is_accepted_after_alias_serialization() -> None:
    input = turn_input()
    payload = InterviewTurnRunPayload(
        session_id=input.session.id,
        session_version=input.session.version,
        session_state_version=input.session.version + 1,
        plan_id=input.plan_id,
        plan_revision=input.plan_revision,
        question_id=input.question_id,
        target_type="main",
        submitted_answer_id=input.main_answer.id,
        main_answer_id=input.main_answer.id,
        interaction_language=input.session.language,
        remaining_follow_up_slots=input.remaining_follow_up_slots,
        interview_turn_input=input,
    ).model_dump(mode="json", by_alias=True, exclude_none=True)

    serialized = _serialize_payload(payload)
    assert serialized == {
        **payload,
        "interviewTurnInput": input.model_dump(mode="json", by_alias=True),
    }


def test_review_run_payload_is_accepted_without_widening_metadata() -> None:
    payload = ReviewRunPayload(
        attempt_id=uuid4(),
        evaluation_id=uuid4(),
        interaction_language="en",
    ).model_dump(mode="json", by_alias=True)

    assert _serialize_payload(payload) == payload


def test_reference_answer_run_payload_preserves_structured_context() -> None:
    payload = PracticeMainReferenceAnswerRunPayload(
        targetType="main",
        questionCardId=uuid4(),
        interactionLanguage="en",
        expectedKind="personalizedExample",
        referenceContext={
            "targetRole": {
                "title": "Backend Engineer",
                "company": "Riva",
                "rivaSummary": "Build reliable APIs.",
                "responsibilities": ["Design service boundaries."],
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
                    "programmingLanguages": ["Python"],
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
        },
    ).model_dump(mode="json", by_alias=True)

    assert _serialize_payload(payload) == payload


@pytest.mark.parametrize(
    "key",
    ["targetType", "expectedKind", "referenceContext", "previousFollowUps"],
)
def test_serialize_payload_rejects_invalid_reference_answer_metadata(
    key: str,
) -> None:
    values: dict[str, object] = {
        "targetType": "unknown",
        "expectedKind": "unknown",
        "referenceContext": {"invalid": True},
        "previousFollowUps": [{"order": 2}],
    }

    with pytest.raises(ValueError):
        _serialize_payload({key: values[key]})  # type: ignore[dict-item]


def test_question_generation_run_payload_is_strict_and_camel_case() -> None:
    role_id = uuid4()
    profile_id = uuid4()
    matching_run_id = uuid4()
    payload = QuestionGenerationRunPayload(
        role_id=role_id,
        profile_id=profile_id,
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
        matching_analysis_run_id=matching_run_id,
        interaction_language="en",
        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        difficulty=QuestionCardDifficulty.PRESSURE,
    )

    assert payload.model_dump(mode="json", by_alias=True) == {
        "roleId": str(role_id),
        "profileId": str(profile_id),
        "profileVersion": 3,
        "jobDescriptionVersion": 2,
        "jobDescriptionAnalysisVersion": 4,
        "matchingAnalysisRunId": str(matching_run_id),
        "interactionLanguage": "en",
        "questionType": "projectDeepDive",
        "difficulty": "pressure",
        "weaknessFocus": [],
        "trainingMemory": {
            "version": "1",
            "focusCompetencies": [],
            "establishedCompetencies": [],
        },
    }

    with pytest.raises(ValueError):
        QuestionGenerationRunPayload.model_validate(
            {
                **payload.model_dump(mode="json", by_alias=True),
                "interactionLanguage": None,
            }
        )
    missing_language = payload.model_dump(mode="json", by_alias=True)
    missing_language.pop("interactionLanguage")
    with pytest.raises(ValueError):
        QuestionGenerationRunPayload.model_validate(missing_language)


@pytest.mark.parametrize("language", ["zh", "en-US", "fr", "", 1, True])
def test_serialize_payload_rejects_non_normalized_interaction_language(
    language: object,
) -> None:
    with pytest.raises(ValueError, match="supported interaction language"):
        _serialize_payload(
            {
                "resumeDocumentId": uuid4(),
                "interactionLanguage": language,  # type: ignore[dict-item]
            }
        )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"resumeText": "private resume content"},
        {"jobDescription": "private job description"},
        {"prompt": "private prompt"},
        {"resumeDocumentId": uuid4(), "arbitraryMetadata": "anything"},
        {"roleId": ["not", "an", "identifier"]},
        {"profileVersion": 0},
    ],
)
def test_enqueue_rejects_payload_that_is_not_resource_snapshot(
    payload: dict[str, object],
) -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError):
        asyncio.run(enqueue(service, payload))

    assert session.rollback_count == 1


def test_mark_failed_rejects_exception_messages_as_error_codes() -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="safe stable identifier"):
        asyncio.run(
            service.mark_failed(
                run_id=uuid4(),
                lease_token=uuid4(),
                error_code="Provider failed: private request contents",
                retryable=True,
                retry_delay=timedelta(seconds=1),
            )
        )

    assert session.rollback_count == 1


def test_requeue_expired_rejects_invalid_batch_size() -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="batch_size must be positive"):
        asyncio.run(service.requeue_expired(batch_size=0))

    assert session.rollback_count == 1
