"""Remove AgentRun persistence and orchestration lineage."""

from alembic import op

revision: str = "202608230003"
down_revision: str | None = "202608200007"
branch_labels: str | None = None
depends_on: str | None = None


def _drop_columns(table_name: str, *columns: str) -> None:
    with op.batch_alter_table(table_name) as batch_op:
        for column in columns:
            batch_op.drop_column(column)


def _drop_unique_constraints(table_name: str, *constraint_names: str) -> None:
    with op.batch_alter_table(table_name) as batch_op:
        for constraint_name in constraint_names:
            batch_op.drop_constraint(constraint_name, type_="unique")


def upgrade() -> None:
    op.execute(
        "DELETE FROM job_description_import_drafts "
        "WHERE status IN ('parsing', 'failed')"
    )
    with op.batch_alter_table("job_description_import_drafts") as batch_op:
        batch_op.drop_constraint(
            "ck_job_description_import_drafts_status",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_job_description_import_drafts_failure_not_blank",
            type_="check",
        )
        batch_op.drop_column("failure_reason")
        batch_op.create_check_constraint(
            "ck_job_description_import_drafts_status",
            "status IN ('ready', 'applied')",
        )
    op.drop_index(
        op.f("ix_resume_documents_parsing_run_id"),
        table_name="resume_documents",
    )
    _drop_columns("resume_documents", "parsing_run_id")
    op.drop_index(
        op.f("ix_target_roles_job_description_parsing_run_id"),
        table_name="target_roles",
    )
    op.drop_index(
        op.f("ix_target_roles_matching_analysis_run_id"),
        table_name="target_roles",
    )
    _drop_columns(
        "target_roles",
        "job_description_parsing_run_id",
        "matching_analysis_run_id",
    )
    _drop_unique_constraints(
        "job_description_analyses",
        "uq_job_description_analyses_source_run",
    )
    _drop_columns("job_description_analyses", "source_agent_run_id")
    _drop_unique_constraints(
        "matching_analyses",
        "uq_matching_analyses_source_run",
    )
    _drop_columns("matching_analyses", "source_agent_run_id")
    op.drop_index(
        op.f("ix_question_cards_matching_analysis_run_id"),
        table_name="question_cards",
    )
    _drop_unique_constraints("question_cards", "uq_question_cards_source_run")
    _drop_columns(
        "question_cards",
        "source_agent_run_id",
        "matching_analysis_run_id",
    )
    _drop_unique_constraints(
        "resume_parsing_results",
        "uq_resume_parsing_results_source_run",
    )
    _drop_columns("resume_parsing_results", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_attempts",
        "uq_practice_attempts_question_generation_run",
    )
    _drop_columns("practice_attempts", "question_generation_run_id")
    _drop_unique_constraints(
        "resume_import_drafts",
        "uq_resume_import_drafts_source_run",
    )
    _drop_columns("resume_import_drafts", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_evaluations",
        "uq_practice_evaluations_source_run",
    )
    _drop_columns("practice_evaluations", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_follow_up_questions",
        "uq_practice_follow_up_questions_source_run",
    )
    _drop_columns("practice_follow_up_questions", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_recommendations",
        "uq_practice_recommendations_source_run",
    )
    _drop_columns("practice_recommendations", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_reviews",
        "uq_practice_reviews_source_run",
    )
    _drop_columns("practice_reviews", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_follow_up_decisions",
        "uq_practice_follow_up_decisions_source_run",
    )
    _drop_columns("practice_follow_up_decisions", "source_agent_run_id")
    _drop_unique_constraints(
        "practice_reference_answers",
        "uq_practice_reference_answers_source_run",
    )
    _drop_columns("practice_reference_answers", "source_agent_run_id")
    for index_name in (
        "ix_interview_sessions_planning_run_id",
        "ix_interview_sessions_turn_run_id",
        "ix_interview_sessions_candidate_answer_run_id",
        "ix_interview_sessions_review_run_id",
    ):
        op.drop_index(op.f(index_name), table_name="interview_sessions")
    for constraint_name in (
        "fk_interview_sessions_planning_run",
        "fk_interview_sessions_turn_run",
        "fk_interview_sessions_candidate_answer_run",
        "fk_interview_sessions_review_run",
    ):
        op.drop_constraint(
            constraint_name,
            "interview_sessions",
            type_="foreignkey",
        )
    _drop_columns(
        "interview_sessions",
        "planning_run_id",
        "turn_run_id",
        "candidate_answer_run_id",
        "review_run_id",
    )
    op.drop_index(
        op.f("ix_interview_plans_source_agent_run_id"),
        table_name="interview_plans",
    )
    _drop_columns("interview_plans", "source_agent_run_id")
    _drop_unique_constraints(
        "interview_follow_up_questions",
        "uq_interview_follow_up_questions_source_run",
    )
    _drop_columns("interview_follow_up_questions", "source_turn_run_id")
    _drop_unique_constraints(
        "interview_turn_assessments",
        "uq_interview_turn_assessments_source_run",
    )
    _drop_columns("interview_turn_assessments", "source_agent_run_id")
    _drop_unique_constraints(
        "interview_candidate_question_exchanges",
        "uq_interview_candidate_question_exchanges_source_run",
    )
    _drop_columns(
        "interview_candidate_question_exchanges",
        "source_agent_run_id",
    )
    op.drop_index(
        op.f("ix_interview_reviews_source_agent_run_id"),
        table_name="interview_reviews",
    )
    _drop_unique_constraints(
        "interview_reviews",
        "uq_interview_reviews_source_run",
    )
    _drop_columns("interview_reviews", "source_agent_run_id")
    _drop_unique_constraints(
        "job_description_import_drafts",
        "uq_job_description_import_drafts_agent_run",
    )
    _drop_columns("job_description_import_drafts", "agent_run_id")
    op.drop_table("agent_runs")


def downgrade() -> None:
    raise RuntimeError(
        "The AgentRun orchestration migration is irreversible because it removes "
        "persisted execution history."
    )
