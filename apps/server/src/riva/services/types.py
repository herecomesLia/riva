from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

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


class DomainModel(BaseModel):
    """Pydantic base for service inputs and outputs.

    Domain models deliberately use Python field names. HTTP aliases and response
    serialization belong to the API schema layer.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")
