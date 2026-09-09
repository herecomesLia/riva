from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator
from pydantic.json_schema import SkipJsonSchema

from riva.schemas.base import NonEmptyPartialUpdateRequest, ResponseModel

DisplayName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=64,
        pattern=r"^[^\x00-\x1F\x7F-\x9F]+$",
    ),
]


class UserResponse(ResponseModel):
    id: UUID
    username: str = Field(description="Account identifier used to sign in.")
    display_name: str = Field(
        description="Name shown in the interface, distinct from the sign-in username."
    )
    avatar_url: str | None = Field(
        description="Avatar address; null when no avatar is available."
    )


class UpdateCurrentUserRequest(NonEmptyPartialUpdateRequest):
    """Update supplied profile fields; an empty request or explicit null is invalid."""

    display_name: DisplayName | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
    )

    @field_validator("display_name", mode="before")
    @classmethod
    def display_name_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("display_name cannot be null")
        return value
