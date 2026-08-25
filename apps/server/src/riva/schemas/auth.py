from riva.schemas.base import APIModel


class AuthCredentials(APIModel):
    username: str
    password: str
