from sqlalchemy import JSON, CheckConstraint, Text, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.database import load_models
from riva.models import AgentRun, PracticeAttempt, PracticeReview


def constraints_by_type(table, constraint_type):
    return [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, constraint_type)
    ]


def test_practice_review_table_columns_constraints_and_relationships() -> None:
    load_models()

    assert "practice_reviews" in Base.metadata.tables
    table = PracticeReview.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert isinstance(table.c.overall_performance.type, Text)
    assert table.c.overall_performance.nullable is False
    for field in (
        "highlights",
        "main_issues",
        "improvement_suggestions",
        "reusable_answer_structure",
        "exposed_weaknesses",
    ):
        column = table.c[field]
        assert isinstance(column.type, JSON)
        assert column.type.none_as_null is True
        assert column.nullable is False
    assert table.c.reviewed_at.nullable is False
    assert table.c.reviewed_at.type.timezone is True

    foreign_keys = {
        column.name: next(iter(column.foreign_keys))
        for column in (table.c.attempt_id, table.c.source_agent_run_id)
    }
    assert foreign_keys["attempt_id"].target_fullname == "practice_attempts.id"
    assert foreign_keys["attempt_id"].ondelete == "CASCADE"
    assert foreign_keys["source_agent_run_id"].target_fullname == "agent_runs.id"
    assert foreign_keys["source_agent_run_id"].ondelete == "CASCADE"

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in constraints_by_type(table, CheckConstraint)
    }
    overall_check = checks["ck_practice_reviews_overall_performance"]
    assert "length(trim(overall_performance)) > 0" in overall_check
    assert "length(overall_performance) <= 4000" in overall_check

    unique_columns = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in constraints_by_type(table, UniqueConstraint)
    }
    assert unique_columns[("attempt_id",)] == "uq_practice_reviews_attempt"
    assert unique_columns[("source_agent_run_id",)] == (
        "uq_practice_reviews_source_run"
    )

    assert PracticeAttempt.review.property.uselist is False
    assert PracticeAttempt.review.property.cascade.delete_orphan is True
    assert PracticeReview.attempt.property.uselist is False
    assert PracticeReview.source_agent_run.property.uselist is False
    assert PracticeReview.source_agent_run.property.mapper.class_ is AgentRun

    forbidden_fields = {
        "evaluation_id",
        "question_card_id",
        "session_id",
        "user_id",
        "recommendation",
        "recommended_action",
        "next_question",
        "retry_current",
        "focus_areas",
        "next_difficulty",
        "next_question_type",
        "score",
        "reasoning",
        "metadata",
        "reference_answer",
        "updated_at",
        "version",
        "edited_at",
    }
    assert forbidden_fields.isdisjoint(set(table.c.keys()))
