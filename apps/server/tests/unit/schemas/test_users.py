from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.users import UserProfileUpdate, UserResponse


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (" Test User ", "Test User"),
        ("a" * 64, "a" * 64),
    ],
)
def test_profile_update_normalizes_valid_display_name(
    value: str,
    expected: str,
) -> None:
    update = UserProfileUpdate.model_validate({"displayName": value})

    assert update.display_name == expected


@pytest.mark.parametrize("value", ["", "   ", "a" * 65, None])
def test_profile_update_rejects_invalid_display_name(value: object) -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate.model_validate({"displayName": value})


@pytest.mark.parametrize(
    "value",
    ["http://example.test/avatar.png", "https://example.test/avatar.png"],
)
def test_profile_update_accepts_http_avatar_url(value: str) -> None:
    update = UserProfileUpdate.model_validate({"avatarUrl": value})

    assert str(update.avatar_url) == value


def test_profile_update_rejects_invalid_avatar_url() -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate.model_validate({"avatarUrl": "not-a-url"})


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({}, {}),
        ({"displayName": "Test User"}, {"display_name": "Test User"}),
        ({"avatarUrl": None}, {"avatar_url": None}),
    ],
)
def test_profile_update_preserves_partial_update_semantics(
    payload: dict[str, object],
    expected: dict[str, object],
) -> None:
    update = UserProfileUpdate.model_validate(payload)

    assert (
        update.model_dump(
            mode="json",
            by_alias=False,
            exclude_unset=True,
        )
        == expected
    )


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
