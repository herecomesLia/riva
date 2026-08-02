from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

MAX_RAW_JOB_DESCRIPTION_LENGTH = 50_000


class APIModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )
