from pydantic import BaseModel, ConfigDict

MAX_RAW_JOB_DESCRIPTION_LENGTH = 50_000


class DomainModel(BaseModel):
    """Pydantic base for service inputs and outputs.

    Domain models deliberately use Python field names. HTTP aliases and response
    serialization belong to the API schema layer.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")
