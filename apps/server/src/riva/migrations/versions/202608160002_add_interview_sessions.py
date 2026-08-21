"""Add persisted mock interview sessions."""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202608160002"
down_revision: str | None = "202608160001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "interview_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("target_role_id", sa.Uuid(), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("round", sa.String(length=32), nullable=False),
        sa.Column("difficulty", sa.String(length=32), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completion_reason", sa.String(length=64), nullable=True),
        sa.Column("plan_revision", sa.Integer(), nullable=False),
        sa.Column(
            "total_main_questions",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "language IN ('zh-CN', 'en')",
            name="ck_interview_sessions_language",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_interview_sessions_version",
        ),
        sa.CheckConstraint(
            "status IN ("
            "'opening', 'generatingQuestion', 'question', 'generatingTurn', "
            "'followUp', 'candidateQuestions', 'generatingCandidateAnswer', "
            "'generatingReview', 'completed'"
            ")",
            name="ck_interview_sessions_status",
        ),
        sa.CheckConstraint(
            "round IN ('hr', 'firstBusiness', 'technical', 'manager', 'final', 'comprehensive')",
            name="ck_interview_sessions_round",
        ),
        sa.CheckConstraint(
            "difficulty IN ('basic', 'pressure')",
            name="ck_interview_sessions_difficulty",
        ),
        sa.CheckConstraint(
            "duration_minutes IN (15, 30, 45)",
            name="ck_interview_sessions_duration_minutes",
        ),
        sa.CheckConstraint(
            "plan_revision >= 0",
            name="ck_interview_sessions_plan_revision",
        ),
        sa.CheckConstraint(
            "total_main_questions IS NULL OR total_main_questions >= 1",
            name="ck_interview_sessions_total_main_questions",
        ),
        sa.CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL "
            "AND completion_reason IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL "
            "AND completion_reason IS NULL)",
            name="ck_interview_sessions_completion_state",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "target_role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_interview_sessions_target_role_owner",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_interview_sessions_user_id"),
        "interview_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_interview_sessions_active_user",
        "interview_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'completed'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_interview_sessions_active_user",
        table_name="interview_sessions",
        postgresql_where=sa.text("status <> 'completed'"),
    )
    op.drop_index(
        op.f("ix_interview_sessions_user_id"),
        table_name="interview_sessions",
    )
    op.drop_table("interview_sessions")
