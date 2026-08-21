from sqlalchemy import JSON, CheckConstraint, Text, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.database import load_models
from riva.models import AgentRun, PracticeAttempt, PracticeRecommendation


def constraints_by_type(table, constraint_type):
    return [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, constraint_type)
    ]


def test_practice_recommendation_table_constraints_and_relationships() -> None:
    load_models()

    assert "practice_recommendations" in Base.metadata.tables
    table = PracticeRecommendation.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.action.type.length == 16
    assert table.c.action.nullable is False
    assert isinstance(table.c.reason.type, Text)
    assert table.c.reason.nullable is False
    assert table.c.next_question_type.type.length == 64
    assert table.c.next_question_type.nullable is True
    assert table.c.next_difficulty.type.length == 32
    assert table.c.next_difficulty.nullable is True
    assert isinstance(table.c.focus_areas.type, JSON)
    assert table.c.focus_areas.type.none_as_null is True
    assert table.c.focus_areas.nullable is False
    assert table.c.recommended_at.nullable is False
    assert table.c.recommended_at.type.timezone is True

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
    assert checks["ck_practice_recommendations_action"] == (
        "action IN ('retryCurrent', 'nextQuestion')"
    )
    action_plan = checks["ck_practice_recommendations_action_plan"]
    assert "action = 'retryCurrent'" in action_plan
    assert "next_question_type IS NULL" in action_plan
    assert "next_difficulty IS NULL" in action_plan
    assert "action = 'nextQuestion'" in action_plan
    assert "next_question_type IS NOT NULL" in action_plan
    assert "next_difficulty IS NOT NULL" in action_plan
    assert "projectDeepDive" in checks["ck_practice_recommendations_question_type"]
    assert "technicalFoundation" in checks["ck_practice_recommendations_question_type"]
    assert "basic" in checks["ck_practice_recommendations_difficulty"]
    assert "pressure" in checks["ck_practice_recommendations_difficulty"]
    assert "length(trim(reason)) > 0" in checks["ck_practice_recommendations_reason"]
    assert "length(reason) <= 2000" in checks["ck_practice_recommendations_reason"]

    unique_columns = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in constraints_by_type(table, UniqueConstraint)
    }
    assert unique_columns[("attempt_id",)] == ("uq_practice_recommendations_attempt")
    assert unique_columns[("source_agent_run_id",)] == (
        "uq_practice_recommendations_source_run"
    )

    assert PracticeAttempt.recommendation.property.uselist is False
    assert PracticeAttempt.recommendation.property.cascade.delete_orphan is True
    assert PracticeRecommendation.attempt.property.uselist is False
    assert PracticeRecommendation.source_agent_run.property.uselist is False
    assert PracticeRecommendation.source_agent_run.property.mapper.class_ is AgentRun

    forbidden_fields = {
        "evaluation_id",
        "review_id",
        "question_card_id",
        "session_id",
        "user_id",
        "recommendation",
        "next_question_prompt",
        "score",
        "reasoning",
        "metadata",
        "updated_at",
        "version",
        "edited_at",
    }
    assert forbidden_fields.isdisjoint(set(table.c.keys()))
