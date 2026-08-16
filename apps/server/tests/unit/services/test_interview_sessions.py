import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.models import CurrentTargetRole, InterviewSession
from riva.schemas.interview import StartInterviewRequest
from riva.services.interview_sessions import (
    INTERVIEW_SESSION_ALREADY_ACTIVE,
    INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING,
    INTERVIEW_SETUP_PROFILE_INCOMPLETE,
    INTERVIEW_TARGET_ROLE_UNAVAILABLE,
    InterviewSessionService,
    InterviewSessionStateError,
)


NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


class ScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values


class ScriptedSession:
    def __init__(
        self,
        *,
        profile: object | None,
        roles: list[object],
        current_role_id: object | None,
        active: InterviewSession | None = None,
    ) -> None:
        self.profile = profile
        self.roles = roles
        self.current_role_id = current_role_id
        self.active = active
        self.added: list[object] = []
        self.commit_count = 0
        self.flush_count = 0
        self.rollback_count = 0
        self.executed = []

    async def scalar(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is InterviewSession:
            return self.active
        if entity is CurrentTargetRole:
            return self.current_role_id
        return self.profile

    async def scalars(self, statement):
        return ScalarResult(self.roles)

    async def execute(self, statement):
        self.executed.append(statement)

    def add(self, value: object) -> None:
        self.added.append(value)
        if isinstance(value, InterviewSession):
            self.active = value

    async def flush(self) -> None:
        self.flush_count += 1

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


def role(
    *,
    role_id=None,
    title="Backend Engineer",
    archived=False,
    ready=True,
):
    return SimpleNamespace(
        id=role_id or uuid4(),
        title=title,
        company="Riva",
        preparation_status="archived" if archived else "preparing",
        job_description_status="saved" if ready else "missing",
        raw_job_description="Build APIs." if ready else None,
        job_description_version=1 if ready else None,
        job_description_analysis=(
            SimpleNamespace(job_description_version=1) if ready else None
        ),
        created_at=NOW,
    )


def complete_profile():
    return SimpleNamespace(
        summary=None,
        skills=[SimpleNamespace(name="Python")],
        education=[object()],
        work_experiences=[object()],
        project_experiences=[object()],
    )


def configuration(role_id):
    return StartInterviewRequest(
        target_role_id=role_id,
        round="technical",
        difficulty="pressure",
        duration_minutes=30,
    )


def test_setup_filters_archived_and_requires_current_jd_analysis() -> None:
    ready = role()
    archived = role(archived=True)
    missing_jd = role(ready=False)
    session = ScriptedSession(
        profile=complete_profile(),
        roles=[ready, archived, missing_jd],
        current_role_id=ready.id,
    )

    setup = asyncio.run(InterviewSessionService(session).get_setup(user_id=uuid4()))

    assert [item.id for item in setup.target_roles] == [ready.id]
    assert setup.blocked_reason is None
    assert setup.current_target_role_id == ready.id


@pytest.mark.parametrize(
    "missing_section",
    ["education", "work_experiences", "project_experiences", "skills"],
)
def test_setup_reports_profile_incomplete_when_section_is_missing(
    missing_section: str,
) -> None:
    target_role_id = uuid4()
    profile = complete_profile()
    setattr(profile, missing_section, [])
    session = ScriptedSession(
        profile=profile,
        roles=[role(role_id=target_role_id)],
        current_role_id=target_role_id,
    )

    setup = asyncio.run(InterviewSessionService(session).get_setup(user_id=uuid4()))

    assert setup.blocked_reason == "profileIncomplete"


def test_profile_with_no_summary_can_be_fully_complete() -> None:
    target_role = role()
    session = ScriptedSession(
        profile=complete_profile(),
        roles=[target_role],
        current_role_id=target_role.id,
    )

    setup = asyncio.run(InterviewSessionService(session).get_setup(user_id=uuid4()))

    assert setup.profile_complete is True
    assert setup.blocked_reason is None


def test_setup_reports_job_description_missing_for_complete_profile() -> None:
    session = ScriptedSession(
        profile=complete_profile(),
        roles=[role(ready=False)],
        current_role_id=None,
    )

    setup = asyncio.run(InterviewSessionService(session).get_setup(user_id=uuid4()))

    assert setup.blocked_reason == "jobDescriptionMissing"
    assert setup.target_roles == ()


def test_start_uses_validated_role_and_defaults() -> None:
    target_role = role()
    user_id = uuid4()
    session = ScriptedSession(
        profile=complete_profile(),
        roles=[target_role],
        current_role_id=target_role.id,
    )

    started = asyncio.run(
        InterviewSessionService(
            session,
            clock=lambda: NOW,
        ).start_session(
            user_id=user_id,
            configuration=configuration(target_role.id),
            interaction_language="en",
        )
    )

    assert started.user_id == user_id
    assert started.target_role_id == target_role.id
    assert started.status == "opening"
    assert started.version == 1
    assert started.round == "technical"
    assert started.difficulty == "pressure"
    assert started.duration_minutes == 30
    assert started.language == "en"
    assert started.plan_revision == 0
    assert started.total_main_questions is None
    assert started.started_at == NOW
    assert session.commit_count == 1


@pytest.mark.parametrize(
    ("blocked_reason", "expected"),
    [
        ("profileIncomplete", INTERVIEW_SETUP_PROFILE_INCOMPLETE),
        ("jobDescriptionMissing", INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING),
    ],
)
def test_start_rejects_unavailable_setup(blocked_reason, expected) -> None:
    target_role = role(ready=blocked_reason != "jobDescriptionMissing")
    profile = (
        complete_profile()
        if blocked_reason != "profileIncomplete"
        else SimpleNamespace(
            skills=[], education=[], work_experiences=[], project_experiences=[]
        )
    )
    session = ScriptedSession(
        profile=profile,
        roles=[target_role],
        current_role_id=target_role.id,
    )

    with pytest.raises(InterviewSessionStateError) as error:
        asyncio.run(
            InterviewSessionService(session).start_session(
                user_id=uuid4(),
                configuration=configuration(target_role.id),
                interaction_language="zh-CN",
            )
        )

    assert error.value.code == expected
    assert session.added == []


def test_same_intent_replays_active_session_and_other_intent_conflicts() -> None:
    target_role_id = uuid4()
    active = InterviewSession(
        id=uuid4(),
        user_id=uuid4(),
        target_role_id=target_role_id,
        language="zh-CN",
        version=1,
        status="opening",
        round="technical",
        difficulty="pressure",
        duration_minutes=30,
        started_at=NOW,
        created_at=NOW,
        updated_at=NOW,
        plan_revision=0,
    )
    session = ScriptedSession(
        profile=None,
        roles=[],
        current_role_id=None,
        active=active,
    )
    service = InterviewSessionService(session)

    replay = asyncio.run(
        service.start_session(
            user_id=active.user_id,
            configuration=configuration(target_role_id),
            interaction_language="zh-CN",
        )
    )
    assert replay is active
    assert session.added == []

    with pytest.raises(InterviewSessionStateError) as error:
        asyncio.run(
            service.start_session(
                user_id=active.user_id,
                configuration=StartInterviewRequest(
                    target_role_id=target_role_id,
                    round="hr",
                    difficulty="pressure",
                    duration_minutes=30,
                ),
                interaction_language="zh-CN",
            )
        )
    assert error.value.code == INTERVIEW_SESSION_ALREADY_ACTIVE


def test_start_rejects_role_outside_eligible_user_setup() -> None:
    eligible_role = role()
    requested_role_id = uuid4()
    session = ScriptedSession(
        profile=complete_profile(),
        roles=[eligible_role],
        current_role_id=eligible_role.id,
    )

    with pytest.raises(InterviewSessionStateError) as error:
        asyncio.run(
            InterviewSessionService(session).start_session(
                user_id=uuid4(),
                configuration=configuration(requested_role_id),
                interaction_language="zh-CN",
            )
        )
    assert error.value.code == INTERVIEW_TARGET_ROLE_UNAVAILABLE
