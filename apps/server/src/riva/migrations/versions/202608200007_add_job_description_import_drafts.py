"""Add job description import drafts."""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608200007"
down_revision: str | None = "202608170006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "job_description_import_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("parsed_company", sa.String(length=255), nullable=True),
        sa.Column("parsed_title", sa.String(length=255), nullable=True),
        sa.Column("parsed_location", sa.String(length=255), nullable=True),
        sa.Column("parsed_description", sa.Text(), nullable=True),
        sa.Column("parsed_result", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("agent_run_id", sa.Uuid(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("applied_role_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('parsing', 'ready', 'failed', 'applied')",
            name="ck_job_description_import_drafts_status",
        ),
        sa.CheckConstraint(
            "length(trim(raw_text)) > 0",
            name="ck_job_description_import_drafts_raw_text_not_blank",
        ),
        sa.CheckConstraint(
            "parsed_title IS NULL OR length(trim(parsed_title)) > 0",
            name="ck_job_description_import_drafts_title_not_blank",
        ),
        sa.CheckConstraint(
            "failure_reason IS NULL OR length(trim(failure_reason)) > 0",
            name="ck_job_description_import_drafts_failure_not_blank",
        ),
        sa.ForeignKeyConstraint(
            ["agent_run_id"],
            ["agent_runs.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["applied_role_id"],
            ["target_roles.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "agent_run_id",
            name="uq_job_description_import_drafts_agent_run",
        ),
    )
    op.create_index(
        op.f("ix_job_description_import_drafts_user_id"),
        "job_description_import_drafts",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_job_description_import_drafts_user_status_updated_at",
        "job_description_import_drafts",
        ["user_id", "status", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_job_description_import_drafts_user_status_updated_at",
        table_name="job_description_import_drafts",
    )
    op.drop_index(
        op.f("ix_job_description_import_drafts_user_id"),
        table_name="job_description_import_drafts",
    )
    op.drop_table("job_description_import_drafts")
