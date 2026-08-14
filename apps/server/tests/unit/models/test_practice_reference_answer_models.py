from sqlalchemy import CheckConstraint, Index, JSON, Text, UniqueConstraint
from sqlalchemy.sql.sqltypes import Uuid

from riva.db import Base
from riva.db.database import load_models
from riva.models import (
    AgentRun,
    PracticeFollowUpQuestion,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)


def test_reference_context_table_has_one_to_one_frozen_json() -> None:
    load_models()

    table = PracticeQuestionReferenceContext.__table__
    assert table.name == "practice_question_reference_contexts"
    assert table.c.question_card_id.primary_key is True
    assert table.c.question_card_id.nullable is False
    assert table.c.frozen_context.nullable is False
    assert isinstance(table.c.frozen_context.type, JSON)
    assert table.c.created_at.nullable is False
    assert table.c.created_at.type.timezone is True

    foreign_key = next(iter(table.c.question_card_id.foreign_keys))
    assert foreign_key.target_fullname == "question_cards.id"
    assert foreign_key.ondelete == "CASCADE"
    assert PracticeQuestionReferenceContext.question_card.property.uselist is False


def test_reference_answer_artifact_has_target_constraints_and_indexes() -> None:
    load_models()

    table = PracticeReferenceAnswerArtifact.__table__
    assert table.name == "practice_reference_answers"
    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.question_card_id.nullable is False
    assert table.c.follow_up_question_id.nullable is True
    assert table.c.source_agent_run_id.nullable is False
    assert table.c.target_type.nullable is False
    assert table.c.kind.nullable is False
    assert isinstance(table.c.addressed_gap.type, Text)
    assert table.c.addressed_gap.nullable is True
    assert isinstance(table.c.answer.type, Text)
    assert table.c.answer.nullable is False
    for name in ("key_points", "common_mistakes"):
        assert isinstance(table.c[name].type, JSON)
        assert table.c[name].nullable is False
    assert table.c.generated_at.nullable is False
    assert table.c.generated_at.type.timezone is True

    foreign_keys = {
        name: next(iter(table.c[name].foreign_keys))
        for name in (
            "question_card_id",
            "follow_up_question_id",
            "source_agent_run_id",
        )
    }
    assert foreign_keys["question_card_id"].target_fullname == "question_cards.id"
    assert foreign_keys["follow_up_question_id"].target_fullname == (
        "practice_follow_up_questions.id"
    )
    assert foreign_keys["source_agent_run_id"].target_fullname == "agent_runs.id"
    assert all(foreign_key.ondelete == "CASCADE" for foreign_key in foreign_keys.values())

    unique_source = next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_practice_reference_answers_source_run"
    )
    assert [column.name for column in unique_source.columns] == [
        "source_agent_run_id"
    ]

    checks = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    ]
    target_check = next(
        constraint
        for constraint in checks
        if constraint.name == "ck_practice_reference_answers_target_kind"
    )
    assert "target_type = 'main'" in str(target_check.sqltext)
    assert "target_type = 'followUp'" in str(target_check.sqltext)
    assert "addressed_gap IS NULL" in str(target_check.sqltext)
    assert "addressed_gap IS NOT NULL" in str(target_check.sqltext)

    indexes = {
        index.name: index
        for index in table.indexes
        if isinstance(index, Index)
    }
    main_index = indexes["uq_practice_reference_answers_main_target"]
    follow_up_index = indexes["uq_practice_reference_answers_follow_up_target"]
    assert main_index.unique is True
    assert follow_up_index.unique is True
    assert main_index.dialect_options["postgresql"]["where"].text == (
        "target_type = 'main'"
    )
    assert follow_up_index.dialect_options["postgresql"]["where"].text == (
        "target_type = 'followUp'"
    )

    assert table.c.question_card_id.references(QuestionCard.__table__.c.id)
    assert table.c.follow_up_question_id.references(
        PracticeFollowUpQuestion.__table__.c.id
    )
    assert table.c.source_agent_run_id.references(AgentRun.__table__.c.id)
