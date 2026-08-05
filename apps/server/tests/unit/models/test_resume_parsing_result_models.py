from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, JSON, UniqueConstraint
from sqlalchemy.sql.sqltypes import Text, Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import AgentRun, ResumeDocument, ResumeParsingResult


def test_resume_parsing_result_table_is_registered() -> None:
    load_models()

    assert "resume_parsing_results" in Base.metadata.tables


def test_resume_document_has_unique_parsing_run_pointer_and_relationships() -> None:
    table = ResumeDocument.__table__
    column = table.c.parsing_run_id

    assert isinstance(column.type, Uuid)
    assert column.nullable is True
    assert column.unique is True
    assert column.index is True
    foreign_key = next(iter(column.foreign_keys))
    assert foreign_key.column is AgentRun.__table__.c.id
    assert foreign_key.ondelete == "SET NULL"
    assert ResumeDocument.parsing_run.property.uselist is False
    assert ResumeDocument.parsing_result.property.uselist is False
    assert ResumeParsingResult.document.property.uselist is False
    assert ResumeDocument.parsing_result.property.passive_deletes is True


def test_resume_parsing_result_has_fields_constraints_indexes_and_timestamps() -> None:
    table = ResumeParsingResult.__table__

    assert table.name == "resume_parsing_results"
    assert table.c.resume_document_id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.result_version.nullable is False
    assert table.c.result_version.default.arg == 1
    assert table.c.source_agent_run_id.nullable is False
    assert isinstance(table.c.summary.type, Text)
    assert table.c.summary.nullable is True

    for column_name in (
        "education",
        "work_experiences",
        "project_experiences",
        "skills",
        "unresolved_items",
    ):
        column = table.c[column_name]
        assert isinstance(column.type, JSON)
        assert column.type.none_as_null is True
        assert column.nullable is False

    for column_name in ("parsed_at", "created_at", "updated_at"):
        column = table.c[column_name]
        assert column.nullable is False
        assert column.type.timezone is True

    source_foreign_key = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_foreign_key.column is AgentRun.__table__.c.id
    assert source_foreign_key.ondelete == "CASCADE"

    owner_foreign_key = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_resume_parsing_results_document_owner"
    )
    assert [element.parent.name for element in owner_foreign_key.elements] == [
        "user_id",
        "resume_document_id",
    ]
    assert [element.target_fullname for element in owner_foreign_key.elements] == [
        "resume_documents.user_id",
        "resume_documents.id",
    ]
    assert owner_foreign_key.ondelete == "CASCADE"

    source_unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_resume_parsing_results_source_run"
    )
    assert [column.name for column in source_unique.columns] == [
        "source_agent_run_id"
    ]

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert checks["ck_resume_parsing_results_result_version"] == (
        "result_version >= 1"
    )

    indexes = {
        index.name: index
        for index in table.indexes
        if isinstance(index, Index)
    }
    assert [
        column.name
        for column in indexes["ix_resume_parsing_results_user_document"].columns
    ] == ["user_id", "resume_document_id"]
    assert [
        column.name
        for column in indexes["ix_resume_parsing_results_parsed_at"].columns
    ] == ["parsed_at"]
