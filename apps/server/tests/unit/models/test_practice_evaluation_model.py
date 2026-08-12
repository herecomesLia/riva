from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.sql.sqltypes import JSON, Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import AgentRun, PracticeAttempt, PracticeEvaluation


def test_practice_evaluation_table_columns_constraints_and_relationships() -> None:
    load_models()

    assert "practice_evaluations" in Base.metadata.tables
    table = PracticeEvaluation.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.overall_score.nullable is False
    assert isinstance(table.c.dimension_scores.type, JSON)
    assert isinstance(table.c.focus_assessments.type, JSON)
    assert table.c.dimension_scores.nullable is False
    assert table.c.focus_assessments.nullable is False
    assert table.c.evaluated_at.nullable is False
    assert table.c.evaluated_at.type.timezone is True

    attempt_fk = next(iter(table.c.attempt_id.foreign_keys))
    assert attempt_fk.target_fullname == "practice_attempts.id"
    assert attempt_fk.ondelete == "CASCADE"
    source_run_fk = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_run_fk.target_fullname == "agent_runs.id"
    assert source_run_fk.ondelete == "CASCADE"

    score_check = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
        and constraint.name == "ck_practice_evaluations_overall_score"
    )
    assert str(score_check.sqltext) == "overall_score >= 0 AND overall_score <= 100"

    unique_constraints = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert unique_constraints[("attempt_id",)] == "uq_practice_evaluations_attempt"
    assert unique_constraints[("source_agent_run_id",)] == (
        "uq_practice_evaluations_source_run"
    )

    assert PracticeAttempt.evaluation.property.uselist is False
    assert PracticeAttempt.evaluation.property.cascade.delete_orphan is True
    assert PracticeEvaluation.attempt.property.uselist is False
    assert PracticeEvaluation.source_agent_run.property.uselist is False
    assert PracticeEvaluation.attempt.property.mapper.class_ is PracticeAttempt
    assert PracticeEvaluation.source_agent_run.property.mapper.class_ is AgentRun
    assert not hasattr(AgentRun, "evaluations")


def test_practice_evaluation_has_immutable_artifact_shape() -> None:
    forbidden_fields = {
        "updated_at",
        "version",
        "review",
        "recommendation",
        "reference_answer",
        "weaknesses",
        "reasoning",
        "metadata",
    }

    assert forbidden_fields.isdisjoint(set(PracticeEvaluation.__table__.c.keys()))
