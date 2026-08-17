from sqlalchemy import CheckConstraint, ForeignKeyConstraint, JSON, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import CompetencyEvidence, User, UserCompetency


def test_competency_tables_and_relationships_are_registered() -> None:
    load_models()

    assert "user_competencies" in Base.metadata.tables
    assert "competency_evidence" in Base.metadata.tables
    assert User.competencies.property.uselist is True
    assert UserCompetency.user.property.uselist is False
    assert UserCompetency.evidences.property.uselist is True
    assert CompetencyEvidence.competency.property.uselist is False


def test_user_competency_columns_defaults_and_constraints() -> None:
    table = UserCompetency.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.index is True
    assert table.c.competency_key.nullable is False
    assert table.c.display_name.nullable is False
    assert table.c.level.nullable is True
    assert table.c.confidence.default.arg == 0
    assert table.c.evidence_count.default.arg == 0
    assert table.c.trend.default.arg == "insufficient"
    assert table.c.last_evidence_at.nullable is True
    for column_name in ("created_at", "updated_at"):
        assert table.c[column_name].nullable is False
        assert table.c[column_name].type.timezone is True

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "competency_key" in checks["ck_user_competencies_competency_key"]
    assert checks["ck_user_competencies_level"] == (
        "level IS NULL OR (level >= 0 AND level <= 100)"
    )
    assert checks["ck_user_competencies_confidence"] == (
        "confidence >= 0 AND confidence <= 100"
    )
    assert checks["ck_user_competencies_evidence_count"] == "evidence_count >= 0"
    assert "insufficient" in checks["ck_user_competencies_trend"]

    user_key = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_user_competencies_user_key"
    )
    assert [column.name for column in user_key.columns] == [
        "user_id",
        "competency_key",
    ]
    owner_key = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_user_competencies_user_id_id"
    )
    assert [column.name for column in owner_key.columns] == ["user_id", "id"]
    assert table.c.user_id.references(User.__table__.c.id)


def test_competency_evidence_has_owner_fk_and_signal_constraints() -> None:
    table = CompetencyEvidence.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert isinstance(table.c.details.type, JSON)
    assert table.c.details.nullable is False
    assert callable(table.c.details.default.arg)
    assert table.c.score.nullable is True
    assert table.c.evidence_text.nullable is True
    assert table.c.occurred_at.type.timezone is True
    assert table.c.created_at.type.timezone is True

    owner_fk = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_competency_evidence_competency_owner"
    )
    assert [element.parent.name for element in owner_fk.elements] == [
        "user_id",
        "competency_id",
    ]
    assert [element.target_fullname for element in owner_fk.elements] == [
        "user_competencies.user_id",
        "user_competencies.id",
    ]
    assert owner_fk.ondelete == "CASCADE"

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "practiceAttempt" in checks["ck_competency_evidence_source_type"]
    assert "interviewReview" in checks["ck_competency_evidence_source_type"]
    assert "score" in checks["ck_competency_evidence_signal_payload"]
    assert "evidence_text" in checks["ck_competency_evidence_signal_payload"]
    assert checks["ck_competency_evidence_score"] == (
        "score IS NULL OR (score >= 0 AND score <= 100)"
    )

    unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_competency_evidence_source_entity_signal"
    )
    assert [column.name for column in unique.columns] == [
        "competency_id",
        "source_entity_type",
        "source_entity_id",
        "signal_type",
    ]
