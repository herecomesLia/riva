from pydantic import BaseModel, ConfigDict
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


class ResponseModel(APIModel):
    model_config = ConfigDict(from_attributes=True)
