from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    User,
)

PROFILE_TABLES = {
    "career_profiles",
    "career_profile_educations",
    "career_profile_work_experiences",
    "career_profile_project_experiences",
    "career_profile_skills",
    "career_profile_work_skills",
    "career_profile_project_skills",
}


def foreign_key(column):
    return next(iter(column.foreign_keys))


def test_career_profile_tables_are_registered() -> None:
    load_models()

    assert PROFILE_TABLES <= set(Base.metadata.tables)


def test_career_profile_has_one_to_one_cascading_user_relationship() -> None:
    profiles = Base.metadata.tables["career_profiles"]

    assert profiles.c.user_id.nullable is False
    assert profiles.c.user_id.unique is True
    assert foreign_key(profiles.c.user_id).target_fullname == "users.id"
    assert foreign_key(profiles.c.user_id).ondelete == "CASCADE"
    assert User.career_profile.property.uselist is False
    assert CareerProfile.user.property.uselist is False


def test_profile_children_use_uuid_ids_positions_and_cascading_foreign_keys() -> None:
    child_models = (
        CareerProfileEducation,
        CareerProfileWorkExperience,
        CareerProfileProjectExperience,
        CareerProfileSkill,
        CareerProfileWorkSkill,
        CareerProfileProjectSkill,
    )

    for model in child_models:
        table = Base.metadata.tables[model.__tablename__]
        assert table.c.id.primary_key is True
        assert isinstance(table.c.id.type, Uuid)
        assert table.c.career_profile_id.nullable is False
        assert foreign_key(
            table.c.career_profile_id
        ).target_fullname == "career_profiles.id"
        assert foreign_key(table.c.career_profile_id).ondelete == "CASCADE"
        assert table.c.position.nullable is False


def test_profile_skill_associations_reference_experiences_and_skills() -> None:
    work_links = Base.metadata.tables["career_profile_work_skills"]
    project_links = Base.metadata.tables["career_profile_project_skills"]

    assert foreign_key(
        work_links.c.work_experience_id
    ).target_fullname == "career_profile_work_experiences.id"
    assert foreign_key(
        work_links.c.skill_id
    ).target_fullname == "career_profile_skills.id"
    assert foreign_key(
        project_links.c.project_experience_id
    ).target_fullname == "career_profile_project_experiences.id"
    assert foreign_key(
        project_links.c.skill_id
    ).target_fullname == "career_profile_skills.id"
    assert all(
        foreign_key(column).ondelete == "CASCADE"
        for column in (
            work_links.c.work_experience_id,
            work_links.c.skill_id,
            project_links.c.project_experience_id,
            project_links.c.skill_id,
        )
    )
    assert CareerProfileWorkSkill.work_experience.property.uselist is False
    assert CareerProfileProjectSkill.project_experience.property.uselist is False


def test_profile_models_keep_internal_timestamps() -> None:
    timestamped_models = (
        CareerProfile,
        CareerProfileEducation,
        CareerProfileWorkExperience,
        CareerProfileProjectExperience,
        CareerProfileSkill,
        CareerProfileWorkSkill,
        CareerProfileProjectSkill,
    )

    for model in timestamped_models:
        table = Base.metadata.tables[model.__tablename__]
        assert "created_at" in table.c
        assert "updated_at" in table.c
