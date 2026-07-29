from riva.db import Base
from riva.db.database import load_models
from riva.models import Profile, User


def test_profile_model_is_registered_with_one_to_one_user_relationship() -> None:
    load_models()

    profiles = Base.metadata.tables["profiles"]

    assert Profile.__tablename__ == "profiles"
    assert profiles.c.user_id.unique is True
    foreign_key = next(iter(profiles.c.user_id.foreign_keys))
    assert foreign_key.target_fullname == "users.id"
    assert User.profile.property.uselist is False
    assert Profile.user.property.uselist is False
