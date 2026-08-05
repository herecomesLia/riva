from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.resume_imports import (
    ResumeImportDraftData,
    ResumeImportSkippedItem,
)


def minimal_data() -> dict[str, object]:
    return {
        "summary": None,
        "summary_action": "none",
        "education": [],
        "work_experiences": [],
        "project_experiences": [],
        "skills": [],
        "unresolved_items": [],
        "skipped_items": [],
        "protected_items": [],
        "change_summary": {
            "new_items": 0,
            "changed_items": 0,
            "missing_items": 0,
        },
    }


def test_minimal_and_complete_draft_data_are_valid() -> None:
    minimal = ResumeImportDraftData.model_validate(minimal_data())
    assert minimal.summary_action == "none"

    skill_id = uuid4()
    education_id = uuid4()
    complete = minimal_data()
    complete.update(
        {
            "summary": "Summary",
            "summary_action": "set",
            "skills": [{"id": skill_id, "name": "Python"}],
            "education": [
                {
                    "id": education_id,
                    "school": "Example University",
                    "degree": "BSc",
                    "major": "Computer Science",
                    "start_date": "2020-09",
                    "end_date": "2024-06",
                    "is_current": False,
                }
            ],
            "work_experiences": [
                {
                    "id": uuid4(),
                    "company": "Example",
                    "title": "Engineer",
                    "employment_type": "fullTime",
                    "location": None,
                    "start_date": "2024-07",
                    "end_date": None,
                    "is_current": True,
                    "responsibilities": ["Build APIs"],
                    "achievements": [],
                    "skill_ids": [skill_id],
                }
            ],
            "project_experiences": [
                {
                    "id": uuid4(),
                    "name": "Project",
                    "role": None,
                    "start_date": "2023-01",
                    "end_date": None,
                    "responsibilities": [],
                    "achievements": ["Shipped"],
                    "skill_ids": [skill_id],
                    "project_url": "https://example.com/project",
                }
            ],
            "unresolved_items": ["Check certification"],
            "skipped_items": [
                {
                    "section": "education",
                    "source_index": 2,
                    "reasons": [
                        "start_date_precision_insufficient",
                        "start_date_precision_insufficient",
                    ],
                }
            ],
            "protected_items": [
                {
                    "section": "skills",
                    "item_id": skill_id,
                    "source": "userAdded",
                }
            ],
            "change_summary": {
                "new_items": 3,
                "changed_items": 1,
                "missing_items": 2,
            },
        }
    )

    parsed = ResumeImportDraftData.model_validate(complete)
    assert parsed.skipped_items[0].reasons == [
        "start_date_precision_insufficient"
    ]
    assert parsed.work_experiences[0].skill_ids == [skill_id]


def test_draft_schema_is_strict_and_rejects_invalid_references() -> None:
    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate({**minimal_data(), "extra": True})

    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "change_summary": {
                    "new_items": -1,
                    "changed_items": 0,
                    "missing_items": 0,
                },
            }
        )

    with pytest.raises(ValidationError):
        ResumeImportSkippedItem(
            section="education",
            source_index=0,
            reasons=[],
        )

    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "work_experiences": [
                    {
                        "id": uuid4(),
                        "company": "Example",
                        "title": "Engineer",
                        "employment_type": "fullTime",
                        "location": None,
                        "start_date": "2024-01",
                        "end_date": None,
                        "is_current": True,
                        "responsibilities": [],
                        "achievements": [],
                        "skill_ids": [uuid4()],
                    }
                ],
            }
        )

    duplicate_skill_id = uuid4()
    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "skills": [
                    {"id": duplicate_skill_id, "name": "Python"},
                    {"id": uuid4(), "name": "python"},
                ],
            }
        )

    duplicate_id = uuid4()
    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "education": [
                    {
                        "id": duplicate_id,
                        "school": "A",
                        "degree": None,
                        "major": None,
                        "start_date": "2020-01",
                        "end_date": None,
                        "is_current": True,
                    },
                    {
                        "id": duplicate_id,
                        "school": "B",
                        "degree": None,
                        "major": None,
                        "start_date": "2021-01",
                        "end_date": None,
                        "is_current": True,
                    },
                ],
            }
        )

    protected_id = uuid4()
    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "protected_items": [
                    {
                        "section": "education",
                        "item_id": protected_id,
                        "source": "userEdited",
                    },
                    {
                        "section": "education",
                        "item_id": protected_id,
                        "source": "userAdded",
                    },
                ],
            }
        )

    with pytest.raises(ValidationError):
        ResumeImportDraftData.model_validate(
            {
                **minimal_data(),
                "summaryAction": "none",
            }
        )

