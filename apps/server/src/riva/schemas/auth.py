from typing import Annotated

from pydantic import StringConstraints

from riva.schemas.base import APIModel

RegistrationUsername = Annotated[
    str,
    StringConstraints(
        min_length=4,
        max_length=32,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]

RegistrationPassword = Annotated[
    str,
    StringConstraints(
        min_length=8,
        max_length=128,
        pattern=r"""^[A-Za-z0-9!@#$%^&*()_\-+=\[\]{}|\\:;"'<>?,./~`]+$""",
    ),
]


class RegisterCredentials(APIModel):
    username: RegistrationUsername
    password: RegistrationPassword


class LoginCredentials(APIModel):
    username: str
    password: str
