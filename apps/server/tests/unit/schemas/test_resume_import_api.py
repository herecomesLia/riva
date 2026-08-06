from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.resume_import_api import (
    ResumeImportApplicationRequest,
    ResumeImportDraftResponse,
)


NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)


def draft_payload(**overrides: object) -> dict[str, object]:
    skill_id = uuid4()
    payload: dict[str, object] = {
        "resumeDocumentId": uuid4(),
        "sourceRunId": uuid4(),
        "parsingResultVersion": 1,
        "draftVersion": 1,
        "status": "ready",
        "baseProfileId": None,
        "baseProfileVersion": None,
        "appliedProfileVersion": None,
        "appliedAt": None,
        "canApply": True,
        "summary": "Resume summary",
        "summaryAction": "set",
        "education": [],
        "workExperiences": [],
        "projectExperiences": [],
        "skills":[{"id": skill_id, "name": "Python"}],
        "unresolvedItems": [],
        "skippedItems": [],
        "protectedItems": [],
        "changeSummary": {
            "newItems": 1,
            "changedItems": 0,
            "missingItems": 0,
        },
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    payload.update(overrides)
    return payload


def test_ready_draft_is_strict_and_serializes_camel_case() -> None:
    draft = ResumeImportDraftResponse.model_validate(draft_payload())

    assert draft.status == "ready"
    assert draft.can_apply is True
    assert draft.model_dump(mode="json", by_alias=True)["draftVersion"] == 1


@pytest.mark.parametrize(
    ("status", "can_apply", "applied_profile_version", "applied_at"),
    [
        ("applied", False, 3, NOW),
        ("superseded", False, None, None),
    ],
)
def test_terminal_draft_states_validate(
    status: str,
    can_apply: bool,
    applied_profile_version: int | None,
    applied_at: datetime | None,
) -> None:
    draft = ResumeImportDraftResponse.model_validate(
        draft_payload(
            status=status,
            canApply=can_apply,
            appliedProfileVersion=applied_profile_version,
            appliedAt=applied_at,
        )
    )

    assert draft.status == status


def test_draft_rejects_extra_fields_and_invalid_request_fields() -> None:
    with pytest.raises(ValidationError):
        ResumeImportDraftResponse.model_validate(
            draft_payload(secret="raw resume text")
        )
    with pytest.raises(ValidationError):
        ResumeImportApplicationRequest.model_validate({"draftVersion": 0})
    with pytest.raises(ValidationError):
        ResumeImportApplicationRequest.model_validate(
            {"draftVersion": 1, "profile": {}}
        )


def test_draft_requires_consistent_state_and_timestamps() -> None:
    invalid_values = (
        draft_payload(baseProfileId=uuid4()),
        draft_payload(status="ready", canApply=False),
        draft_payload(status="applied", canApply=False),
        draft_payload(summary=None),
        draft_payload(summaryAction="none", summary="Unexpected"),
        draft_payload(
            createdAt=NOW,
            updatedAt=NOW - timedelta(seconds=1),
        ),
        draft_payload(createdAt=NOW.replace(tzinfo=None)),
    )

    for value in invalid_values:
        with pytest.raises(ValidationError):
            ResumeImportDraftResponse.model_validate(value)


def test_draft_contents_validate_ids_references_names_and_duplicates() -> None:
    duplicate_skill_id = uuid4()
    invalid_values = (
        draft_payload(
            skills=[
                {"id": duplicate_skill_id, "name": "Python"},
                {"id": duplicate_skill_id, "name": "Go"},
            ]
        ),
        draft_payload(
            skills=[{"id": uuid4(), "name": "Python"}],
            workExperiences=[
                {
                    "id": uuid4(),
                    "company": "Riva",
                    "title": "Engineer",
                    "employmentType": "fullTime",
                    "location": None,
                    "startDate": "2024-01",
                    "endDate": None,
                    "isCurrent": True,
                    "responsibilities": [],
                    "achievements": [],
                    "skillIds": [uuid4()],
                }
            ],
        ),
        draft_payload(
            skills=[
                {"id": uuid4(), "name": "Python"},
                {"id": uuid4(), "name": " python "},
            ]
        ),
        draft_payload(
            protectedItems=[
                {
                    "section": "workExperience",
                    "itemId": uuid4(),
                    "source": "userEdited",
                },
                {
                    "section": "workExperience",
                    "itemId": uuid4(),
                    "source": "userAdded",
                },
            ],
            skippedItems=[
                {
                    "section": "education",
                    "sourceIndex": 0,
                    "reasons": ["start_date_missing"],
                },
                {
                    "section": "education",
                    "sourceIndex": 0,
                    "reasons": ["end_date_missing"],
                },
            ],
        ),
    )

    for value in invalid_values:
        with pytest.raises(ValidationError):
            ResumeImportDraftResponse.model_validate(value)
