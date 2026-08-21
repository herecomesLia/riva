from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import CurrentTargetRole, TargetRole, User


def constraint_sql(table) -> set[str]:
    return {
        str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }


def test_target_role_tables_are_registered() -> None:
    load_models()

    assert {"target_roles", "current_target_roles"} <= set(Base.metadata.tables)


def test_target_role_columns_and_user_relationship() -> None:
    table = TargetRole.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.references(User.__table__.c.id)
    assert next(iter(table.c.user_id.foreign_keys)).ondelete == "CASCADE"
    assert table.c.title.nullable is False
    assert table.c.company.nullable is True
    assert table.c.recruitment_type.nullable is True
    assert table.c.raw_job_description.nullable is True
    assert TargetRole.user.property.uselist is False
    assert User.target_roles.property.uselist is True


def test_target_role_database_checks_cover_versions_statuses_and_experience() -> None:
    checks = constraint_sql(TargetRole.__table__)
    checks_text = "\n".join(checks)

    assert "version >= 1" in checks
    assert "job_description_version IS NULL OR job_description_version >= 1" in checks
    assert "min_experience_years IS NULL OR min_experience_years >= 0" in checks
    assert "max_experience_years IS NULL OR max_experience_years >= 0" in checks
    assert "max_experience_years >= min_experience_years" in checks_text
    assert "preparation_status IN ('preparing', 'paused', 'archived')" in checks
    assert "job_description_status IN ('missing', 'saved')" in checks
    assert "job_description_status = 'missing'" in checks_text
    assert "raw_job_description IS NULL" in checks_text
    assert "job_description_status = 'saved'" in checks_text
    assert "length(trim(raw_job_description)) > 0" in checks_text


def test_target_role_has_composite_unique_key_for_current_role_reference() -> None:
    constraint = next(
        constraint
        for constraint in TargetRole.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
        and [column.name for column in constraint.columns] == ["user_id", "id"]
    )

    assert constraint is not None


def test_current_target_role_is_one_per_user_and_uses_composite_foreign_key() -> None:
    table = CurrentTargetRole.__table__

    assert table.c.user_id.primary_key is True
    assert table.c.role_id.nullable is False
    user_foreign_key = next(
        foreign_key
        for foreign_key in table.c.user_id.foreign_keys
        if foreign_key.target_fullname == "users.id"
    )
    assert user_foreign_key.ondelete == "CASCADE"

    composite = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and [element.parent.name for element in constraint.elements]
        == ["user_id", "role_id"]
    )
    assert [element.target_fullname for element in composite.elements] == [
        "target_roles.user_id",
        "target_roles.id",
    ]
    assert composite.ondelete == "CASCADE"
    assert User.current_target_role.property.uselist is False
    assert CurrentTargetRole.role.property.uselist is False


def test_role_models_have_internal_timestamps_without_denormalized_current_flag() -> (
    None
):
    for model in (TargetRole, CurrentTargetRole):
        assert "created_at" in model.__table__.c
        assert "updated_at" in model.__table__.c

    assert "current_role_id" not in User.__table__.c
    assert "is_current" not in TargetRole.__table__.c
