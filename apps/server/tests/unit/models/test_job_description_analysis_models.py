from sqlalchemy import (
    JSON,
    CheckConstraint,
    ForeignKeyConstraint,
    Index,
    UniqueConstraint,
)

from riva.db import Base
from riva.db.database import load_models
from riva.models import AgentRun, JobDescriptionAnalysis, TargetRole


def test_job_description_analysis_table_is_registered() -> None:
    load_models()

    assert "job_description_analyses" in Base.metadata.tables


def test_analysis_is_one_per_role_and_uses_role_owner_foreign_key() -> None:
    table = JobDescriptionAnalysis.__table__

    assert table.c.role_id.primary_key is True
    assert table.c.user_id.nullable is False
    composite = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_job_description_analyses_role_owner"
    )
    assert [element.parent.name for element in composite.elements] == [
        "user_id",
        "role_id",
    ]
    assert [element.target_fullname for element in composite.elements] == [
        "target_roles.user_id",
        "target_roles.id",
    ]
    assert composite.ondelete == "CASCADE"
    assert TargetRole.job_description_analysis.property.uselist is False
    assert JobDescriptionAnalysis.role.property.uselist is False


def test_analysis_source_run_versions_summary_and_json_columns_are_constrained() -> (
    None
):
    table = JobDescriptionAnalysis.__table__

    source_foreign_key = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_foreign_key.column is AgentRun.__table__.c.id
    assert table.c.source_agent_run_id.nullable is False
    assert next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_job_description_analyses_source_run"
    )

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert checks["ck_job_description_analyses_jd_version"] == (
        "job_description_version >= 1"
    )
    assert checks["ck_job_description_analyses_analysis_version"] == (
        "analysis_version >= 1"
    )
    assert "length(trim(riva_summary)) > 0" in checks.values()
    assert table.c.analysis_version.default.arg == 1

    for column_name in (
        "responsibilities",
        "qualification_requirements",
        "required_skills",
        "preferred_qualifications",
        "soft_skills",
        "business_domains",
    ):
        assert isinstance(table.c[column_name].type, JSON)
        assert table.c[column_name].nullable is False

    assert "raw_job_description" not in table.c
    assert "prompt" not in table.c
    assert "provider_response" not in table.c


def test_analysis_has_current_role_lookup_index_and_timestamps() -> None:
    table = JobDescriptionAnalysis.__table__
    indexes = {index.name: index for index in table.indexes if isinstance(index, Index)}

    assert [
        column.name
        for column in indexes["ix_job_description_analyses_user_role"].columns
    ] == ["user_id", "role_id"]
    assert table.c.parsed_at.nullable is False
    assert table.c.created_at.nullable is False
    assert table.c.updated_at.nullable is False


def test_target_role_parsing_run_reference_is_nullable_indexed_and_set_null() -> None:
    table = TargetRole.__table__
    column = table.c.job_description_parsing_run_id

    assert column.nullable is True
    foreign_key = next(iter(column.foreign_keys))
    assert foreign_key.column is AgentRun.__table__.c.id
    assert foreign_key.ondelete == "SET NULL"
    assert "ix_target_roles_job_description_parsing_run_id" in {
        index.name for index in table.indexes
    }
    assert TargetRole.job_description_parsing_run.property.uselist is False
