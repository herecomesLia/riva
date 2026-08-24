from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel

MAX_RAW_JOB_DESCRIPTION_LENGTH = 50_000


def _validate_standard_uuid(value: object) -> object:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        return value
    try:
        parsed = UUID(value)
    except ValueError:
        return value
    if str(parsed) != value.lower():
        raise ValueError("id must be a standard UUID")
    return value


StandardUUID = Annotated[UUID, BeforeValidator(_validate_standard_uuid)]
RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
    Annotated[str, StringConstraints(max_length=255)] | None,
    BeforeValidator(
        lambda value: value.strip() or None if isinstance(value, str) else value
    ),
]


class APIModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )
