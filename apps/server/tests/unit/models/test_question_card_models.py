from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, JSON, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    AgentRun,
    CareerProfile,
    QuestionCard,
    TargetRole,
    User,
)


def test_question_card_table_is_registered() -> None:
    load_models()

    assert "question_cards" in Base.metadata.tables


def test_question_card_has_expected_columns_and_json_fields() -> None:
    table = QuestionCard.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.index is True
    assert table.c.target_role_id.nullable is False
    assert table.c.profile_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.matching_analysis_run_id.nullable is False

    for column_name in (
        "assessed_capabilities",
        "recommended_materials",
        "answer_hints",
        "answer_framework",
        "follow_up_directions",
        "scoring_focus",
    ):
        assert isinstance(table.c[column_name].type, JSON)
        assert table.c[column_name].nullable is False

    assert table.c.prompt.nullable is False
    assert table.c.prompt.type.__class__.__name__ == "Text"
    for column_name in ("created_at", "updated_at"):
        assert table.c[column_name].nullable is False
        assert table.c[column_name].type.timezone is True

    assert table.c.source_agent_run_id.references(AgentRun.__table__.c.id)
    assert table.c.language.type.length == 16
    assert table.c.question_type.type.length == 64
    assert table.c.difficulty.type.length == 32


def test_question_card_uses_owner_composite_foreign_keys() -> None:
    table = QuestionCard.__table__
    role_constraint = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_question_cards_target_role_owner"
    )
    profile_constraint = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_question_cards_profile_owner"
    )

    for constraint, target_columns, child_columns in (
        (
            role_constraint,
            ["target_roles.user_id", "target_roles.id"],
            ["user_id", "target_role_id"],
        ),
        (
            profile_constraint,
            ["career_profiles.user_id", "career_profiles.id"],
            ["user_id", "profile_id"],
        ),
    ):
        assert [element.parent.name for element in constraint.elements] == child_columns
        assert [element.target_fullname for element in constraint.elements] == target_columns
        assert constraint.ondelete == "CASCADE"

    assert table.c.user_id.references(User.__table__.c.id)
    assert table.c.target_role_id.references(TargetRole.__table__.c.id)
    assert table.c.profile_id.references(CareerProfile.__table__.c.id)


def test_question_card_has_source_uniqueness_and_database_checks() -> None:
    table = QuestionCard.__table__
    unique_source = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_question_cards_source_run"
    )
    assert [column.name for column in unique_source.columns] == ["source_agent_run_id"]

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert checks["ck_question_cards_language"] == "language IN ('zh-CN', 'en')"
    assert "projectDeepDive" in checks["ck_question_cards_question_type"]
    assert "technicalFoundation" in checks["ck_question_cards_question_type"]
    assert checks["ck_question_cards_difficulty"] == (
        "difficulty IN ('basic', 'pressure')"
    )
    assert checks["ck_question_cards_prompt_not_blank"] == (
        "length(trim(prompt)) > 0"
    )
    assert checks["ck_question_cards_profile_version"] == "profile_version >= 1"
    assert checks["ck_question_cards_jd_version"] == "job_description_version >= 1"
    assert checks["ck_question_cards_analysis_version"] == (
        "job_description_analysis_version >= 1"
    )


def test_question_card_has_lookup_indexes_and_owner_relationships() -> None:
    indexes = {
        index.name: index
        for index in QuestionCard.__table__.indexes
        if isinstance(index, Index)
    }
    assert [
        column.name for column in indexes["ix_question_cards_user_target_role"].columns
    ] == ["user_id", "target_role_id"]
    assert [
        column.name for column in indexes["ix_question_cards_user_profile"].columns
    ] == ["user_id", "profile_id"]

    assert QuestionCard.user.property.uselist is False
    assert QuestionCard.target_role.property.uselist is False
    assert QuestionCard.career_profile.property.uselist is False
    for relationship in (
        User.question_cards,
        TargetRole.question_cards,
        CareerProfile.question_cards,
    ):
        assert relationship.property.uselist is True
        assert relationship.property.passive_deletes is True
        assert relationship.property.cascade.delete_orphan is True


def test_question_card_saved_and_weak_flags_default_to_false() -> None:
    table = QuestionCard.__table__

    assert table.c.is_saved.default.arg is False
    assert table.c.is_marked_weak.default.arg is False
