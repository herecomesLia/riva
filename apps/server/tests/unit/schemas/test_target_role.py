import pytest
from pydantic import ValidationError

from riva.schemas.target_role import (
    UpdateJobDescriptionRequest,
    UpdateTargetRoleRequest,
)


def test_target_role_patch_distinguishes_omitted_null_and_value() -> None:
    payload = UpdateTargetRoleRequest.model_validate(
        {"company": None, "location": "Remote"}
    )

    assert payload.model_fields_set == {"company", "location"}
    assert payload.company is None
    assert payload.recruitment_track is None


@pytest.mark.parametrize("payload", [{}, {"title": None}])
def test_target_role_patch_rejects_empty_or_null_title(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        UpdateTargetRoleRequest.model_validate(payload)


def test_jd_patch_distinguishes_omitted_and_empty_collection() -> None:
    payload = UpdateJobDescriptionRequest.model_validate({"soft_skills": []})

    assert payload.soft_skills == []
    assert payload.model_fields_set == {"soft_skills"}
    assert payload.responsibilities is None


@pytest.mark.parametrize("payload", [{}, {"responsibilities": None}])
def test_jd_patch_rejects_empty_or_null_section(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        UpdateJobDescriptionRequest.model_validate(payload)
