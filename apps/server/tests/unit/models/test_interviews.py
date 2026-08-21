from sqlalchemy import JSON, CheckConstraint, ForeignKeyConstraint, Index
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    InterviewAnswer,
    InterviewFollowUpAnswer,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    InterviewTurnAssessment,
    TargetRole,
    User,
)


def _checks() -> dict[str, str]:
    return {
        constraint.name: str(constraint.sqltext)
        for constraint in InterviewSession.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }


def test_interview_session_table_and_columns_are_registered() -> None:
    load_models()

    assert "interview_sessions" in Base.metadata.tables
    table = InterviewSession.__table__
    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.target_role_id.nullable is False
    assert table.c.language.nullable is False
    assert table.c.version.nullable is False
    assert table.c.status.nullable is False
    assert table.c.round.nullable is False
    assert table.c.difficulty.nullable is False
    assert table.c.duration_minutes.nullable is False
    assert table.c.started_at.nullable is False
    assert table.c.completed_at.nullable is True
    assert table.c.completion_reason.nullable is True
    assert table.c.plan_revision.nullable is False
    assert table.c.total_main_questions.nullable is True
    assert table.c.planning_run_id.nullable is True
    assert table.c.turn_run_id.nullable is True
    for column_name in ("started_at", "created_at", "updated_at"):
        assert table.c[column_name].type.timezone is True
        assert table.c[column_name].nullable is False
    assert table.c.completed_at.type.timezone is True


def test_interview_session_uses_user_and_target_role_ownership() -> None:
    table = InterviewSession.__table__
    composite = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_interview_sessions_target_role_owner"
    )
    assert [element.parent.name for element in composite.elements] == [
        "user_id",
        "target_role_id",
    ]
    assert [element.target_fullname for element in composite.elements] == [
        "target_roles.user_id",
        "target_roles.id",
    ]
    assert composite.ondelete == "CASCADE"
    assert table.c.user_id.references(User.__table__.c.id)
    assert table.c.target_role_id.references(TargetRole.__table__.c.id)


def test_interview_session_checks_cover_future_states_and_configuration() -> None:
    checks = _checks()
    assert checks["ck_interview_sessions_language"] == "language IN ('zh-CN', 'en')"
    assert checks["ck_interview_sessions_version"] == "version >= 1"
    assert "opening" in checks["ck_interview_sessions_status"]
    assert "generatingQuestion" in checks["ck_interview_sessions_status"]
    assert "generatingReview" in checks["ck_interview_sessions_status"]
    assert "completed" in checks["ck_interview_sessions_status"]
    assert "comprehensive" in checks["ck_interview_sessions_round"]
    assert checks["ck_interview_sessions_difficulty"] == (
        "difficulty IN ('basic', 'pressure')"
    )
    assert checks["ck_interview_sessions_duration_minutes"] == (
        "duration_minutes IN (15, 30, 45)"
    )
    assert checks["ck_interview_sessions_plan_revision"] == "plan_revision >= 0"
    assert "status = 'completed'" in checks["ck_interview_sessions_completion_state"]


def test_only_one_non_completed_interview_session_is_allowed_per_user() -> None:
    indexes = {
        index.name: index
        for index in InterviewSession.__table__.indexes
        if isinstance(index, Index)
    }
    active_index = indexes["uq_interview_sessions_active_user"]
    assert active_index.unique is True
    assert str(active_index.dialect_options["postgresql"]["where"]) == (
        "status <> 'completed'"
    )


def test_interview_session_relationships_are_owned_by_user_and_role() -> None:
    assert InterviewSession.user.property.uselist is False
    assert InterviewSession.target_role.property.uselist is False
    assert User.interview_sessions.property.uselist is True
    assert TargetRole.interview_sessions.property.uselist is True


def test_interview_plan_table_stores_validated_snapshot_and_revision() -> None:
    load_models()

    table = InterviewPlan.__table__
    assert isinstance(table.c.id.type, Uuid)
    assert table.c.session_id.nullable is False
    assert table.c.revision.nullable is False
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.total_main_questions.nullable is False
    assert isinstance(table.c.questions.type, JSON)
    assert table.c.created_at.type.timezone is True
    unique = next(
        constraint
        for constraint in table.constraints
        if constraint.name == "uq_interview_plans_session_revision"
    )
    assert [column.name for column in unique.columns] == ["session_id", "revision"]


def test_interview_question_table_is_independent_from_question_cards() -> None:
    load_models()

    table = InterviewQuestion.__table__
    assert table.c.session_id.nullable is False
    assert table.c.source_plan_id.nullable is False
    assert table.c.plan_revision.nullable is False
    assert table.c.order.nullable is False
    assert table.c.prompt.nullable is False
    assert table.c.question_type.nullable is False
    assert isinstance(table.c.assessed_capabilities.type, JSON)
    unique = next(
        constraint
        for constraint in table.constraints
        if constraint.name == "uq_interview_questions_session_order"
    )
    assert [column.name for column in unique.columns] == ["session_id", "order"]
    assert table.c.completed_at.nullable is True
    assert table.c.completed_at.type.timezone is True


def test_interview_turn_tables_use_single_answer_lineage_and_independent_lifecycle() -> (
    None
):
    load_models()

    answer = InterviewAnswer.__table__
    follow_up_question = InterviewFollowUpQuestion.__table__
    follow_up_answer = InterviewFollowUpAnswer.__table__
    assessment = InterviewTurnAssessment.__table__

    assert answer.c.content.nullable is False
    assert answer.c.submitted_at.type.timezone is True
    assert {column.name for column in answer.constraints if column.name} >= {
        "uq_interview_answers_question"
    }
    assert {
        column.name for column in follow_up_question.constraints if column.name
    } >= {
        "uq_interview_follow_up_questions_parent_order",
        "uq_interview_follow_up_questions_source_run",
    }
    assert {column.name for column in follow_up_answer.constraints if column.name} >= {
        "uq_interview_follow_up_answers_question"
    }
    assert {column.name for column in assessment.constraints if column.name} >= {
        "uq_interview_turn_assessments_source_run",
        "uq_interview_turn_assessments_main_answer",
        "uq_interview_turn_assessments_follow_up_answer",
        "ck_interview_turn_assessments_exactly_one_answer",
    }
