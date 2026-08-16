"""Persist interview answers, dynamic follow-ups, and turn assessments."""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608160004"
down_revision: str | None = "202608160003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("turn_run_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_interview_sessions_turn_run",
        "interview_sessions",
        "agent_runs",
        ["turn_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_interview_sessions_turn_run_id"),
        "interview_sessions",
        ["turn_run_id"],
        unique=False,
    )
    op.add_column(
        "interview_questions",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "interview_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 20000",
            name="ck_interview_answers_content",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["interview_questions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_id",
            name="uq_interview_answers_question",
        ),
    )
    op.create_index(
        op.f("ix_interview_answers_session_id"),
        "interview_answers",
        ["session_id"],
        unique=False,
    )

    op.create_table(
        "interview_follow_up_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("parent_question_id", sa.Uuid(), nullable=False),
        sa.Column("source_turn_run_id", sa.Uuid(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            '"order" >= 1',
            name="ck_interview_follow_up_questions_order",
        ),
        sa.CheckConstraint(
            "length(trim(prompt)) > 0 AND length(prompt) <= 4000",
            name="ck_interview_follow_up_questions_prompt",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_question_id"],
            ["interview_questions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_turn_run_id"],
            ["agent_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "parent_question_id",
            "order",
            name="uq_interview_follow_up_questions_parent_order",
        ),
        sa.UniqueConstraint(
            "source_turn_run_id",
            name="uq_interview_follow_up_questions_source_run",
        ),
    )
    op.create_index(
        op.f("ix_interview_follow_up_questions_session_id"),
        "interview_follow_up_questions",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_interview_follow_up_questions_parent_question_id"),
        "interview_follow_up_questions",
        ["parent_question_id"],
        unique=False,
    )

    op.create_table(
        "interview_follow_up_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("follow_up_question_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 20000",
            name="ck_interview_follow_up_answers_content",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["follow_up_question_id"],
            ["interview_follow_up_questions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "follow_up_question_id",
            name="uq_interview_follow_up_answers_question",
        ),
    )
    op.create_index(
        op.f("ix_interview_follow_up_answers_session_id"),
        "interview_follow_up_answers",
        ["session_id"],
        unique=False,
    )

    op.create_table(
        "interview_turn_assessments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("source_agent_run_id", sa.Uuid(), nullable=False),
        sa.Column("main_answer_id", sa.Uuid(), nullable=True),
        sa.Column("follow_up_answer_id", sa.Uuid(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("strengths", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("issues", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_interview_turn_assessments_score",
        ),
        sa.CheckConstraint(
            "decision IN ('followUp', 'completeQuestion')",
            name="ck_interview_turn_assessments_decision",
        ),
        sa.CheckConstraint(
            "((main_answer_id IS NOT NULL AND follow_up_answer_id IS NULL) OR "
            "(main_answer_id IS NULL AND follow_up_answer_id IS NOT NULL))",
            name="ck_interview_turn_assessments_exactly_one_answer",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["interview_questions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_agent_run_id"],
            ["agent_runs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["main_answer_id"],
            ["interview_answers.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["follow_up_answer_id"],
            ["interview_follow_up_answers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_agent_run_id",
            name="uq_interview_turn_assessments_source_run",
        ),
        sa.UniqueConstraint(
            "main_answer_id",
            name="uq_interview_turn_assessments_main_answer",
        ),
        sa.UniqueConstraint(
            "follow_up_answer_id",
            name="uq_interview_turn_assessments_follow_up_answer",
        ),
    )
    op.create_index(
        op.f("ix_interview_turn_assessments_session_id"),
        "interview_turn_assessments",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_interview_turn_assessments_question_id"),
        "interview_turn_assessments",
        ["question_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_interview_turn_assessments_question_id"),
        table_name="interview_turn_assessments",
    )
    op.drop_index(
        op.f("ix_interview_turn_assessments_session_id"),
        table_name="interview_turn_assessments",
    )
    op.drop_table("interview_turn_assessments")

    op.drop_index(
        op.f("ix_interview_follow_up_answers_session_id"),
        table_name="interview_follow_up_answers",
    )
    op.drop_table("interview_follow_up_answers")

    op.drop_index(
        op.f("ix_interview_follow_up_questions_parent_question_id"),
        table_name="interview_follow_up_questions",
    )
    op.drop_index(
        op.f("ix_interview_follow_up_questions_session_id"),
        table_name="interview_follow_up_questions",
    )
    op.drop_table("interview_follow_up_questions")

    op.drop_index(
        op.f("ix_interview_answers_session_id"),
        table_name="interview_answers",
    )
    op.drop_table("interview_answers")

    op.drop_column("interview_questions", "completed_at")
    op.drop_index(
        op.f("ix_interview_sessions_turn_run_id"),
        table_name="interview_sessions",
    )
    op.drop_constraint(
        "fk_interview_sessions_turn_run",
        "interview_sessions",
        type_="foreignkey",
    )
    op.drop_column("interview_sessions", "turn_run_id")
