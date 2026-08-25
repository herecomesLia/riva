import pytest
from pydantic import ValidationError

from riva.schemas.auth import LoginCredentials, RegisterCredentials


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("abc", "correct-password"),
        ("valid-user", "short"),
        ("valid user", "correct-password"),
    ],
)
def test_register_credentials_enforce_registration_rules(
    username: str,
    password: str,
) -> None:
    with pytest.raises(ValidationError):
        RegisterCredentials(username=username, password=password)


def test_login_credentials_do_not_enforce_registration_rules() -> None:
    credentials = LoginCredentials(username="abc", password="short")

    assert credentials.username == "abc"
    assert credentials.password == "short"
