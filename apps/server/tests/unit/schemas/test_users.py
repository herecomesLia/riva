import pytest
from pydantic import ValidationError

from riva.schemas.users import UpdateCurrentUserRequest


def test_current_user_update_accepts_display_name() -> None:
    update = UpdateCurrentUserRequest.model_validate({"displayName": " Test User "})

    assert update.display_name == "Test User"


def test_current_user_update_rejects_null_display_name() -> None:
    with pytest.raises(ValidationError):
        UpdateCurrentUserRequest.model_validate({"displayName": None})


def test_current_user_update_rejects_control_characters() -> None:
    with pytest.raises(ValidationError):
        UpdateCurrentUserRequest.model_validate({"displayName": "Eleno\nChen"})
