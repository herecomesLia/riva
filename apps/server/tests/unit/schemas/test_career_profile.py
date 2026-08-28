import pytest
from pydantic import ValidationError

from riva.schemas.career_profile import (
    CreateCareerProfileRequest,
    UpdateCareerProfileRequest,
)


def _work_experience(*skills: str) -> dict[str, object]:
    return {
        "company": "Example Company",
        "title": "Software Engineer",
        "skills": list(skills),
    }


def test_create_accepts_consistent_skill_lists() -> None:
    result = CreateCareerProfileRequest.model_validate(
        {
            "work_experiences": [_work_experience("Python")],
            "skills": ["Python"],
        }
    )

    assert result.skills == ["Python"]


def test_create_rejects_missing_work_experience_skill() -> None:
    with pytest.raises(ValidationError):
        CreateCareerProfileRequest.model_validate(
            {
                "work_experiences": [_work_experience("Python")],
                "skills": [],
            }
        )


def test_update_rejects_inconsistent_work_experiences_and_skills() -> None:
    with pytest.raises(ValidationError):
        UpdateCareerProfileRequest.model_validate(
            {
                "work_experiences": [_work_experience("Python")],
                "skills": [],
            }
        )


@pytest.mark.parametrize(
    "payload",
    [
        {"skills": ["Python"]},
        {"work_experiences": [_work_experience("Python")]},
    ],
)
def test_update_allows_skill_consistency_check_to_service_when_one_side_is_missing(
    payload: dict[str, object],
) -> None:
    result = UpdateCareerProfileRequest.model_validate(payload)

    assert result.model_fields_set


@pytest.mark.parametrize(
    ("payload", "valid"),
    [({}, False), ({"skills": None}, False), ({"skills": []}, True)],
)
def test_update_patch_semantics(
    payload: dict[str, object],
    valid: bool,
) -> None:
    if valid:
        assert UpdateCareerProfileRequest.model_validate(payload).skills == []
    else:
        with pytest.raises(ValidationError):
            UpdateCareerProfileRequest.model_validate(payload)
