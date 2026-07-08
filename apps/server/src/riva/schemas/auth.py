from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuthCredentials(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
