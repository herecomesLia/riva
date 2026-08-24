import pytest
from pydantic import ValidationError

from riva.schemas.users import UserProfileUpdate


def test_user_profile_update_accepts_camel_case_and_normalizes_display_name() -> None:
    update = UserProfileUpdate.model_validate(
        {
            "displayName": "  Lia Chen  ",
            "avatarUrl": "https://example.com/avatar.png",
        }
    )

    assert update.display_name == "Lia Chen"
    assert str(update.avatar_url) == "https://example.com/avatar.png"


def test_user_profile_update_allows_clearing_avatar() -> None:
    update = UserProfileUpdate.model_validate({"avatarUrl": None})

    assert update.model_fields_set == {"avatar_url"}
    assert update.avatar_url is None


@pytest.mark.parametrize(
    "payload",
    [
        {"displayName": None},
        {"displayName": "   "},
        {"displayName": "x" * 65},
        {"avatarUrl": "not-a-url"},
        {"unknownField": "value"},
    ],
)
def test_user_profile_update_rejects_invalid_fields(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate.model_validate(payload)
