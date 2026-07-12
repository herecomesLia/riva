from uuid import UUID

from riva.schemas.base import APIModel


class AuthCredentials(APIModel):
    username: str
    password: str


class UserResponse(APIModel):
    id: UUID
    username: str
