import asyncio
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_planning import InterviewPlanningOutput
from riva.schemas.training_memory import TrainingMemoryContext
from riva.services import interview_planning as planning_module
from riva.services.interview_planning import (
    INTERVIEW_PLANNING_VERSION_CONFLICT,
    InterviewPlanningService,
    InterviewPlanningStateError,
)
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)

NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(
        self, responses: list[object], *, flush_error: Exception | None = None
    ):
        self.responses = list(responses)
        self.flush_error = flush_error
        self.added: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0
        self.flush_count = 0

    async def scalar(self, _statement):
        return self.responses.pop(0)

    async def scalars(self, _statement):
        class EmptyResult:
            def all(self):
                return []

        return EmptyResult()

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.flush_count += 1
        if self.flush_error is not None:
            raise self.flush_error

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


def _profile(profile_id):
    return SimpleNamespace(
        profile_id=profile_id,
        version=4,
        summary="Backend engineer.",
        education=[
            SimpleNamespace(
                id=uuid4(),
                position=0,
                school="Tongji University",
                degree="Master",
                major="Computer Science",
                start_date="2018-09",
                end_date="2021-06",
                is_current=False,
            )
        ],
        work_experiences=[
            SimpleNamespace(
                id=uuid4(),
                position=0,
                company="Riva",
                title="Backend Engineer",
                employment_type="fullTime",
                location="Shanghai",
                start_date="2021-07",
                end_date=None,
                is_current=True,
                responsibilities=["Build APIs"],
                achievements=["Improved reliability"],
                skill_links=[],
            )
        ],
        project_experiences=[
            SimpleNamespace(
                id=uuid4(),
                position=0,
                name="Payment Platform",
                role="Developer",
                start_date="2023-01",
                end_date="2023-06",
                responsibilities=["Designed workflows"],
                achievements=["Shipped v1"],
                skill_links=[],
            )
        ],
        skills=[SimpleNamespace(id=uuid4(), position=0, name="Python")],
    )


def _role(role_id):
    analysis = SimpleNamespace(
        job_description_version=2,
        analysis_version=1,
        riva_summary="Build reliable APIs.",
        responsibilities=["Design APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": [],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": [],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": [],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=[],
        business_domains=[],
    )
    return SimpleNamespace(
        id=role_id,
        user_id=None,
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        version=3,
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=2,
        job_description_analysis=analysis,
        matching_analysis=None,
        matching_analysis_run=None,
        matching_analysis_run_id=None,
    )


def _session(user_id, role_id, *, status="opening", version=1, run_id=None):
    return SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role_id,
        language="en",
        version=version,
        status=status,
        round="technical",
        difficulty="pressure",
        duration_minutes=30,
        plan_revision=0,
        total_main_questions=None,
        planning_run_id=run_id,
        started_at=NOW,
    )


def _run(
    *,
    user_id,
    status=AgentRunStatus.QUEUED,
    run_id=None,
    payload=None,
    prompt_version="2",
):
    prompt = get_interview_planning_prompt(prompt_version)
    return AgentRun(
        id=run_id or uuid4(),
        user_id=user_id,
        agent_id="interview-planner",
        prompt_id="interview-planner",
        prompt_version=prompt_version,
        output_schema_id=prompt.output_schema_id,
        status=status,
        payload=payload or {},
        idempotency_key="interview-test",
        attempt_count=1 if status is not AgentRunStatus.QUEUED else 0,
        max_attempts=3,
        available_at=NOW,
        lease_owner="worker" if status is AgentRunStatus.RUNNING else None,
        lease_token=uuid4() if status is AgentRunStatus.RUNNING else None,
        lease_expires_at=NOW if status is AgentRunStatus.RUNNING else None,
        started_at=NOW if status is not AgentRunStatus.QUEUED else None,
        finished_at=NOW if status is AgentRunStatus.FAILED else None,
        error_code="provider_failed" if status is AgentRunStatus.FAILED else None,
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"ok": True} if status is AgentRunStatus.SUCCEEDED else None,
    )


class FakeAgentRunService:
    calls: list[dict[str, object]] = []
    next_run: AgentRun | None = None

    def __init__(self, _session) -> None:
        pass

    async def enqueue_in_transaction(self, **kwargs):
        self.calls.append(kwargs)
        assert self.next_run is not None
        self.next_run.payload = kwargs["payload"]
        return self.next_run


class FakeTrainingMemoryService:
    context = TrainingMemoryContext(
        focus_competencies=[
            {
                "competencyKey": "results_and_evidence",
                "displayName": "Results and Evidence",
                "level": 55,
                "confidence": 60,
                "trend": "stable",
                "evidenceCount": 4,
                "lastEvidenceAt": "2026-08-16T10:00:00Z",
            }
        ],
        established_competencies=[],
    )
    calls = 0

    def __init__(self, _session) -> None:
        pass

    async def get_context(self, _user_id):
        type(self).calls += 1
        return self.context


class ExplodingTrainingMemoryService:
    def __init__(self, _session) -> None:
        pass

    async def get_context(self, _user_id):
        raise AssertionError("retry must use the original memory snapshot")


def _output() -> InterviewPlanningOutput:
    return InterviewPlanningOutput.model_validate(
        {
            "totalMainQuestions": 3,
            "questions": [
                {
                    "order": order,
                    "questionType": "projectDeepDive",
                    "prompt": f"Describe project decision {order}.",
                    "assessedCapabilities": ["Ownership"],
                    "objective": "Verify contribution.",
                    "followUpDirections": ["Probe evidence."],
                    "scoringFocus": ["Evidence"],
                }
                for order in range(1, 4)
            ],
        }
    )


def test_begin_enqueues_snapshot_and_moves_opening_to_generating(monkeypatch) -> None:
    user_id = uuid4()
    role_id = uuid4()
    session = _session(user_id, role_id)
    role = _role(role_id)
    role.user_id = user_id
    run = _run(user_id=user_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = run
    FakeTrainingMemoryService.calls = 0
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    db = ScriptedSession([user_id, session, _profile(uuid4()), role])

    result = asyncio.run(
        InterviewPlanningService(
            db,
            llm_model="test-model",
            training_memory_service_factory=FakeTrainingMemoryService,
            clock=lambda: NOW,
        ).begin_questions(user_id=user_id, session_id=session.id, version=1)
    )

    assert result is session
    assert session.status == "generatingQuestion"
    assert session.version == 2
    assert session.planning_run_id == run.id
    assert db.commit_count == 1
    payload = FakeAgentRunService.calls[0]["payload"]
    assert payload["sessionId"] == str(session.id)
    assert payload["sessionVersion"] == 1
    assert "interviewPlanningInput" in payload
    assert payload["interviewPlanningInput"]["careerProfile"]["version"] == 4
    assert (
        payload["interviewPlanningInput"]["trainingMemory"]["focusCompetencies"][0][
            "competencyKey"
        ]
        == "results_and_evidence"
    )
    assert FakeTrainingMemoryService.calls == 1


def test_begin_rejects_version_conflict_without_enqueue(monkeypatch) -> None:
    user_id = uuid4()
    session = _session(user_id, uuid4(), version=2)
    FakeAgentRunService.calls = []
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    db = ScriptedSession([user_id, session])

    with pytest.raises(InterviewPlanningStateError) as error:
        asyncio.run(
            InterviewPlanningService(db, llm_model="test-model").begin_questions(
                user_id=user_id,
                session_id=session.id,
                version=1,
            )
        )

    assert error.value.code == INTERVIEW_PLANNING_VERSION_CONFLICT
    assert FakeAgentRunService.calls == []
    assert db.rollback_count == 1


@pytest.mark.parametrize("run_status", [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING])
def test_in_progress_begin_does_not_enqueue_a_second_run(
    monkeypatch,
    run_status: AgentRunStatus,
) -> None:
    user_id = uuid4()
    run = _run(user_id=user_id, status=run_status, prompt_version="1")
    session = _session(
        user_id, uuid4(), status="generatingQuestion", version=2, run_id=run.id
    )
    FakeAgentRunService.calls = []
    FakeTrainingMemoryService.calls = 0
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    db = ScriptedSession([user_id, session, run])

    result = asyncio.run(
        InterviewPlanningService(
            db,
            llm_model="test-model",
            training_memory_service_factory=FakeTrainingMemoryService,
        ).begin_questions(
            user_id=user_id,
            session_id=session.id,
            version=2,
        )
    )

    assert result is session
    assert FakeAgentRunService.calls == []
    assert FakeTrainingMemoryService.calls == 0
    assert db.commit_count == 1


def test_failed_planner_can_retry_with_a_new_idempotent_run(monkeypatch) -> None:
    user_id = uuid4()
    role_id = uuid4()
    failed_run = _run(user_id=user_id, status=AgentRunStatus.FAILED)
    session = _session(
        user_id,
        role_id,
        status="generatingQuestion",
        version=2,
        run_id=failed_run.id,
    )
    role = _role(role_id)
    role.user_id = user_id
    retry_run = _run(user_id=user_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = retry_run
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    db = ScriptedSession([user_id, session, failed_run, _profile(uuid4()), role])

    asyncio.run(
        InterviewPlanningService(db, llm_model="test-model").begin_questions(
            user_id=user_id,
            session_id=session.id,
            version=2,
        )
    )

    assert session.planning_run_id == retry_run.id
    assert session.version == 3
    assert FakeAgentRunService.calls[0]["idempotency_key"] == (
        f"interview-planner:{session.id}:v2"
    )


def test_failed_retry_reuses_memory_snapshot_without_requery(monkeypatch) -> None:
    user_id = uuid4()
    role_id = uuid4()
    session = _session(user_id, role_id)
    role = _role(role_id)
    role.user_id = user_id
    failed_run = _run(user_id=user_id, status=AgentRunStatus.QUEUED)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = failed_run
    FakeTrainingMemoryService.calls = 0
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)

    asyncio.run(
        InterviewPlanningService(
            ScriptedSession([user_id, session, _profile(uuid4()), role]),
            llm_model="test-model",
            training_memory_service_factory=FakeTrainingMemoryService,
        ).begin_questions(user_id=user_id, session_id=session.id, version=1)
    )
    original_memory = deepcopy(
        failed_run.payload["interviewPlanningInput"]["trainingMemory"]
    )
    failed_run.status = AgentRunStatus.FAILED
    session.status = "generatingQuestion"
    session.version = 2
    session.planning_run_id = failed_run.id

    retry_run = _run(user_id=user_id)
    FakeAgentRunService.next_run = retry_run
    asyncio.run(
        InterviewPlanningService(
            ScriptedSession([user_id, session, failed_run, _profile(uuid4()), role]),
            llm_model="test-model",
            training_memory_service_factory=ExplodingTrainingMemoryService,
        ).begin_questions(user_id=user_id, session_id=session.id, version=2)
    )

    assert (
        retry_run.payload["interviewPlanningInput"]["trainingMemory"] == original_memory
    )


def test_v1_snapshot_without_memory_is_accepted_and_unsupported_version_rejected(
    monkeypatch,
) -> None:
    user_id = uuid4()
    role_id = uuid4()
    session = _session(user_id, role_id)
    role = _role(role_id)
    role.user_id = user_id
    run = _run(user_id=user_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = run
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    original_service = InterviewPlanningService(
        ScriptedSession([user_id, session, _profile(uuid4()), role]),
        llm_model="test-model",
    )

    # Build a valid immutable snapshot through the same enqueue path used by
    # production, then emulate a persisted v1 payload from before memory.
    async def enqueue() -> None:
        nonlocal original_service
        await original_service.begin_questions(
            user_id=user_id, session_id=session.id, version=1
        )

    asyncio.run(enqueue())
    legacy_payload = deepcopy(run.payload)
    del legacy_payload["interviewPlanningInput"]["trainingMemory"]
    run.prompt_version = "1"
    run.payload = legacy_payload

    loaded = asyncio.run(
        InterviewPlanningService(ScriptedSession([])).load_planning_input(run)
    )
    assert loaded.training_memory.focus_competencies == []
    assert loaded.training_memory.established_competencies == []

    run.prompt_version = "99"
    with pytest.raises(InterviewPlanningStateError) as error:
        asyncio.run(
            InterviewPlanningService(ScriptedSession([])).load_planning_input(run)
        )
    assert error.value.code == "interview_planning_run_invalid"


def test_success_persists_plan_and_first_question_in_one_transaction(
    monkeypatch,
) -> None:
    user_id = uuid4()
    role_id = uuid4()
    session = _session(user_id, role_id)
    role = _role(role_id)
    role.user_id = user_id
    run = _run(user_id=user_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = run
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    enqueue_db = ScriptedSession([user_id, session, _profile(uuid4()), role])
    asyncio.run(
        InterviewPlanningService(enqueue_db, llm_model="test-model").begin_questions(
            user_id=user_id,
            session_id=session.id,
            version=1,
        )
    )
    run.status = AgentRunStatus.RUNNING

    persist_db = ScriptedSession([user_id, run, session, None])
    plan = asyncio.run(
        InterviewPlanningService(persist_db, clock=lambda: NOW).persist_success(
            run,
            _output(),
        )
    )

    assert plan.revision == 1
    assert plan.source_agent_run_id == run.id
    assert plan.total_main_questions == 3
    assert len(plan.questions) == 3
    assert len(persist_db.added) == 2
    first_question = persist_db.added[1]
    assert first_question.order == 1
    assert first_question.source_plan_id == plan.id
    assert session.status == "question"
    assert session.version == 3
    assert session.plan_revision == 1
    assert session.total_main_questions == 3
    assert persist_db.commit_count == 1


def test_persist_failure_rolls_back_before_a_question_is_committed(monkeypatch) -> None:
    user_id = uuid4()
    role_id = uuid4()
    session = _session(user_id, role_id)
    role = _role(role_id)
    role.user_id = user_id
    run = _run(user_id=user_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = run
    monkeypatch.setattr(planning_module, "AgentRunService", FakeAgentRunService)
    enqueue_db = ScriptedSession([user_id, session, _profile(uuid4()), role])
    asyncio.run(
        InterviewPlanningService(enqueue_db, llm_model="test-model").begin_questions(
            user_id=user_id,
            session_id=session.id,
            version=1,
        )
    )
    run.status = AgentRunStatus.RUNNING

    persist_db = ScriptedSession(
        [user_id, run, session, None],
        flush_error=RuntimeError("question insert failed"),
    )
    with pytest.raises(RuntimeError, match="question insert failed"):
        asyncio.run(
            InterviewPlanningService(persist_db).persist_success(run, _output())
        )

    assert len(persist_db.added) == 1
    assert persist_db.commit_count == 0
    assert persist_db.rollback_count == 1
    assert session.status == "generatingQuestion"
