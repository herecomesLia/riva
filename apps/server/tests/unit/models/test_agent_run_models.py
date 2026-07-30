from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import AgentRun, AgentRunStatus, User


def test_agent_run_table_is_registered() -> None:
    load_models()

    assert "agent_runs" in Base.metadata.tables


def test_agent_run_columns_defaults_and_user_relationship() -> None:
    table = AgentRun.__table__

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.user_id.nullable is False
    assert table.c.user_id.references(User.__table__.c.id)
    assert next(iter(table.c.user_id.foreign_keys)).ondelete == "CASCADE"
    assert table.c.status.default.arg == AgentRunStatus.QUEUED
    assert table.c.attempt_count.default.arg == 0
    assert table.c.max_attempts.default.arg == 1
    assert table.c.payload.nullable is False
    assert table.c.result.nullable is True
    assert AgentRun.user.property.uselist is False
    assert User.agent_runs.property.uselist is True


def test_agent_run_has_idempotency_constraint() -> None:
    constraint = next(
        constraint
        for constraint in AgentRun.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_agent_runs_idempotency"
    )

    assert [column.name for column in constraint.columns] == [
        "user_id",
        "agent_id",
        "prompt_id",
        "prompt_version",
        "idempotency_key",
    ]


def test_agent_run_checks_cover_status_attempts_leases_and_terminal_data() -> None:
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in AgentRun.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "attempt_count >= 0" in checks["ck_agent_runs_attempts"]
    assert "max_attempts >= 1" in checks["ck_agent_runs_attempts"]
    assert "attempt_count <= max_attempts" in checks["ck_agent_runs_attempts"]
    assert "attempt_count < max_attempts" in checks["ck_agent_runs_status_fields"]
    assert "status = 'running'" in checks["ck_agent_runs_status_fields"]
    assert "lease_token IS NOT NULL" in checks["ck_agent_runs_status_fields"]
    assert "status = 'succeeded'" in checks["ck_agent_runs_status_fields"]
    assert "result IS NOT NULL" in checks["ck_agent_runs_status_fields"]
    assert "status = 'failed'" in checks["ck_agent_runs_status_fields"]
    assert "error_code IS NOT NULL" in checks["ck_agent_runs_status_fields"]


def test_agent_run_has_queue_user_and_expired_lease_indexes() -> None:
    indexes = {
        index.name: index
        for index in AgentRun.__table__.indexes
        if isinstance(index, Index)
    }

    queued_columns = indexes["ix_agent_runs_queued_available"].columns
    assert [column.name for column in queued_columns] == [
        "status",
        "available_at",
        "created_at",
        "id",
    ]
    user_columns = indexes["ix_agent_runs_user_created"].columns
    assert [column.name for column in user_columns] == [
        "user_id",
        "created_at",
        "id",
    ]
    assert [
        column.name for column in indexes["ix_agent_runs_expired_running"].columns
    ] == ["lease_expires_at", "id"]
