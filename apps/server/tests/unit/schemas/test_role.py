import pytest
from pydantic import ValidationError

from riva.schemas.role import (
    UpdateJobDescriptionRequest,
    UpdateRoleRequest,
)


def test_role_patch_distinguishes_omitted_null_and_value() -> None:
    payload = UpdateRoleRequest.model_validate({"company": None, "location": "Remote"})

    assert payload.model_fields_set == {"company", "location"}
    assert payload.company is None
    assert payload.recruitment_track is None


def test_role_patch_rejects_null_title() -> None:
    with pytest.raises(ValidationError):
        UpdateRoleRequest.model_validate({"title": None})


def test_jd_patch_distinguishes_omitted_and_empty_collection() -> None:
    payload = UpdateJobDescriptionRequest.model_validate({"soft_skills": []})

    assert payload.soft_skills == []
    assert payload.model_fields_set == {"soft_skills"}
    assert payload.responsibilities is None


def test_jd_patch_rejects_null_section() -> None:
    with pytest.raises(ValidationError):
        UpdateJobDescriptionRequest.model_validate({"responsibilities": None})
