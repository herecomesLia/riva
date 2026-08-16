"""Persist interview planning snapshots and main questions."""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608160003"
down_revision: str | None = "202608160002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("planning_run_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_interview_sessions_planning_run",
        "interview_sessions",
        "agent_runs",
        ["planning_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_interview_sessions_planning_run_id"),
        "interview_sessions",
        ["planning_run_id"],
        unique=False,
    )

    op.create_table(
        "interview_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("source_agent_run_id", sa.Uuid(), nullable=False),
        sa.Column("total_main_questions", sa.Integer(), nullable=False),
        sa.Column("questions", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "revision >= 1",
            name="ck_interview_plans_revision",
        ),
        sa.CheckConstraint(
            "total_main_questions >= 1",
            name="ck_interview_plans_total_main_questions",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_agent_run_id"],
            ["agent_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "revision",
            name="uq_interview_plans_session_revision",
        ),
    )
    op.create_index(
        op.f("ix_interview_plans_session_id"),
        "interview_plans",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_interview_plans_source_agent_run_id"),
        "interview_plans",
        ["source_agent_run_id"],
        unique=False,
    )

    op.create_table(
        "interview_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("source_plan_id", sa.Uuid(), nullable=False),
        sa.Column("plan_revision", sa.Integer(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(length=64), nullable=False),
        sa.Column(
            "assessed_capabilities",
            sa.JSON(none_as_null=True),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "plan_revision >= 1",
            name="ck_interview_questions_plan_revision",
        ),
        sa.CheckConstraint(
            '"order" >= 1',
            name="ck_interview_questions_order",
        ),
        sa.CheckConstraint(
            "length(trim(prompt)) > 0",
            name="ck_interview_questions_prompt_not_blank",
        ),
        sa.CheckConstraint(
            "question_type IN ('selfIntroduction', 'projectDeepDive', "
            "'roleCapability', 'behavioral', 'technicalOrBusiness', "
            "'resumeRisk', 'motivation')",
            name="ck_interview_questions_type",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_plan_id"],
            ["interview_plans.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "order",
            name="uq_interview_questions_session_order",
        ),
    )
    op.create_index(
        op.f("ix_interview_questions_session_id"),
        "interview_questions",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_interview_questions_source_plan_id"),
        "interview_questions",
        ["source_plan_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_interview_questions_source_plan_id"),
        table_name="interview_questions",
    )
    op.drop_index(
        op.f("ix_interview_questions_session_id"),
        table_name="interview_questions",
    )
    op.drop_table("interview_questions")

    op.drop_index(
        op.f("ix_interview_plans_source_agent_run_id"),
        table_name="interview_plans",
    )
    op.drop_index(
        op.f("ix_interview_plans_session_id"),
        table_name="interview_plans",
    )
    op.drop_table("interview_plans")

    op.drop_index(
        op.f("ix_interview_sessions_planning_run_id"),
        table_name="interview_sessions",
    )
    op.drop_constraint(
        "fk_interview_sessions_planning_run",
        "interview_sessions",
        type_="foreignkey",
    )
    op.drop_column("interview_sessions", "planning_run_id")
