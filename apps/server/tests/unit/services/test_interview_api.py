from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.models import AgentRunStatus
from riva.services.interview_api import (
    build_interview_page_response,
)
from riva.services.interview_sessions import InterviewSetupContext


NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


def setup_context(role_id):
    return InterviewSetupContext(
        target_roles=(
            SimpleNamespace(
                id=role_id,
                title="Backend Engineer",
                company="Riva",
            ),
        ),
        current_target_role_id=role_id,
        has_non_archived_role=True,
        profile_complete=True,
        blocked_reason=None,
    )


def session(*, status: str, planning_status=None, questions=None):
    role_id = uuid4()
    return SimpleNamespace(
        id=uuid4(),
        target_role_id=role_id,
        language="en",
        version=2 if status != "opening" else 1,
        status=status,
        round="technical",
        difficulty="pressure",
        duration_minutes=30,
        started_at=NOW,
        total_main_questions=3 if status == "question" else None,
        plan_revision=1 if status == "question" else 0,
        planning_run=(
            None
            if planning_status is None
            else SimpleNamespace(status=planning_status)
        ),
        questions=questions or [],
    )


def test_get_page_serializes_opening_without_plan_fields() -> None:
    active = session(status="opening")
    response = build_interview_page_response(
        setup_context(active.target_role_id),
        active,
    )

    assert response.session is not None
    assert response.session.status == "opening"
    assert response.session.progress.plan_revision == 0


@pytest.mark.parametrize(
    ("run_status", "expected"),
    [
        (AgentRunStatus.QUEUED, "generating"),
        (AgentRunStatus.RUNNING, "generating"),
        (AgentRunStatus.FAILED, "failed"),
    ],
)
def test_get_page_preserves_generation_status(run_status, expected: str) -> None:
    active = session(status="generatingQuestion", planning_status=run_status)
    response = build_interview_page_response(
        setup_context(active.target_role_id),
        active,
    )

    assert response.session is not None
    assert response.session.status == "generatingQuestion"
    assert response.session.generation_status.value == expected
    assert response.session.version == 2


def test_get_page_serializes_first_interview_question_contract() -> None:
    active = session(
        status="question",
        questions=[
            SimpleNamespace(
                id=uuid4(),
                prompt="Describe a real project trade-off.",
                question_type="projectDeepDive",
                assessed_capabilities=["Ownership", "Evidence"],
                order=1,
            )
        ],
    )
    response = build_interview_page_response(
        setup_context(active.target_role_id),
        active,
    )

    assert response.session is not None
    assert response.session.status == "question"
    assert response.session.progress.plan_revision == 1
    assert response.session.progress.total_main_questions == 3
    assert response.session.current_question.status == "awaitingAnswer"
    assert response.session.current_question.answer is None
    assert response.session.current_question.question.type.value == "projectDeepDive"
    assert response.session.current_question.question.order == 1
    assert response.session.completed_questions == []
