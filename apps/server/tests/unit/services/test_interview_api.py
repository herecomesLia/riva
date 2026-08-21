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


def session(
    *,
    status: str,
    planning_status=None,
    turn_status=None,
    questions=None,
):
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
        total_main_questions=(
            3
            if status
            in {"question", "generatingTurn", "followUp", "candidateQuestions"}
            else None
        ),
        plan_revision=(
            1
            if status
            in {"question", "generatingTurn", "followUp", "candidateQuestions"}
            else 0
        ),
        planning_run=(
            None if planning_status is None else SimpleNamespace(status=planning_status)
        ),
        turn_run=(None if turn_status is None else SimpleNamespace(status=turn_status)),
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


def test_get_page_serializes_generating_turn_without_exposing_assessment() -> None:
    question_id = uuid4()
    active = session(
        status="generatingTurn",
        turn_status=AgentRunStatus.FAILED,
        questions=[
            SimpleNamespace(
                id=question_id,
                prompt="Describe a production trade-off.",
                question_type="projectDeepDive",
                assessed_capabilities=["Ownership"],
                order=1,
                completed_at=None,
                answer=SimpleNamespace(
                    id=uuid4(),
                    content="I chose a staged rollout.",
                    submitted_at=NOW,
                ),
                follow_up_questions=[],
            )
        ],
    )

    response = build_interview_page_response(
        setup_context(active.target_role_id),
        active,
    )

    assert response.session is not None
    assert response.session.status == "generatingTurn"
    assert response.session.generation_status.value == "failed"
    assert response.session.current_question.question.id == question_id
    assert response.session.current_question.answer.content == (
        "I chose a staged rollout."
    )
    assert response.session.current_question.answered_follow_ups == []
    assert not hasattr(response.session, "assessment")


def test_get_page_serializes_follow_up_and_candidate_question_history() -> None:
    question_id = uuid4()
    follow_up_id = uuid4()
    main_answer = SimpleNamespace(
        id=uuid4(),
        content="I chose a staged rollout.",
        submitted_at=NOW,
    )
    follow_up = SimpleNamespace(
        id=follow_up_id,
        parent_question_id=question_id,
        prompt="What signal supported that choice?",
        order=1,
        created_at=NOW,
        answer=SimpleNamespace(
            id=uuid4(),
            content="The error rate remained stable.",
            submitted_at=NOW,
        ),
    )
    pending_follow_up = SimpleNamespace(
        id=uuid4(),
        parent_question_id=question_id,
        prompt="What would make you roll it back?",
        order=2,
        created_at=NOW,
        answer=None,
    )
    current_question = SimpleNamespace(
        id=question_id,
        prompt="Describe a production trade-off.",
        question_type="projectDeepDive",
        assessed_capabilities=["Ownership"],
        order=1,
        completed_at=None,
        answer=main_answer,
        follow_up_questions=[follow_up, pending_follow_up],
    )
    follow_up_session = session(
        status="followUp",
        questions=[current_question],
    )
    follow_up_session.turn_run = None

    follow_up_response = build_interview_page_response(
        setup_context(follow_up_session.target_role_id),
        follow_up_session,
    )
    assert follow_up_response.session is not None
    assert follow_up_response.session.status == "followUp"
    assert (
        follow_up_response.session.current_follow_up.question.id == pending_follow_up.id
    )
    assert len(follow_up_response.session.current_question.answered_follow_ups) == 1

    completed_question = SimpleNamespace(
        **{**current_question.__dict__, "completed_at": NOW}
    )
    candidate_session = session(
        status="candidateQuestions",
        questions=[completed_question],
    )
    candidate_response = build_interview_page_response(
        setup_context(candidate_session.target_role_id),
        candidate_session,
    )
    assert candidate_response.session is not None
    assert candidate_response.session.status == "candidateQuestions"
    assert len(candidate_response.session.completed_questions) == 1
    assert candidate_response.session.completed_questions[0].follow_ups[
        0
    ].answer.content == ("The error rate remained stable.")
    assert candidate_response.session.exchanges == []
