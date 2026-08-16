"""Persist candidate questions, interview completion, and overall reviews."""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608160005"
down_revision: str | None = "202608160004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("candidate_answer_run_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_interview_sessions_candidate_answer_run",
        "interview_sessions",
        "agent_runs",
        ["candidate_answer_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_interview_sessions_candidate_answer_run_id"),
        "interview_sessions",
        ["candidate_answer_run_id"],
        unique=False,
    )
    op.add_column(
        "interview_sessions",
        sa.Column("review_run_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_interview_sessions_review_run",
        "interview_sessions",
        "agent_runs",
        ["review_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_interview_sessions_review_run_id"),
        "interview_sessions",
        ["review_run_id"],
        unique=False,
    )

    op.create_table(
        "interview_candidate_questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 4000",
            name="ck_interview_candidate_questions_content",
        ),
        sa.CheckConstraint(
            '"order" >= 1',
            name="ck_interview_candidate_questions_order",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "order",
            name="uq_interview_candidate_questions_session_order",
        ),
    )
    op.create_index(
        op.f("ix_interview_candidate_questions_session_id"),
        "interview_candidate_questions",
        ["session_id"],
        unique=False,
    )

    op.create_table(
        "interview_candidate_question_exchanges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("source_agent_run_id", sa.Uuid(), nullable=False),
        sa.Column("interviewer_answer", sa.Text(), nullable=False),
        sa.Column("feedback_summary", sa.Text(), nullable=False),
        sa.Column("strengths", sa.JSON(none_as_null=True), nullable=False),
        sa.Column(
            "improvement_suggestions",
            sa.JSON(none_as_null=True),
            nullable=False,
        ),
        sa.Column(
            "suggested_alternatives",
            sa.JSON(none_as_null=True),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(interviewer_answer)) > 0",
            name="ck_interview_candidate_question_exchanges_answer",
        ),
        sa.CheckConstraint(
            "length(trim(feedback_summary)) > 0",
            name="ck_interview_candidate_question_exchanges_feedback",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["interview_candidate_questions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_agent_run_id"],
            ["agent_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_id",
            name="uq_interview_candidate_question_exchanges_question",
        ),
        sa.UniqueConstraint(
            "source_agent_run_id",
            name="uq_interview_candidate_question_exchanges_source_run",
        ),
    )
    op.create_index(
        op.f("ix_interview_candidate_question_exchanges_session_id"),
        "interview_candidate_question_exchanges",
        ["session_id"],
        unique=False,
    )

    op.create_table(
        "interview_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("source_agent_run_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("review", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("question_details", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('unavailable', 'partial', 'complete')",
            name="ck_interview_reviews_status",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_agent_run_id"],
            ["agent_runs.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            name="uq_interview_reviews_session",
        ),
        sa.UniqueConstraint(
            "source_agent_run_id",
            name="uq_interview_reviews_source_run",
        ),
    )
    op.create_index(
        op.f("ix_interview_reviews_session_id"),
        "interview_reviews",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_interview_reviews_source_agent_run_id"),
        "interview_reviews",
        ["source_agent_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_interview_reviews_source_agent_run_id"),
        table_name="interview_reviews",
    )
    op.drop_index(
        op.f("ix_interview_reviews_session_id"),
        table_name="interview_reviews",
    )
    op.drop_table("interview_reviews")

    op.drop_index(
        op.f("ix_interview_candidate_question_exchanges_session_id"),
        table_name="interview_candidate_question_exchanges",
    )
    op.drop_table("interview_candidate_question_exchanges")

    op.drop_index(
        op.f("ix_interview_candidate_questions_session_id"),
        table_name="interview_candidate_questions",
    )
    op.drop_table("interview_candidate_questions")

    op.drop_index(
        op.f("ix_interview_sessions_review_run_id"),
        table_name="interview_sessions",
    )
    op.drop_constraint(
        "fk_interview_sessions_review_run",
        "interview_sessions",
        type_="foreignkey",
    )
    op.drop_column("interview_sessions", "review_run_id")
    op.drop_index(
        op.f("ix_interview_sessions_candidate_answer_run_id"),
        table_name="interview_sessions",
    )
    op.drop_constraint(
        "fk_interview_sessions_candidate_answer_run",
        "interview_sessions",
        type_="foreignkey",
    )
    op.drop_column("interview_sessions", "candidate_answer_run_id")
