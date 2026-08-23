import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.agents.job_description_parsing import JobDescriptionParsingAgent
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    JobDescriptionAnalysis,
    TargetRole,
)
from riva.schemas.roles import UpdateTargetRoleRequest
from riva.services.roles import TargetRoleService, career_profile_completed


def profile(*, has_skills: bool, has_section: bool) -> CareerProfile:
    value = CareerProfile(profile_id=uuid4(), user_id=uuid4(), version=1)
    if has_skills:
        value.skills = [
            CareerProfileSkill(
                id=uuid4(),
                position=0,
                name="Python",
                normalized_name="python",
                source="userAdded",
            )
        ]
    if has_section:
        value.education = [
            CareerProfileEducation(
                id=uuid4(),
                position=0,
                school="University",
                start_date="2020-01",
                end_date="2024-01",
                is_current=False,
                source="userAdded",
            )
        ]
    return value


@pytest.mark.parametrize(
    "has_skills,has_section,expected",
    [
        (False, False, False),
        (False, True, False),
        (True, False, True),
        (True, True, True),
    ],
)
def test_profile_completed_is_a_pure_aggregate_rule(
    has_skills: bool,
    has_section: bool,
    expected: bool,
) -> None:
    value = profile(has_skills=has_skills, has_section=has_section)

    assert career_profile_completed(value) is expected
    assert "completed" not in CareerProfile.__table__.c


@pytest.mark.parametrize(
    "status,raw_text,jd_version",
    [
        ("missing", None, None),
        ("saved", "Build APIs.", 2),
    ],
)
def test_role_response_maps_database_jd_without_ai_analysis(
    status: str,
    raw_text: str | None,
    jd_version: int | None,
) -> None:
    now = datetime(2026, 7, 29, tzinfo=UTC)
    role = TargetRole(
        id=uuid4(),
        user_id=uuid4(),
        title="Backend Engineer",
        company=None,
        recruitment_type=None,
        location=None,
        min_experience_years=None,
        max_experience_years=5,
        preparation_status="preparing",
        job_description_status=status,
        raw_job_description=raw_text,
        job_description_version=jd_version,
        version=3,
        created_at=now,
        updated_at=now,
    )

    response = TargetRoleService._role_response(role)

    assert response.experience_range is not None
    assert response.experience_range.min_years is None
    assert response.experience_range.max_years == 5
    assert response.job_description.status == status
    assert response.job_description_analysis is None
    assert response.matching_analysis is None


def parsing_run(role: TargetRole, status: AgentRunStatus) -> AgentRun:
    prompt = JobDescriptionParsingAgent
    run = AgentRun(
        id=uuid4(),
        user_id=role.user_id,
        agent_id="job-description-parser",
        prompt_id=prompt.agent_id,
        prompt_version=prompt.agent_version,
        output_schema_id=prompt.output_schema_id,
        status=status,
        payload={
            "roleId": str(role.id),
            "jobDescriptionVersion": role.job_description_version,
        },
        idempotency_key="safe-key",
        attempt_count=0,
        max_attempts=3,
        model="test-model",
    )
    role.job_description_parsing_run_id = run.id
    role.job_description_parsing_run = run
    return run


def saved_role() -> TargetRole:
    now = datetime(2026, 7, 29, tzinfo=UTC)
    return TargetRole(
        id=uuid4(),
        user_id=uuid4(),
        title="Backend Engineer",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build APIs.",
        job_description_version=2,
        version=3,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize(
    "run_status,expected",
    [
        (AgentRunStatus.QUEUED, "parsing"),
        (AgentRunStatus.RUNNING, "parsing"),
        (AgentRunStatus.FAILED, "failed"),
        (AgentRunStatus.SUCCEEDED, "saved"),
    ],
)
def test_role_response_projects_valid_current_run(
    run_status: AgentRunStatus, expected: str
) -> None:
    role = saved_role()
    parsing_run(role, run_status)

    response = TargetRoleService._role_response(role)

    assert response.job_description.status == expected
    if expected == "failed":
        assert response.job_description.parsing_failure_reason == (
            "Job description parsing failed. Please review the text and try again."
        )


def test_role_response_rejects_stale_or_wrong_contract_run_projection() -> None:
    role = saved_role()
    run = parsing_run(role, AgentRunStatus.QUEUED)
    run.payload["jobDescriptionVersion"] = 1
    assert TargetRoleService._role_response(role).job_description.status == "saved"

    run.payload["jobDescriptionVersion"] = 2
    run.prompt_version = "1"
    assert TargetRoleService._role_response(role).job_description.status == "saved"

    run.prompt_version = "2"
    assert TargetRoleService._role_response(role).job_description.status == "parsing"

    run.prompt_version = JobDescriptionParsingAgent.agent_version
    run.output_schema_id = "wrong-schema"
    assert TargetRoleService._role_response(role).job_description.status == "saved"


def test_role_response_projects_current_analysis_as_ready_with_all_fields() -> None:
    role = saved_role()
    parsing_run(role, AgentRunStatus.FAILED)
    role.job_description_analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=role.user_id,
        job_description_version=2,
        analysis_version=1,
        source_agent_run_id=uuid4(),
        parsed_at=datetime(2026, 7, 29, 1, tzinfo=UTC),
        riva_summary="Build reliable APIs.",
        responsibilities=["Design APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": ["2026 graduates"],
            "majors": [],
            "experience": [],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": ["PostgreSQL"],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=["Communication"],
        business_domains=["Payments"],
    )

    response = TargetRoleService._role_response(role)

    assert response.job_description.status == "ready"
    assert response.job_description_analysis is not None
    assert response.job_description_analysis.required_skills.programming_languages == [
        "Python"
    ]
    assert (
        response.job_description_analysis.qualification_requirements.graduation_cohorts
        == ["2026 graduates"]
    )


class RollbackSession:
    def __init__(self) -> None:
        self.rollback_count = 0

    async def rollback(self) -> None:
        self.rollback_count += 1


class FailingService(TargetRoleService):
    def __init__(self, session, role: TargetRole) -> None:
        super().__init__(session)
        self.role = role

    async def _locked_role(self, user_id, role_id):
        return self.role

    async def _commit_page(self, user_id):
        raise RuntimeError("forced response failure")


def test_mutation_rolls_back_when_response_building_fails() -> None:
    owner_id = uuid4()
    role = TargetRole(
        id=uuid4(),
        user_id=owner_id,
        title="Original",
        preparation_status="preparing",
        job_description_status="missing",
        version=1,
    )
    session = RollbackSession()
    service = FailingService(session, role)  # type: ignore[arg-type]
    payload = UpdateTargetRoleRequest.model_validate(
        {
            "version": 1,
            "title": "Changed",
            "company": None,
            "recruitmentType": None,
            "location": None,
            "experienceRange": None,
        }
    )

    with pytest.raises(RuntimeError, match="forced response failure"):
        asyncio.run(
            service.update_role(
                SimpleNamespace(id=owner_id),
                role.id,
                payload,
            )
        )

    assert session.rollback_count == 1
