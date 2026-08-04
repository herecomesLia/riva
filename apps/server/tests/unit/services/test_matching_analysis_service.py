import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import MATCHING_ANALYSIS_PROMPT_V1
from riva.schemas.matching_analysis import MatchingAnalysisOutput
from riva.services.matching_analyses import (
    INVALID_MATCHING_ANALYSIS_RUN,
    MatchingAnalysisService,
    MatchingAnalysisStateError,
)


NOW = datetime(2026, 8, 4, 9, 30, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


def matching_output(score: int = 87) -> MatchingAnalysisOutput:
    return MatchingAnalysisOutput(
        overall_match_score=score,
        core_requirements_summary="Build reliable APIs.",
        matched_capabilities=["Python"],
        missing_capabilities=["Kubernetes"],
        underrepresented_capabilities=["Scale"],
        resume_highlights=["Improved reliability"],
        resume_gaps=["Scale is not stated"],
        high_risk_questions=["How did you improve reliability?"],
        preparation_recommendations=["Prepare an example."],
    )


def graph() -> tuple[User, TargetRole, CareerProfile, JobDescriptionAnalysis, AgentRun]:
    owner = User(
        id=uuid4(),
        username="matching-service-unit",
        normalized_username="matching-service-unit",
        password_hash="hash",
        display_name="Matching Service Unit",
    )
    role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Backend Engineer",
        company="Riva",
        job_description_status="saved",
        raw_job_description="Build APIs.",
        job_description_version=2,
        version=10,
    )
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=owner.id,
        summary="Backend engineer",
        version=3,
        education=[
            CareerProfileEducation(
                id=uuid4(),
                position=0,
                school="University",
                degree="Master",
                major="Computer Science",
                start_date="2018-09",
                end_date="2021-06",
                is_current=False,
            )
        ],
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                position=0,
                name="Python",
                normalized_name="python",
            )
        ],
    )
    run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id=MATCHING_ANALYSIS_PROMPT_V1.prompt_id,
        prompt_id=MATCHING_ANALYSIS_PROMPT_V1.prompt_id,
        prompt_version=MATCHING_ANALYSIS_PROMPT_V1.version,
        output_schema_id=MATCHING_ANALYSIS_PROMPT_V1.output_schema_id,
        payload={
            "roleId": str(role.id),
            "profileId": str(profile.profile_id),
            "profileVersion": 3,
            "jobDescriptionVersion": 2,
            "jobDescriptionAnalysisVersion": 4,
        },
        idempotency_key=f"matching-unit-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )
    role.matching_analysis_run_id = run.id
    analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=owner.id,
        job_description_version=2,
        analysis_version=4,
        source_agent_run_id=uuid4(),
        parsed_at=NOW,
        riva_summary="Build reliable APIs.",
        responsibilities=[],
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
    return owner, role, profile, analysis, run


def test_load_matching_input_commits_and_returns_only_pydantic_data() -> None:
    owner, role, profile, analysis, run = graph()
    session = ScriptedSession(role, profile, analysis)

    result = asyncio.run(MatchingAnalysisService(session).load_matching_input(run))

    assert result.job.role_title == "Backend Engineer"
    assert result.career_profile.skills == ["Python"]
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert all("FOR UPDATE" not in str(statement) for statement in session.statements)
    assert owner.id == role.user_id


def test_invalid_run_rolls_back_and_exposes_only_safe_matching_error() -> None:
    _, _, _, _, run = graph()
    run.prompt_id = "wrong-prompt"
    session = ScriptedSession()

    with pytest.raises(MatchingAnalysisStateError) as exc_info:
        asyncio.run(
            MatchingAnalysisService(session).load_matching_input(run)
        )

    assert exc_info.value.code == INVALID_MATCHING_ANALYSIS_RUN
    assert str(exc_info.value) == MatchingAnalysisStateError.safe_message
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_persist_locks_in_required_order_and_saves_initial_result() -> None:
    owner, role, profile, analysis, run = graph()
    session = ScriptedSession(owner.id, role, profile, analysis, None, None)

    persisted = asyncio.run(
        MatchingAnalysisService(session, clock=lambda: NOW).persist_success(
            run,
            matching_output(),
        )
    )

    assert persisted.role_id == role.id
    assert persisted.source_agent_run_id == run.id
    assert persisted.matched_capabilities == ["Python"]
    assert role.version == 11
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert all(
        "FOR UPDATE" in str(statement) for statement in session.statements[:5]
    )
    assert "FOR UPDATE" not in str(session.statements[5])


def test_idempotent_persist_does_not_call_clock_or_change_version() -> None:
    owner, role, profile, analysis, run = graph()
    existing = MatchingAnalysis(
        role_id=role.id,
        user_id=owner.id,
        profile_id=profile.profile_id,
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
        source_agent_run_id=run.id,
        generated_at=NOW,
        overall_match_score=87,
        core_requirements_summary="Original",
        matched_capabilities=["Original"],
        missing_capabilities=[],
        underrepresented_capabilities=[],
        resume_highlights=[],
        resume_gaps=[],
        high_risk_questions=[],
        preparation_recommendations=[],
    )
    session = ScriptedSession(owner.id, role, profile, analysis, existing)

    def fail_clock() -> datetime:
        raise AssertionError("idempotent path must not call clock")

    returned = asyncio.run(
        MatchingAnalysisService(session, clock=fail_clock).persist_success(
            run,
            matching_output(12),
        )
    )

    assert returned is existing
    assert existing.overall_match_score == 87
    assert role.version == 10
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_naive_clock_rolls_back_before_any_write() -> None:
    owner, role, profile, analysis, run = graph()
    session = ScriptedSession(owner.id, role, profile, analysis, None, None)

    with pytest.raises(ValueError, match="timezone-aware"):
        asyncio.run(
            MatchingAnalysisService(
                session,
                clock=lambda: datetime(2026, 8, 4, 9, 30),
            ).persist_success(run, matching_output())
        )

    assert session.added == []
    assert role.version == 10
    assert session.commit_count == 0
    assert session.rollback_count == 1
