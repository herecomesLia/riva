import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from riva.core.language import InteractionLanguage
from riva.schemas.question_cards import QuestionCardQuestionType
from riva.services.practice_weaknesses import (
    MAX_PRACTICE_WEAKNESS_FOCUS_ITEMS,
    PracticeWeaknessFocus,
    PracticeWeaknessService,
)

NOW = datetime(2026, 8, 12, 9, 0, tzinfo=UTC)


class _Result:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self.rows = rows

    def all(self) -> list[tuple[object, ...]]:
        return self.rows


class ScriptedSession:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self.rows = rows
        self.statement: Any | None = None

    async def execute(self, statement: Any) -> _Result:
        self.statement = statement
        return _Result(self.rows)


def row(
    *,
    attempt_id: UUID | None = None,
    role_id: UUID,
    question_type: QuestionCardQuestionType = (
        QuestionCardQuestionType.PROJECT_DEEP_DIVE
    ),
    reviewed_at: datetime = NOW,
    weaknesses: list[object] | None = None,
) -> tuple[object, ...]:
    return (
        attempt_id or uuid4(),
        role_id,
        question_type,
        reviewed_at,
        [] if weaknesses is None else weaknesses,
    )


def get_focus(
    rows: list[tuple[object, ...]],
    *,
    user_id: UUID | None = None,
    target_role_id: UUID,
    question_type: QuestionCardQuestionType = (
        QuestionCardQuestionType.PROJECT_DEEP_DIVE
    ),
    language: InteractionLanguage = "en",
) -> tuple[PracticeWeaknessFocus, ScriptedSession]:
    session = ScriptedSession(rows)
    focus = asyncio.run(
        PracticeWeaknessService(session).get_focus(
            user_id=user_id or uuid4(),
            target_role_id=target_role_id,
            question_type=question_type,
            interaction_language=language,
        )
    )
    return focus, session


def test_completed_reviewed_attempt_is_projected_with_provenance() -> None:
    user_id = uuid4()
    role_id = uuid4()
    attempt_id = uuid4()

    focus, _ = get_focus(
        [
            row(
                attempt_id=attempt_id,
                role_id=role_id,
                reviewed_at=NOW,
                weaknesses=["  Missing ownership evidence  "],
            )
        ],
        user_id=user_id,
        target_role_id=role_id,
    )

    assert len(focus.evidence) == 1
    evidence = focus.evidence[0]
    assert evidence.weakness == "Missing ownership evidence"
    assert evidence.source_attempt_id == attempt_id
    assert evidence.source_target_role_id == role_id
    assert evidence.source_question_type == QuestionCardQuestionType.PROJECT_DEEP_DIVE
    assert evidence.reviewed_at == NOW

    serialized = focus.model_dump(mode="json")
    assert serialized["evidence"][0]["source_attempt_id"] == str(attempt_id)


def test_completed_attempt_in_an_active_session_is_eligible() -> None:
    role_id = uuid4()
    focus, _ = get_focus(
        [row(role_id=role_id, weaknesses=["active-session weakness"])],
        target_role_id=role_id,
    )

    assert [item.weakness for item in focus.evidence] == ["active-session weakness"]


def test_eligibility_query_requires_completed_attempt_review_and_non_archived_role() -> (
    None
):
    focus, scripted = get_focus([], target_role_id=uuid4())

    assert focus.evidence == ()
    assert scripted.statement is not None
    sql = str(scripted.statement.compile()).lower()
    assert "practice_attempts.status" in sql
    assert "practice_attempts.completed_at is not null" in sql
    assert "practice_sessions.language" in sql
    assert "target_roles.preparation_status" in sql
    assert "practice_reviews" in sql
    assert "practice_sessions.status" not in sql


def test_eligibility_query_is_scoped_to_user_and_interaction_language() -> None:
    user_id = uuid4()
    focus, scripted = get_focus(
        [],
        user_id=user_id,
        target_role_id=uuid4(),
        language="zh-CN",
    )

    assert focus.evidence == ()
    assert scripted.statement is not None
    compiled = scripted.statement.compile()
    sql = str(compiled).lower()
    assert sql.count("user_id") >= 3
    assert "practice_sessions.language" in sql
    assert user_id in compiled.params.values()
    assert "zh-cn" in {str(value).lower() for value in compiled.params.values()}


def test_priority_is_same_role_and_type_then_same_role_then_other_role() -> None:
    target_role_id = uuid4()
    other_role_id = uuid4()
    requested_type = QuestionCardQuestionType.BEHAVIORAL
    focus, _ = get_focus(
        [
            row(
                attempt_id=UUID("00000000-0000-0000-0000-000000000003"),
                role_id=other_role_id,
                question_type=requested_type,
                reviewed_at=NOW + timedelta(minutes=30),
                weaknesses=["other role"],
            ),
            row(
                attempt_id=UUID("00000000-0000-0000-0000-000000000002"),
                role_id=target_role_id,
                question_type=QuestionCardQuestionType.TECHNICAL_FOUNDATION,
                reviewed_at=NOW + timedelta(minutes=20),
                weaknesses=["same role other type"],
            ),
            row(
                attempt_id=UUID("00000000-0000-0000-0000-000000000001"),
                role_id=target_role_id,
                question_type=requested_type,
                reviewed_at=NOW,
                weaknesses=["same role same type"],
            ),
        ],
        target_role_id=target_role_id,
        question_type=requested_type,
    )

    assert [item.weakness for item in focus.evidence] == [
        "same role same type",
        "same role other type",
        "other role",
    ]


def test_same_priority_is_ordered_by_reviewed_at_descending() -> None:
    role_id = uuid4()
    focus, _ = get_focus(
        [
            row(
                role_id=role_id,
                reviewed_at=NOW,
                weaknesses=["older"],
            ),
            row(
                role_id=role_id,
                reviewed_at=NOW + timedelta(minutes=1),
                weaknesses=["newer"],
            ),
        ],
        target_role_id=role_id,
    )

    assert [item.weakness for item in focus.evidence] == ["newer", "older"]


def test_weaknesses_are_trimmed_deduplicated_and_keep_first_text() -> None:
    role_id = uuid4()
    focus, _ = get_focus(
        [
            row(
                role_id=role_id,
                weaknesses=[
                    "  Ownership   evidence ",
                    "ownership evidence",
                    "\tClear communication\n",
                    "   ",
                ],
            ),
            row(
                role_id=role_id,
                reviewed_at=NOW - timedelta(minutes=1),
                weaknesses=["clear   communication", "Another weakness"],
            ),
        ],
        target_role_id=role_id,
    )

    assert [item.weakness for item in focus.evidence] == [
        "Ownership   evidence",
        "Clear communication",
        "Another weakness",
    ]


def test_focus_contains_at_most_eight_evidence_items() -> None:
    role_id = uuid4()
    focus, _ = get_focus(
        [
            row(
                role_id=role_id,
                weaknesses=[f"weakness-{index}" for index in range(12)],
            )
        ],
        target_role_id=role_id,
    )

    assert len(focus.evidence) == MAX_PRACTICE_WEAKNESS_FOCUS_ITEMS
    assert [item.weakness for item in focus.evidence] == [
        f"weakness-{index}" for index in range(8)
    ]


def test_empty_review_weakness_history_returns_empty_focus() -> None:
    focus, _ = get_focus([], target_role_id=uuid4())

    assert focus == PracticeWeaknessFocus()
    assert focus.evidence == ()
