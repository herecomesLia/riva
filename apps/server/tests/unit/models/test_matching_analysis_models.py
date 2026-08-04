from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, JSON, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    AgentRun,
    CareerProfile,
    MatchingAnalysis,
    TargetRole,
)


def test_matching_analysis_table_is_registered() -> None:
    load_models()

    assert "matching_analyses" in Base.metadata.tables


def test_matching_analysis_has_result_columns_and_timestamps() -> None:
    table = MatchingAnalysis.__table__

    assert isinstance(table.c.role_id.type, Uuid)
    assert table.c.role_id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.profile_id.nullable is False
    assert table.c.generated_at.nullable is False
    assert table.c.generated_at.type.timezone is True
    assert table.c.created_at.nullable is False
    assert table.c.updated_at.nullable is False

    for column_name in (
        "matched_capabilities",
        "missing_capabilities",
        "underrepresented_capabilities",
        "resume_highlights",
        "resume_gaps",
        "high_risk_questions",
        "preparation_recommendations",
    ):
        assert isinstance(table.c[column_name].type, JSON)
        assert table.c[column_name].nullable is False

    assert table.c.core_requirements_summary.nullable is False
    assert table.c.overall_match_score.nullable is False
    assert table.c.source_agent_run_id.nullable is False


def test_matching_analysis_uses_composite_owner_foreign_keys() -> None:
    table = MatchingAnalysis.__table__
    role_constraint = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_matching_analyses_role_owner"
    )
    profile_constraint = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_matching_analyses_profile_owner"
    )

    for constraint, target_columns in (
        (
            role_constraint,
            ["target_roles.user_id", "target_roles.id"],
        ),
        (
            profile_constraint,
            ["career_profiles.user_id", "career_profiles.id"],
        ),
    ):
        assert [element.parent.name for element in constraint.elements] == [
            "user_id",
            "role_id" if constraint is role_constraint else "profile_id",
        ]
        assert [element.target_fullname for element in constraint.elements] == (
            target_columns
        )
        assert constraint.ondelete == "CASCADE"

    source_foreign_key = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_foreign_key.column is AgentRun.__table__.c.id
    assert source_foreign_key.ondelete == "CASCADE"


def test_matching_analysis_has_unique_source_and_named_checks() -> None:
    table = MatchingAnalysis.__table__
    unique_source = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_matching_analyses_source_run"
    )
    assert [column.name for column in unique_source.columns] == [
        "source_agent_run_id"
    ]

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert checks["ck_matching_analyses_profile_version"] == "profile_version >= 1"
    assert checks["ck_matching_analyses_jd_version"] == (
        "job_description_version >= 1"
    )
    assert checks["ck_matching_analyses_analysis_version"] == (
        "job_description_analysis_version >= 1"
    )
    assert checks["ck_matching_analyses_score"] == (
        "overall_match_score >= 0 AND overall_match_score <= 100"
    )
    assert checks["ck_matching_analyses_summary_not_blank"] == (
        "length(trim(core_requirements_summary)) > 0"
    )


def test_matching_analysis_has_non_redundant_lookup_indexes() -> None:
    indexes = {
        index.name: index
        for index in MatchingAnalysis.__table__.indexes
        if isinstance(index, Index)
    }

    assert [
        column.name for column in indexes["ix_matching_analyses_user_role"].columns
    ] == ["user_id", "role_id"]
    assert [
        column.name
        for column in indexes["ix_matching_analyses_user_profile"].columns
    ] == ["user_id", "profile_id"]


def test_matching_analysis_and_target_role_relationships_are_one_to_one() -> None:
    assert TargetRole.matching_analysis.property.uselist is False
    assert MatchingAnalysis.role.property.uselist is False
    assert TargetRole.matching_analysis_run.property.uselist is False
    assert TargetRole.job_description_parsing_run.property.uselist is False


def test_career_profile_has_composite_owner_key_for_matching_analysis() -> None:
    constraint = next(
        constraint
        for constraint in CareerProfile.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_career_profiles_user_id_id"
    )

    assert [column.name for column in constraint.columns] == ["user_id", "id"]
