from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    AgentRun,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
    TargetRole,
    User,
)


def checks_by_name(table) -> dict[str, str]:
    return {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }


def test_practice_session_table_and_columns_are_registered() -> None:
    load_models()

    assert "practice_sessions" in Base.metadata.tables
    table = PracticeSession.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.index is True
    assert table.c.language.nullable is False
    assert table.c.version.nullable is False
    assert table.c.status.nullable is False
    assert table.c.initial_question_type.nullable is False
    assert table.c.initial_difficulty.nullable is False
    assert table.c.source.nullable is False
    assert table.c.prioritize_weaknesses.nullable is False
    assert table.c.started_at.nullable is False
    assert table.c.completed_at.nullable is True
    assert table.c.completion_reason.nullable is True
    for column_name in ("started_at", "created_at", "updated_at"):
        assert table.c[column_name].type.timezone is True
        assert table.c[column_name].nullable is False
    assert table.c.completed_at.type.timezone is True

    assert table.c.user_id.references(User.__table__.c.id)
    assert next(iter(table.c.user_id.foreign_keys)).ondelete == "CASCADE"


def test_practice_session_uses_target_role_ownership_and_unique_identity() -> None:
    table = PracticeSession.__table__
    composite = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_practice_sessions_target_role_owner"
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
    assert table.c.target_role_id.references(TargetRole.__table__.c.id)

    unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and [column.name for column in constraint.columns] == ["user_id", "id"]
    )
    assert unique.name == "uq_practice_sessions_user_id_id"


def test_practice_session_checks_cover_selection_and_completion_state() -> None:
    checks = checks_by_name(PracticeSession.__table__)

    assert checks["ck_practice_sessions_language"] == "language IN ('zh-CN', 'en')"
    assert checks["ck_practice_sessions_version"] == "version >= 1"
    assert checks["ck_practice_sessions_status"] == (
        "status IN ('active', 'completed')"
    )
    assert "projectDeepDive" in checks[
        "ck_practice_sessions_initial_question_type"
    ]
    assert "technicalFoundation" in checks[
        "ck_practice_sessions_initial_question_type"
    ]
    assert checks["ck_practice_sessions_initial_difficulty"] == (
        "initial_difficulty IN ('basic', 'pressure')"
    )
    assert checks["ck_practice_sessions_source"] == (
        "source IN ('personalized', 'saved', 'history')"
    )
    assert checks["ck_practice_sessions_completion_reason"] == (
        "completion_reason IS NULL OR completion_reason IN ("
        "'reviewCompleted', 'userEndedEarly'"
        ")"
    )
    completion_state = checks["ck_practice_sessions_completion_state"]
    assert "status = 'active'" in completion_state
    assert "completed_at IS NULL" in completion_state
    assert "completion_reason IS NULL" in completion_state
    assert "status = 'completed'" in completion_state
    assert "completed_at IS NOT NULL" in completion_state
    assert "completion_reason IS NOT NULL" in completion_state

    assert PracticeSession.__table__.c.version.default.arg == 1
    assert PracticeSession.__table__.c.prioritize_weaknesses.default.arg is False


def test_practice_session_relationships_are_owned_by_user_and_role() -> None:
    assert PracticeSession.user.property.uselist is False
    assert PracticeSession.target_role.property.uselist is False
    assert PracticeSession.attempts.property.uselist is True
    assert User.practice_sessions.property.uselist is True
    assert TargetRole.practice_sessions.property.uselist is True


def test_practice_attempt_table_and_columns_are_registered() -> None:
    load_models()

    assert "practice_attempts" in Base.metadata.tables
    table = PracticeAttempt.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.session_id.nullable is False
    assert table.c.attempt_number.nullable is False
    assert table.c.question_type.nullable is False
    assert table.c.difficulty.nullable is False
    assert table.c.status.nullable is False
    assert table.c.question_generation_run_id.nullable is True
    assert table.c.question_card_id.nullable is True
    assert table.c.retry_of_attempt_id.nullable is True
    assert table.c.completed_at.nullable is True
    for column_name in ("created_at", "updated_at", "completed_at"):
        assert table.c[column_name].type.timezone is True
    assert table.c.question_generation_run_id.references(AgentRun.__table__.c.id)
    assert table.c.question_card_id.references(QuestionCard.__table__.c.id)


def test_practice_attempt_uses_session_ownership_and_attempt_number_uniqueness() -> None:
    table = PracticeAttempt.__table__
    composite = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        and constraint.name == "fk_practice_attempts_session_owner"
    )

    assert [element.parent.name for element in composite.elements] == [
        "user_id",
        "session_id",
    ]
    assert [element.target_fullname for element in composite.elements] == [
        "practice_sessions.user_id",
        "practice_sessions.id",
    ]
    assert composite.ondelete == "CASCADE"

    attempt_number_unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and [column.name for column in constraint.columns]
        == ["session_id", "attempt_number"]
    )
    assert attempt_number_unique.name == (
        "uq_practice_attempts_session_attempt_number"
    )


def test_practice_attempt_checks_cover_selection_and_status() -> None:
    checks = checks_by_name(PracticeAttempt.__table__)

    assert checks["ck_practice_attempts_attempt_number"] == "attempt_number >= 1"
    assert "projectDeepDive" in checks["ck_practice_attempts_question_type"]
    assert "technicalFoundation" in checks["ck_practice_attempts_question_type"]
    assert checks["ck_practice_attempts_difficulty"] == (
        "difficulty IN ('basic', 'pressure')"
    )
    status = checks["ck_practice_attempts_status"]
    for value in (
        "generatingQuestion",
        "answering",
        "answeringFollowUp",
        "evaluating",
        "review",
        "completed",
        "endedEarly",
    ):
        assert value in status


def test_practice_attempt_links_are_nullable_and_generation_run_is_unique() -> None:
    table = PracticeAttempt.__table__

    unique = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and [column.name for column in constraint.columns]
        == ["question_generation_run_id"]
    )
    assert unique.name == "uq_practice_attempts_question_generation_run"

    retry_foreign_key = next(
        foreign_key
        for foreign_key in table.c.retry_of_attempt_id.foreign_keys
    )
    assert retry_foreign_key.target_fullname == "practice_attempts.id"
    assert retry_foreign_key.ondelete == "SET NULL"

    assert PracticeAttempt.session.property.uselist is False
    assert PracticeAttempt.question_generation_run.property.uselist is False
    assert PracticeAttempt.question_card.property.uselist is False
    assert PracticeAttempt.retry_of_attempt.property.uselist is False


def test_practice_attempt_has_no_answer_or_review_payload_fields() -> None:
    forbidden_fields = {
        "template_id",
        "answer",
        "answer_text",
        "evaluation",
        "review",
        "reference_answer",
        "metadata",
        "training_record_id",
    }

    assert forbidden_fields.isdisjoint(set(PracticeSession.__table__.c.keys()))
    assert forbidden_fields.isdisjoint(set(PracticeAttempt.__table__.c.keys()))
