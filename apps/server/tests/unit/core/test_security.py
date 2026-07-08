import pytest

from riva.core.security import (
    digest_session_token,
    generate_session_token,
    hash_password,
    normalize_username,
    verify_password,
)


def test_normalize_username_accepts_uppercase_and_lowercases_for_lookup() -> None:
    assert normalize_username("User_Name-1") == "user_name-1"


@pytest.mark.parametrize(
    "username",
    ["Abc1", "User_Name-1", "A" * 32],
)
def test_normalize_username_accepts_valid_usernames(username: str) -> None:
    normalized = normalize_username(username)

    assert normalized == username.lower()


@pytest.mark.parametrize(
    "username",
    [
        "abc",
        "ab c",
        " abc",
        "abc ",
        "a\tbc",
        "bad.name",
        "name!",
        "a" * 33,
    ],
)
def test_normalize_username_rejects_invalid_values(username: str) -> None:
    with pytest.raises(ValueError, match="invalid_username"):
        normalize_username(username)


def test_password_hash_does_not_store_plaintext() -> None:
    password = "Aa1!Bb2@"
    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password_hash, password) is True
    assert verify_password(password_hash, "wrong password") is False


def test_password_hash_accepts_documented_visible_symbols() -> None:
    password = 'Aa1!@#%^&*()_-+=[]{}|\\:;"\'<>?,./~`'

    password_hash = hash_password(password)

    assert verify_password(password_hash, password) is True


@pytest.mark.parametrize(
    "password",
    [
        "Aa1!Bb2",  # too short
        "Aa1!Bb2@" + "c" * 121,  # 129 chars
        "Aa1!Bb2 ",
        "Aa1!Bb2\n",
        "Aa1!Bb2😊",
    ],
)
def test_validate_password_rejects_invalid_values(password: str) -> None:
    from riva.core.security import validate_password

    with pytest.raises(ValueError, match="invalid_password"):
        validate_password(password)


def test_session_token_digest_is_stable_and_not_plaintext() -> None:
    token = generate_session_token()
    digest = digest_session_token(token, "test-session-digest-key")

    assert len(token) >= 32
    assert len(digest) == 64
    assert digest != token
    assert digest == digest_session_token(token, "test-session-digest-key")
