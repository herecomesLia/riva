from datetime import UTC, datetime
from uuid import uuid4

import pytest

from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import MATCHING_ANALYSIS_PROMPT
from riva.schemas.roles import StartMatchingAnalysisRequest
from riva.services.roles import (
    MATCHING_FAILURE_REASON,
    TargetRoleService,
)

NOW = datetime(2026, 8, 4, 9, 30, tzinfo=UTC)


def graph() -> tuple[
    User,
    TargetRole,
    CareerProfile,
    JobDescriptionAnalysis,
    AgentRun,
    MatchingAnalysis,
]:
    owner = User(
        id=uuid4(),
        username="matching-projection",
        normalized_username="matching-projection",
        password_hash="hash",
        display_name="Matching Projection",
    )
    role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=2,
        version=7,
        created_at=NOW,
        updated_at=NOW,
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
                start_date="2020-01",
                end_date="2024-01",
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
    prompt = MATCHING_ANALYSIS_PROMPT
    run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="matching-analyzer",
        prompt_id=prompt.prompt_id,
        prompt_version=prompt.version,
        output_schema_id=prompt.output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload={
            "roleId": str(role.id),
            "profileId": str(profile.profile_id),
            "profileVersion": 3,
            "jobDescriptionVersion": 2,
            "jobDescriptionAnalysisVersion": 4,
        },
        idempotency_key="matching-projection-run",
        attempt_count=1,
        max_attempts=3,
        model="test-model",
    )
    role.matching_analysis_run_id = run.id
    role.matching_analysis_run = run
    jd_analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=owner.id,
        job_description_version=2,
        analysis_version=4,
        source_agent_run_id=uuid4(),
        parsed_at=NOW,
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
    role.job_description_analysis = jd_analysis
    matching = MatchingAnalysis(
        role_id=role.id,
        user_id=owner.id,
        profile_id=profile.profile_id,
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
        source_agent_run_id=run.id,
        generated_at=NOW,
        overall_match_score=0,
        core_requirements_summary="Build reliable APIs.",
        matched_capabilities=["Python"],
        missing_capabilities=[],
        underrepresented_capabilities=[],
        resume_highlights=[],
        resume_gaps=[],
        high_risk_questions=[],
        preparation_recommendations=[],
    )
    role.matching_analysis = matching
    return owner, role, profile, jd_analysis, run, matching


def test_role_projection_returns_current_result_and_copies_lists() -> None:
    _, role, profile, _, _, matching = graph()

    response = TargetRoleService._role_response(role, profile)

    assert response.matching_analysis is not None
    assert response.matching_analysis.status == "current"
    assert response.matching_analysis.result is not None
    assert response.matching_analysis.result.overall_match_score == 0
    assert response.job_description.status == "ready"
    assert response.job_description_analysis is not None
    assert response.matching_analysis.result.matched_capabilities == ["Python"]
    assert (
        response.matching_analysis.result.matched_capabilities
        is not matching.matched_capabilities
    )


def test_generating_and_failed_runs_hide_an_old_result() -> None:
    _, role, profile, analysis, run, _ = graph()

    run.status = AgentRunStatus.QUEUED
    generating = TargetRoleService._role_response(role, profile)
    assert generating.matching_analysis is not None
    assert generating.matching_analysis.status == "generating"
    assert generating.matching_analysis.result is None
    assert generating.matching_analysis.profile_version == 3

    run.status = AgentRunStatus.FAILED
    failed = TargetRoleService._role_response(role, profile)
    assert failed.matching_analysis is not None
    assert failed.matching_analysis.status == "failed"
    assert failed.matching_analysis.result is None
    assert failed.matching_analysis.generated_at is None
    assert failed.matching_analysis.failure_reason == MATCHING_FAILURE_REASON
    assert run.error_code is None
    assert analysis.analysis_version == 4


@pytest.mark.parametrize(
    "change",
    [
        "profile",
        "job_description",
        "analysis",
    ],
)
def test_dependency_changes_project_old_result_as_stale(change: str) -> None:
    _, role, profile, analysis, _, _ = graph()
    if change == "profile":
        profile.version = 4
    elif change == "job_description":
        role.job_description_version = 3
        role.job_description_analysis = None
    else:
        analysis.analysis_version = 5

    response = TargetRoleService._role_response(role, profile)

    assert response.matching_analysis is not None
    assert response.matching_analysis.status == "stale"
    assert response.matching_analysis.generated_at == NOW
    assert response.matching_analysis.result is not None


def test_invalid_run_is_ignored_and_succeeded_without_result_is_null() -> None:
    _, role, profile, analysis, run, matching = graph()
    run.prompt_id = "wrong-prompt"
    matching.source_agent_run_id = uuid4()
    ignored = TargetRoleService._role_response(role, profile)
    assert ignored.matching_analysis is not None
    assert ignored.matching_analysis.status == "current"

    role.matching_analysis = None
    role.matching_analysis_run = run
    run.prompt_id = MATCHING_ANALYSIS_PROMPT.prompt_id
    run.status = AgentRunStatus.SUCCEEDED
    no_result = TargetRoleService._role_response(role, profile)
    assert no_result.matching_analysis is None
    assert analysis.analysis_version == 4


def test_matching_request_schema_is_available_for_the_service_contract() -> None:
    request = StartMatchingAnalysisRequest.model_validate({"version": 7})
    assert request.version == 7
