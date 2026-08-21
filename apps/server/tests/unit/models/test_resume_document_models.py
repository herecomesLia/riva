from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.sql.sqltypes import BigInteger, Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import ResumeDocument, User


def test_resume_document_table_is_registered() -> None:
    load_models()

    assert "resume_documents" in Base.metadata.tables


def test_resume_document_columns_relationship_and_timestamps() -> None:
    table = ResumeDocument.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.index is True
    assert table.c.user_id.references(User.__table__.c.id)
    assert next(iter(table.c.user_id.foreign_keys)).ondelete == "CASCADE"
    assert table.c.source_type.type.length == 32
    assert table.c.original_filename.type.length == 255
    assert table.c.media_type.type.length == 127
    assert isinstance(table.c.byte_size.type, BigInteger)
    assert table.c.sha256.type.length == 64
    assert table.c.storage_key.type.length == 512
    assert table.c.extraction_status.type.length == 32
    assert table.c.extracted_text.nullable is True
    assert table.c.extraction_failure_code.type.length == 64

    for column_name in ("uploaded_at", "created_at", "updated_at"):
        assert table.c[column_name].nullable is False
        assert table.c[column_name].type.timezone is True
    for column_name in ("extracted_at",):
        assert table.c[column_name].nullable is True
        assert table.c[column_name].type.timezone is True

    assert ResumeDocument.user.property.uselist is False
    assert User.resume_documents.property.uselist is True
    assert User.resume_documents.property.cascade.delete_orphan is True
    assert User.resume_documents.property.passive_deletes is True


def test_resume_document_constraints_cover_ownership_source_and_status() -> None:
    table = ResumeDocument.__table__
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "byte_size > 0" in checks["ck_resume_documents_byte_size_positive"]
    assert "length(sha256) = 64" in checks["ck_resume_documents_sha256_length"]
    assert (
        "source_type IN ('file', 'pastedText')"
        in checks["ck_resume_documents_source_type"]
    )
    assert (
        "extraction_status IN ('pending', 'succeeded', 'failed')"
        in checks["ck_resume_documents_extraction_status"]
    )

    source_check = checks["ck_resume_documents_source_fields"]
    assert "original_filename IS NOT NULL" in source_check
    assert "storage_key IS NOT NULL" in source_check
    assert "original_filename IS NULL" in source_check
    assert "storage_key IS NULL" in source_check
    assert "media_type = 'text/plain'" in source_check

    extraction_check = checks["ck_resume_documents_extraction_fields"]
    assert "extraction_status = 'pending'" in extraction_check
    assert "extracted_text IS NULL" in extraction_check
    assert "extraction_failure_code IS NULL" in extraction_check
    assert "extracted_at IS NULL" in extraction_check
    assert "extraction_status = 'succeeded'" in extraction_check
    assert "extracted_text IS NOT NULL" in extraction_check
    assert "extraction_status = 'failed'" in extraction_check
    assert "extraction_failure_code IS NOT NULL" in extraction_check
    assert "extracted_at IS NOT NULL" in extraction_check


def test_resume_document_has_owner_storage_constraints_and_indexes() -> None:
    table = ResumeDocument.__table__

    owner_unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_resume_documents_user_id_id"
    )
    assert [column.name for column in owner_unique.columns] == ["user_id", "id"]

    storage_unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_resume_documents_storage_key"
    )
    assert [column.name for column in storage_unique.columns] == ["storage_key"]

    indexes = {index.name: index for index in table.indexes if isinstance(index, Index)}
    assert [
        column.name
        for column in indexes["ix_resume_documents_user_uploaded_at"].columns
    ] == ["user_id", "uploaded_at"]
    assert [
        column.name
        for column in indexes["ix_resume_documents_extraction_status"].columns
    ] == ["extraction_status"]

    user_foreign_key = next(
        constraint
        for constraint in table.foreign_key_constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and next(iter(constraint.elements)).target_fullname == "users.id"
    )
    assert user_foreign_key.ondelete == "CASCADE"
