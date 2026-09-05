from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.users import UpdateCurrentUserRequest, UserResponse


def test_current_user_update_accepts_display_name() -> None:
    update = UpdateCurrentUserRequest.model_validate({"displayName": " Test User "})

    assert update.display_name == "Test User"


def test_current_user_update_rejects_null_display_name() -> None:
    with pytest.raises(ValidationError):
        UpdateCurrentUserRequest.model_validate({"displayName": None})


def test_current_user_update_rejects_control_characters() -> None:
    with pytest.raises(ValidationError):
        UpdateCurrentUserRequest.model_validate({"displayName": "Eleno\nChen"})


def test_user_response_validates_attributes_and_serializes_aliases() -> None:
    user_id = uuid4()
    user = SimpleNamespace(
        id=user_id,
        username="test_user",
        display_name="Test User",
        avatar_url=None,
    )

    response = UserResponse.model_validate(user)

    assert response.model_dump(mode="json") == {
        "id": str(user_id),
        "username": "test_user",
        "displayName": "Test User",
        "avatarUrl": None,
    }
