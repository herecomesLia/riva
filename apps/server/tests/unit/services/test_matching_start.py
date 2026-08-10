import asyncio
from typing import Any
from uuid import uuid4

import pytest

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import MATCHING_ANALYSIS_PROMPT
from riva.schemas.roles import (
    RolesPageResponse,
    StartMatchingAnalysisRequest,
)
from riva.services.roles import TargetRoleService
from tests.unit.services.test_matching_role_projection import graph


class RollbackSession:
    async def rollback(self) -> None:
        pass


class RecordingAgentRunService:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.created: AgentRun | None = None

    async def enqueue_in_transaction(self, **kwargs: Any) -> AgentRun:
        self.calls.append(kwargs)
        self.created = AgentRun(
            id=uuid4(),
            user_id=kwargs["user_id"],
            agent_id=kwargs["agent_id"],
            prompt_id=kwargs["prompt_id"],
            prompt_version=kwargs["prompt_version"],
            output_schema_id=kwargs["output_schema_id"],
            status=AgentRunStatus.QUEUED,
            payload=kwargs["payload"],
            idempotency_key=kwargs["idempotency_key"],
            attempt_count=0,
            max_attempts=kwargs["max_attempts"],
            model=kwargs["model"],
        )
        return self.created


class RecordingTargetRoleService(TargetRoleService):
    def __init__(self, owner, role, profile, analysis, run_service, **kwargs):
        super().__init__(
            RollbackSession(),
            agent_run_service_factory=lambda _session: run_service,
            **kwargs,
        )
        self.owner = owner
        self.role = role
        self.profile = profile
        self.analysis = analysis
        self.lock_order: list[str] = []
        self.commit_count = 0

    async def _lock_user(self, user_id):
        self.lock_order.append("user")

    async def _locked_role(self, user_id, role_id):
        self.lock_order.append("role")
        return self.role

    async def _locked_profile(self, user_id):
        self.lock_order.append("profile")
        return self.profile

    async def _locked_analysis(self, user_id, role_id):
        self.lock_order.append("job_description_analysis")
        return self.analysis

    async def _locked_matching_analysis(self, user_id, role_id):
        self.lock_order.append("matching_analysis")
        return self.role.matching_analysis

    async def _commit_page(self, user_id) -> RolesPageResponse:
        self.commit_count += 1
        return RolesPageResponse(
            roles=[self._role_response(self.role, self.profile)],
            current_role_id=None,
            profile_context={
                "exists": True,
                "version": self.profile.version,
                "completed": True,
            },
        )


def make_service(*, provider: str | None = "qwen", model: str | None = "test-model"):
    owner, role, profile, analysis, _run, _matching = graph()
    run_service = RecordingAgentRunService()
    service = RecordingTargetRoleService(
        owner,
        role,
        profile,
        analysis,
        run_service,
        llm_provider=provider,
        llm_model=model,
    )
    return owner, role, profile, analysis, run_service, service


def start(
    service: TargetRoleService,
    owner,
    role,
    interaction_language: InteractionLanguage = "zh-CN",
) -> RolesPageResponse:
    return asyncio.run(
        service.start_matching_analysis(
            owner,
            role.id,
            StartMatchingAnalysisRequest(version=role.version),
            interaction_language=interaction_language,
        )
    )


def test_start_creates_run_with_contract_payload_and_lock_order() -> None:
    owner, role, _profile, _analysis, run_service, service = make_service()
    role.matching_analysis = None
    role.matching_analysis_run = None
    role.matching_analysis_run_id = None

    page = start(service, owner, role, interaction_language="en")

    assert page.roles[0].matching_analysis is not None
    assert page.roles[0].matching_analysis.status == "generating"
    assert role.version == 8
    assert service.lock_order == [
        "user",
        "role",
        "profile",
        "job_description_analysis",
        "matching_analysis",
    ]
    assert len(run_service.calls) == 1
    call = run_service.calls[0]
    assert call["agent_id"] == "matching-analyzer"
    assert call["prompt_id"] == MATCHING_ANALYSIS_PROMPT.prompt_id
    assert call["prompt_version"] == "2"
    assert call["output_schema_id"] == MATCHING_ANALYSIS_PROMPT.output_schema_id
    assert call["model"] == "test-model"
    assert call["max_attempts"] == 3
    assert call["payload"] == {
        "roleId": str(role.id),
        "profileId": str(service.profile.profile_id),
        "profileVersion": 3,
        "jobDescriptionVersion": 2,
        "jobDescriptionAnalysisVersion": 4,
        "interactionLanguage": "en",
    }
    assert call["idempotency_key"] == (
        f"matching-analysis:{role.id}:{service.profile.profile_id}:3:2:4:7:en"
    )


def test_current_and_generating_are_no_ops_before_configuration_check() -> None:
    owner, role, _profile, _analysis, run_service, service = make_service(
        provider=None,
        model=None,
    )
    current = start(service, owner, role)
    assert current.roles[0].matching_analysis is not None
    assert current.roles[0].matching_analysis.status == "current"
    assert role.version == 7
    assert run_service.calls == []

    role.matching_analysis_run.status = AgentRunStatus.QUEUED
    generating = start(service, owner, role)
    assert generating.roles[0].matching_analysis is not None
    assert generating.roles[0].matching_analysis.status == "generating"
    assert role.version == 7
    assert run_service.calls == []


@pytest.mark.parametrize(
    "mutation",
    ["prompt_id", "profile_version"],
)
def test_current_result_with_invalid_run_is_no_op_before_configuration(
    mutation: str,
) -> None:
    owner, role, _profile, _analysis, run_service, service = make_service(
        provider=None,
        model=None,
    )
    run = role.matching_analysis_run
    assert run is not None
    pointer = role.matching_analysis_run_id
    version = role.version
    if mutation == "prompt_id":
        run.prompt_id = "invalid-matching-prompt"
    else:
        run.payload = {**run.payload, "profileVersion": 999}

    page = start(service, owner, role)

    projected = page.roles[0].matching_analysis
    assert projected is not None
    assert projected.status == "current"
    assert run_service.calls == []
    assert role.version == version
    assert role.matching_analysis_run_id == pointer


def test_failed_run_is_retried_and_succeeded_without_result_conflicts() -> None:
    owner, role, _profile, _analysis, run_service, service = make_service()
    role.matching_analysis_run.status = AgentRunStatus.FAILED
    role.version = 8
    old_run = role.matching_analysis_run

    retried = start(service, owner, role)

    assert retried.roles[0].matching_analysis is not None
    assert retried.roles[0].matching_analysis.status == "generating"
    assert role.version == 9
    assert len(run_service.calls) == 1
    assert run_service.calls[0]["idempotency_key"] == (
        f"matching-analysis:{role.id}:{service.profile.profile_id}:3:2:4:8:zh-CN"
    )
    assert old_run.status is AgentRunStatus.FAILED

    owner, role, _profile, _analysis, run_service, service = make_service()
    role.matching_analysis = None
    role.matching_analysis_run = role.matching_analysis_run
    with pytest.raises(APIError) as error:
        start(service, owner, role)
    assert error.value.error == "matching_analysis_state_conflict"
    assert run_service.calls == []


def test_missing_configuration_blocks_only_new_generation() -> None:
    owner, role, _profile, _analysis, run_service, service = make_service(
        provider="openai",
        model="",
    )
    role.matching_analysis = None
    role.matching_analysis_run = None
    role.matching_analysis_run_id = None

    with pytest.raises(APIError) as error:
        start(service, owner, role)

    assert error.value.status_code == 503
    assert error.value.error == "matching_analysis_unavailable"
    assert run_service.calls == []
