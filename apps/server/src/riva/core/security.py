import hashlib
import hmac
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,32}$")
PASSWORD_PATTERN = re.compile(
    r"^[A-Za-z0-9!@#$%^&*()_\-+=\[\]{}|\\:;\"'<>?,./~`]{8,128}$"
)

_password_hasher = PasswordHasher()


def normalize_username(username: str) -> str:
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError("invalid_username")
    return username.lower()


def validate_password(password: str) -> None:
    if not PASSWORD_PATTERN.fullmatch(password):
        raise ValueError("invalid_password")


def hash_password(password: str) -> str:
    validate_password(password)
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def digest_session_token(token: str, digest_key: str) -> str:
    return hmac.new(
        digest_key.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
