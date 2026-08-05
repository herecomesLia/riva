from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, JSON, UniqueConstraint
from sqlalchemy.sql.sqltypes import DateTime, Text, Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import AgentRun, ResumeDocument, ResumeImportDraft, ResumeParsingResult


def test_resume_import_draft_table_is_registered() -> None:
    load_models()
    assert "resume_import_drafts" in Base.metadata.tables


def test_resume_import_draft_fields_constraints_relationships_and_indexes() -> None:
    table = ResumeImportDraft.__table__
    assert table.name == "resume_import_drafts"
    assert table.c.resume_document_id.primary_key is True
    assert isinstance(table.c.resume_document_id.type, Uuid)
    assert table.c.user_id.nullable is False
    assert table.c.parsing_result_version.nullable is False
    assert table.c.draft_version.default.arg == 1
    assert table.c.status.default.arg == "ready"
    assert table.c.summary.nullable is True
    assert isinstance(table.c.summary.type, Text)

    for column_name in (
        "education",
        "work_experiences",
        "project_experiences",
        "skills",
        "unresolved_items",
        "skipped_items",
        "protected_items",
        "change_summary",
    ):
        column = table.c[column_name]
        assert isinstance(column.type, JSON)
        assert column.type.none_as_null is True
        assert column.nullable is False

    for column_name in ("created_at", "updated_at", "applied_at"):
        assert isinstance(table.c[column_name].type, DateTime)
        assert table.c[column_name].type.timezone is True

    result_fk = next(
        foreign_key
        for foreign_key in table.c.resume_document_id.foreign_keys
        if foreign_key.column is ResumeParsingResult.__table__.c.resume_document_id
    )
    assert result_fk.ondelete == "CASCADE"

    source_fk = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_fk.column is AgentRun.__table__.c.id
    assert source_fk.ondelete is None

    owner_fk = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_resume_import_drafts_document_owner"
    )
    assert [element.parent.name for element in owner_fk.elements] == [
        "user_id",
        "resume_document_id",
    ]
    assert [element.target_fullname for element in owner_fk.elements] == [
        "resume_documents.user_id",
        "resume_documents.id",
    ]
    assert owner_fk.ondelete == "CASCADE"

    unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_resume_import_drafts_source_run"
    )
    assert [column.name for column in unique.columns] == ["source_agent_run_id"]

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "ck_resume_import_drafts_parsing_result_version" in checks
    assert "ck_resume_import_drafts_draft_version" in checks
    assert "ck_resume_import_drafts_base_profile_consistency" in checks
    assert "ck_resume_import_drafts_status" in checks
    assert "ck_resume_import_drafts_summary_action" in checks
    assert "ck_resume_import_drafts_applied_state" in checks

    indexes = {index.name: index for index in table.indexes if isinstance(index, Index)}
    assert [
        column.name
        for column in indexes["ix_resume_import_drafts_user_document"].columns
    ] == ["user_id", "resume_document_id"]
    assert [
        column.name
        for column in indexes["ix_resume_import_drafts_user_status_updated_at"].columns
    ] == ["user_id", "status", "updated_at"]
    assert ResumeDocument.import_draft.property.uselist is False
    assert ResumeImportDraft.document.property.uselist is False
    assert ResumeImportDraft.parsing_result.property.uselist is False

