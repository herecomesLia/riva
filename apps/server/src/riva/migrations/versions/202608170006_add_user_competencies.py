"""Add the user competency foundation and its evidence records."""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608170006"
down_revision: str | None = "202608160005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_competencies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("competency_key", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("level", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("trend", sa.String(length=16), nullable=False),
        sa.Column("last_evidence_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(trim(competency_key)) > 0 "
            "AND competency_key = lower(competency_key) "
            "AND competency_key ~ '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$'",
            name="ck_user_competencies_competency_key",
        ),
        sa.CheckConstraint(
            "level IS NULL OR (level >= 0 AND level <= 100)",
            name="ck_user_competencies_level",
        ),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 100",
            name="ck_user_competencies_confidence",
        ),
        sa.CheckConstraint(
            "evidence_count >= 0",
            name="ck_user_competencies_evidence_count",
        ),
        sa.CheckConstraint(
            "trend IN ('insufficient', 'improving', 'stable', 'declining')",
            name="ck_user_competencies_trend",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "competency_key",
            name="uq_user_competencies_user_key",
        ),
        sa.UniqueConstraint(
            "user_id",
            "id",
            name="uq_user_competencies_user_id_id",
        ),
    )
    op.create_index(
        op.f("ix_user_competencies_user_id"),
        "user_competencies",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "competency_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("competency_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_session_id", sa.Uuid(), nullable=False),
        sa.Column("source_entity_type", sa.String(length=32), nullable=False),
        sa.Column("source_entity_id", sa.Uuid(), nullable=False),
        sa.Column("signal_type", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.Column("details", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "("
            "source_type = 'practice' "
            "AND source_entity_type = 'practiceAttempt'"
            ") OR ("
            "source_type = 'interview' "
            "AND source_entity_type IN ('interviewTurn', 'interviewReview')"
            ")",
            name="ck_competency_evidence_source_type",
        ),
        sa.CheckConstraint(
            "signal_type IN ('score', 'weakness', 'strength')",
            name="ck_competency_evidence_signal_type",
        ),
        sa.CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_competency_evidence_score",
        ),
        sa.CheckConstraint(
            "("
            "signal_type = 'score' AND score IS NOT NULL"
            ") OR ("
            "signal_type IN ('weakness', 'strength') "
            "AND evidence_text IS NOT NULL "
            "AND length(trim(evidence_text)) > 0"
            ")",
            name="ck_competency_evidence_signal_payload",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "competency_id"],
            ["user_competencies.user_id", "user_competencies.id"],
            ondelete="CASCADE",
            name="fk_competency_evidence_competency_owner",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "competency_id",
            "source_entity_type",
            "source_entity_id",
            "signal_type",
            name="uq_competency_evidence_source_entity_signal",
        ),
    )
    op.create_index(
        op.f("ix_competency_evidence_user_id"),
        "competency_evidence",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_competency_evidence_competency_id"),
        "competency_evidence",
        ["competency_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_competency_evidence_competency_id"),
        table_name="competency_evidence",
    )
    op.drop_index(
        op.f("ix_competency_evidence_user_id"),
        table_name="competency_evidence",
    )
    op.drop_table("competency_evidence")

    op.drop_index(
        op.f("ix_user_competencies_user_id"),
        table_name="user_competencies",
    )
    op.drop_table("user_competencies")
