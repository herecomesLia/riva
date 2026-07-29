from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field, HttpUrl, StringConstraints, field_validator

from riva.schemas.base import APIModel

DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]


class UserAccountResponse(APIModel):
    id: UUID
    username: str
    display_name: str
    avatar_url: str | None


class UserAccountUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    avatar_url: Annotated[HttpUrl, Field(max_length=2083)] | None = None

    @field_validator("display_name", mode="before")
    @classmethod
    def display_name_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("display_name cannot be null")
        return value
