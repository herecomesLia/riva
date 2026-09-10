from contextlib import nullcontext

import pytest
from pydantic import ValidationError

from riva.schemas.auth import RegisterCredentials

VALID_PASSWORD = "Abcd1234"


@pytest.mark.parametrize(
    ("username", "is_valid"),
    [
        ("a" * 3, False),
        ("a" * 4, True),
        ("a" * 32, True),
        ("a" * 33, False),
        ("abc_DEF-123", True),
        ("abc def", False),
        ("abc.def", False),
        ("用户名", False),
    ],
)
def test_register_credentials_validates_username(
    username: str,
    is_valid: bool,
) -> None:
    with nullcontext() if is_valid else pytest.raises(ValidationError):
        RegisterCredentials(username=username, password=VALID_PASSWORD)


@pytest.mark.parametrize(
    ("password", "is_valid"),
    [
        ("a" * 7, False),
        ("a" * 8, True),
        ("a" * 128, True),
        ("a" * 129, False),
        ("Abcd1234", True),
        ("Abc123!@", True),
        ("Abcd 123", False),
        ("pässword", False),
    ],
)
def test_register_credentials_validates_password(
    password: str,
    is_valid: bool,
) -> None:
    with nullcontext() if is_valid else pytest.raises(ValidationError):
        RegisterCredentials(username="user", password=password)
