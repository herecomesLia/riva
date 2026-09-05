from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


class RequestModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class NonEmptyPartialUpdateRequest(RequestModel):
    @model_validator(mode="after")
    def require_changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class ResponseModel(APIModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_serialization_defaults_required=True,
    )
