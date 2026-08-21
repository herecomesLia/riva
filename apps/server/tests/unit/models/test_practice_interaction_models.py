from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Text, UniqueConstraint
from sqlalchemy.sql.sqltypes import JSON, Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
)


def constraints_by_type(table, constraint_type):
    return [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, constraint_type)
    ]


def test_practice_answer_table_columns_constraints_and_relationships() -> None:
    load_models()

    assert "practice_answers" in Base.metadata.tables
    table = PracticeAnswer.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.kind.type.length == 16
    assert table.c.order.nullable is False
    assert isinstance(table.c.content.type, Text)
    assert table.c.content.nullable is False
    assert table.c.follow_up_question_id.nullable is True
    assert table.c.submitted_at.nullable is False
    assert table.c.submitted_at.type.timezone is True

    attempt_fk = next(iter(table.c.attempt_id.foreign_keys))
    assert attempt_fk.target_fullname == "practice_attempts.id"
    assert attempt_fk.ondelete == "CASCADE"
    follow_up_fk = next(iter(table.c.follow_up_question_id.foreign_keys))
    assert follow_up_fk.target_fullname == "practice_follow_up_questions.id"
    assert follow_up_fk.ondelete == "CASCADE"

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in constraints_by_type(table, CheckConstraint)
    }
    assert checks["ck_practice_answers_order"] == '"order" >= 1'
    assert "length(trim(content)) > 0" in checks["ck_practice_answers_content"]
    assert "length(content) <= 20000" in checks["ck_practice_answers_content"]
    invariant = checks["ck_practice_answers_kind_order_question"]
    assert "kind = 'main'" in invariant
    assert '"order" = 1' in invariant
    assert "follow_up_question_id IS NULL" in invariant
    assert "kind = 'followUp'" in invariant
    assert '"order" >= 2' in invariant
    assert "follow_up_question_id IS NOT NULL" in invariant

    unique_columns = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in constraints_by_type(table, UniqueConstraint)
    }
    assert unique_columns[("attempt_id", "order")] == (
        "uq_practice_answers_attempt_order"
    )
    assert unique_columns[("follow_up_question_id",)] == (
        "uq_practice_answers_follow_up_question"
    )

    assert PracticeAnswer.attempt.property.uselist is False
    assert PracticeAnswer.follow_up_question.property.uselist is False
    assert PracticeAttempt.answers.property.uselist is True
    assert PracticeAttempt.follow_up_questions.property.uselist is True
    assert PracticeAttempt.answers.property.cascade.delete_orphan is True
    assert PracticeAttempt.follow_up_questions.property.cascade.delete_orphan is True
    assert PracticeAnswer.follow_up_question.property.cascade.delete_orphan is False


def test_practice_follow_up_question_table_columns_constraints_and_relationships() -> (
    None
):
    load_models()

    assert "practice_follow_up_questions" in Base.metadata.tables
    table = PracticeFollowUpQuestion.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.order.nullable is False
    assert isinstance(table.c.prompt.type, Text)
    assert isinstance(table.c.focus.type, Text)
    assert table.c.prompt.nullable is False
    assert table.c.focus.nullable is False
    assert isinstance(table.c.answer_hints.type, JSON)
    assert isinstance(table.c.answer_framework.type, JSON)
    assert table.c.answer_hints.nullable is False
    assert table.c.answer_framework.nullable is False
    assert table.c.answer_hints_revealed.nullable is False
    assert table.c.answer_framework_revealed.nullable is False
    assert table.c.answer_hints_revealed.default.arg is False
    assert table.c.answer_framework_revealed.default.arg is False
    assert table.c.created_at.nullable is False
    assert table.c.created_at.type.timezone is True

    attempt_fk = next(iter(table.c.attempt_id.foreign_keys))
    assert attempt_fk.target_fullname == "practice_attempts.id"
    assert attempt_fk.ondelete == "CASCADE"
    source_run_fk = next(iter(table.c.source_agent_run_id.foreign_keys))
    assert source_run_fk.target_fullname == "agent_runs.id"
    assert source_run_fk.ondelete == "CASCADE"

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in constraints_by_type(table, CheckConstraint)
    }
    assert checks["ck_practice_follow_up_questions_order"] == '"order" >= 1'
    assert (
        "length(trim(prompt)) > 0" in checks["ck_practice_follow_up_questions_prompt"]
    )
    assert "length(trim(focus)) > 0" in checks["ck_practice_follow_up_questions_focus"]

    unique_columns = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in constraints_by_type(table, UniqueConstraint)
    }
    assert unique_columns[("attempt_id", "order")] == (
        "uq_practice_follow_up_questions_attempt_order"
    )
    assert unique_columns[("source_agent_run_id",)] == (
        "uq_practice_follow_up_questions_source_run"
    )

    assert PracticeFollowUpQuestion.attempt.property.uselist is False
    assert PracticeFollowUpQuestion.source_agent_run.property.uselist is False
    assert PracticeFollowUpQuestion.answer.property.uselist is False
    assert PracticeFollowUpQuestion.answer.property.cascade.delete_orphan is False

    forbidden_fields = {
        "template_id",
        "reference_answer",
        "evaluation",
        "review",
        "score",
        "metadata",
        "reasoning",
    }
    assert forbidden_fields.isdisjoint(set(table.c.keys()))
    assert PracticeFollowUpQuestion.source_agent_run.property.mapper.class_ is AgentRun


def test_practice_follow_up_decision_table_constraints_and_relationships() -> None:
    load_models()

    assert "practice_follow_up_decisions" in Base.metadata.tables
    table = PracticeFollowUpDecision.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.attempt_id.index is True
    assert table.c.attempt_id.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.order.nullable is False
    assert table.c.action.type.length == 16
    assert table.c.follow_up_question_id.nullable is True
    assert table.c.created_at.nullable is False
    assert table.c.created_at.type.timezone is True

    fks = {
        column.name: next(iter(column.foreign_keys))
        for column in (
            table.c.attempt_id,
            table.c.source_agent_run_id,
            table.c.follow_up_question_id,
        )
    }
    assert fks["attempt_id"].target_fullname == "practice_attempts.id"
    assert fks["attempt_id"].ondelete == "CASCADE"
    assert fks["source_agent_run_id"].target_fullname == "agent_runs.id"
    assert fks["source_agent_run_id"].ondelete == "CASCADE"
    assert (
        fks["follow_up_question_id"].target_fullname
        == "practice_follow_up_questions.id"
    )
    assert fks["follow_up_question_id"].ondelete == "CASCADE"

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in constraints_by_type(table, CheckConstraint)
    }
    assert '"order" >= 1' in checks["ck_practice_follow_up_decisions_order"]
    assert '"order" <= 2' in checks["ck_practice_follow_up_decisions_order"]
    assert (
        "action IN ('askFollowUp', 'complete')"
        in checks["ck_practice_follow_up_decisions_action"]
    )
    invariant = checks["ck_practice_follow_up_decisions_action_question"]
    assert "action = 'askFollowUp'" in invariant
    assert "follow_up_question_id IS NOT NULL" in invariant
    assert "action = 'complete'" in invariant
    assert "follow_up_question_id IS NULL" in invariant

    unique_columns = {
        tuple(column.name for column in constraint.columns): constraint.name
        for constraint in constraints_by_type(table, UniqueConstraint)
    }
    assert unique_columns[("source_agent_run_id",)] == (
        "uq_practice_follow_up_decisions_source_run"
    )
    assert unique_columns[("attempt_id", "order")] == (
        "uq_practice_follow_up_decisions_attempt_order"
    )
    assert unique_columns[("follow_up_question_id",)] == (
        "uq_practice_follow_up_decisions_question"
    )

    assert PracticeAttempt.follow_up_decisions.property.uselist is True
    assert PracticeAttempt.follow_up_decisions.property.cascade.delete_orphan is True
    assert PracticeFollowUpDecision.attempt.property.uselist is False
    assert PracticeFollowUpDecision.source_agent_run.property.uselist is False
    assert PracticeFollowUpDecision.follow_up_question.property.uselist is False
    assert (
        PracticeFollowUpDecision.follow_up_question.property.cascade.delete_orphan
        is False
    )
    assert PracticeFollowUpQuestion.decision.property.uselist is False
    assert PracticeFollowUpQuestion.decision.property.cascade.delete_orphan is False

    forbidden_fields = {"reasoning", "metadata", "score", "evaluation"}
    assert forbidden_fields.isdisjoint(set(table.c.keys()))
