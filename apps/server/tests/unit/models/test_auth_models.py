from riva.db import Base
from riva.db.database import load_models
from riva.models import AuthSession, User


def test_auth_models_are_registered_in_metadata() -> None:
    load_models()

    assert User.__tablename__ == "users"
    assert AuthSession.__tablename__ == "auth_sessions"
    assert "users" in Base.metadata.tables
    assert "auth_sessions" in Base.metadata.tables
    assert Base.metadata.tables["users"].c.username.unique is None
    assert Base.metadata.tables["users"].c.normalized_username.unique is True
    assert Base.metadata.tables["auth_sessions"].c.token_digest.unique is True
