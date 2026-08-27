from typing import Annotated

from pydantic import StringConstraints

from riva.schemas.base import RequestModel

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


class RegisterCredentials(RequestModel):
    username: RegistrationUsername
    password: RegistrationPassword


class LoginCredentials(RequestModel):
    username: Annotated[str, StringConstraints(max_length=32)]
    password: Annotated[str, StringConstraints(max_length=128)]
