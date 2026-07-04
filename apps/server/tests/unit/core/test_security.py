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
    ["ab", " bad", "bad ", "bad name", "bad.name", "name!", "a" * 33],
)
def test_normalize_username_rejects_invalid_values(username: str) -> None:
    with pytest.raises(ValueError, match="invalid_username"):
        normalize_username(username)


def test_password_hash_does_not_store_plaintext() -> None:
    password_hash = hash_password("correct horse battery staple")

    assert password_hash != "correct horse battery staple"
    assert verify_password(password_hash, "correct horse battery staple") is True
    assert verify_password(password_hash, "wrong password") is False


def test_session_token_digest_is_stable_and_not_plaintext() -> None:
    token = generate_session_token()
    digest = digest_session_token(token, "test-session-digest-key")

    assert len(token) >= 32
    assert len(digest) == 64
    assert digest != token
    assert digest == digest_session_token(token, "test-session-digest-key")
