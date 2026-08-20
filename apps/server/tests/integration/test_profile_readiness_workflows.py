import asyncio
from datetime import timedelta
import os
from typing import Literal
from uuid import uuid4

import pytest
from sqlalchemy import select

from riva.agents import MatchingAnalysisAgent, QuestionGenerationAgent
from riva.core.errors import APIError
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CurrentTargetRole,
    QuestionCard,
    TargetRole,
)
from riva.schemas.interview import StartInterviewRequest
from riva.schemas.practice_sessions import (
    PracticeQuestionSource,
    PracticeSessionSelection,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.roles import StartMatchingAnalysisRequest
from riva.services.dashboard import DashboardService
from riva.services.interview_planning import InterviewPlanningService
from riva.services.interview_sessions import InterviewSessionService
from riva.services.matching_analyses import MatchingAnalysisService
from riva.services.practice_sessions import PracticeSessionService
from riva.services.question_generation import QuestionGenerationService
from riva.services.roles import TargetRoleService
from riva.services.training_planning import (
    TRAINING_PLANNING_TARGET_UNAVAILABLE,
    TrainingPlanningService,
    TrainingPlanningStateError,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    MatchingAnalysisHandler,
    QuestionGenerationHandler,
)
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import (
    create_career_profile,
    create_jd_ready_role,
    create_user,
)
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration
MODEL = "fake-profile-readiness-model"

MinimalProfile = Literal["skills", "work", "project"]
UnavailableProfile = Literal["education", "empty"]


MATCHING_OUTPUT = {
    "overall_match_score": 80,
    "core_requirements_summary": "Build reliable backend services.",
    "matched_capabilities": ["Relevant career evidence"],
    "missing_capabilities": ["System design depth"],
    "underrepresented_capabilities": ["Measured outcomes"],
    "resume_highlights": ["Relevant evidence is present"],
    "resume_gaps": ["More detail would improve the profile"],
    "high_risk_questions": ["What trade-offs did you make?"],
    "preparation_recommendations": ["Prepare one concrete example."],
}

QUESTION_OUTPUT = {
    "prompt": "How would you design a reliable backend API?",
    "question_type": "technicalFoundation",
    "difficulty": "basic",
    "assessed_capabilities": ["API design"],
    "recommended_materials": [],
    "answer_hints": ["Explain the main trade-offs."],
    "answer_framework": ["Requirements", "Design", "Trade-offs"],
    "follow_up_directions": ["Reliability"],
    "scoring_focus": ["Clear technical reasoning"],
}


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def _database_url() -> str:
    value = get_integration_database_url()
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def _worker(
    database: Database,
    handler: MatchingAnalysisHandler | QuestionGenerationHandler,
    *,
    label: str,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id=f"profile-readiness-{label}",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


async def _seed_profile(database: Database, kind: str):
    owner = create_user(f"readiness-{kind}")
    profile = create_career_profile(
        owner.id,
        include_education=kind == "education",
        include_work_experience=kind == "work",
        include_project_experience=kind == "project",
        include_skill=kind == "skills",
    )
    role, parsing_run, analysis = create_jd_ready_role(owner.id)
    async with database.sessionmaker() as session:
        session.add_all(
            [
                owner,
                profile,
                role,
                parsing_run,
                analysis,
                CurrentTargetRole(user_id=owner.id, role_id=role.id),
            ]
        )
        await session.commit()
    return owner, role, profile


def _assert_minimal_profile(snapshot, kind: MinimalProfile) -> None:
    assert snapshot.education == []
    assert len(snapshot.skills) == (1 if kind == "skills" else 0)
    assert len(snapshot.work_experiences) == (1 if kind == "work" else 0)
    assert len(snapshot.project_experiences) == (1 if kind == "project" else 0)


@pytest.mark.parametrize("kind", ["skills", "work", "project"])
def test_minimal_profiles_are_ready_across_core_workflows(
    kind: MinimalProfile,
) -> None:
    async def run_test() -> None:
        async with Database(_database_url()) as database:
            await database.reset()
            try:
                owner, role, _profile = await _seed_profile(database, kind)

                async with database.sessionmaker() as session:
                    roles_page = await TargetRoleService(session).get_roles_page(owner)
                    assert roles_page.profile_context.completed is True

                    dashboard = await DashboardService(session).get_dashboard(owner)
                    assert dashboard.current_role is not None
                    assert dashboard.current_role.profile_completed is True

                    started_matching = await TargetRoleService(
                        session,
                        llm_provider="qwen",
                        llm_model=MODEL,
                    ).start_matching_analysis(
                        owner,
                        role.id,
                        StartMatchingAnalysisRequest(version=role.version),
                        interaction_language="en",
                    )
                    started_role = next(
                        candidate
                        for candidate in started_matching.roles
                        if candidate.id == role.id
                    )
                    assert started_role.matching_analysis is not None
                    assert started_role.matching_analysis.status == "generating"

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, role.id)
                    assert stored_role is not None
                    matching_run = await session.get(
                        AgentRun,
                        stored_role.matching_analysis_run_id,
                    )
                    assert matching_run is not None
                    matching_input = await MatchingAnalysisService(
                        session
                    ).load_matching_input(matching_run)
                    _assert_minimal_profile(matching_input.career_profile, kind)

                matching_provider = FakeLLMProvider([MATCHING_OUTPUT])
                matching_handler = MatchingAnalysisHandler(
                    session_factory=database.sessionmaker,
                    agent=MatchingAnalysisAgent(matching_provider, model=MODEL),
                )
                assert await _worker(
                    database,
                    matching_handler,
                    label=f"matching-{kind}",
                ).process_one()
                assert len(matching_provider.calls) == 1

                async with database.sessionmaker() as session:
                    stored_matching_run = await session.get(
                        AgentRun,
                        matching_run.id,
                    )
                    assert stored_matching_run is not None
                    assert stored_matching_run.status is AgentRunStatus.SUCCEEDED

                    practice = await PracticeSessionService(
                        session,
                        llm_model=MODEL,
                    ).start_session(
                        user_id=owner.id,
                        selection=PracticeSessionSelection(
                            target_role_id=role.id,
                            question_type=(
                                QuestionCardQuestionType.TECHNICAL_FOUNDATION
                            ),
                            difficulty=QuestionCardDifficulty.BASIC,
                            source=PracticeQuestionSource.PERSONALIZED,
                            prioritize_weaknesses=False,
                        ),
                        interaction_language="en",
                    )
                    assert practice.question_generation_run is not None
                    question_run_id = practice.question_generation_run.id

                async with database.sessionmaker() as session:
                    question_run = await session.get(AgentRun, question_run_id)
                    assert question_run is not None
                    question_input = await QuestionGenerationService(
                        session
                    ).load_generation_input(question_run)
                    _assert_minimal_profile(question_input.career_profile, kind)

                question_provider = FakeLLMProvider([QUESTION_OUTPUT])
                question_handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(question_provider, model=MODEL),
                )
                assert await _worker(
                    database,
                    question_handler,
                    label=f"question-{kind}",
                ).process_one()
                assert len(question_provider.calls) == 1

                async with database.sessionmaker() as session:
                    question_run = await session.get(AgentRun, question_run_id)
                    assert question_run is not None
                    assert question_run.status is AgentRunStatus.SUCCEEDED
                    assert await session.scalar(
                        select(QuestionCard.id).where(
                            QuestionCard.source_agent_run_id == question_run_id
                        )
                    ) is not None

                    interview_service = InterviewSessionService(session)
                    setup = await interview_service.get_setup(user_id=owner.id)
                    assert setup.profile_complete is True
                    assert setup.blocked_reason is None
                    assert [candidate.id for candidate in setup.target_roles] == [
                        role.id
                    ]

                    interview = await interview_service.start_session(
                        user_id=owner.id,
                        configuration=StartInterviewRequest(
                            target_role_id=role.id,
                            round="technical",
                            difficulty="pressure",
                            duration_minutes=30,
                        ),
                        interaction_language="en",
                    )
                    assert interview.status == "opening"

                async with database.sessionmaker() as session:
                    planner = InterviewPlanningService(session, llm_model=MODEL)
                    planning_input = await planner._build_planning_input(
                        interview,
                        user_id=owner.id,
                    )
                    _assert_minimal_profile(planning_input.career_profile, kind)
                    generating = await planner.begin_questions(
                        user_id=owner.id,
                        session_id=interview.id,
                        version=interview.version,
                    )
                    assert generating.status == "generatingQuestion"
                    assert generating.planning_run_id is not None
                    planning_run = await session.get(
                        AgentRun,
                        generating.planning_run_id,
                    )
                    assert planning_run is not None
                    frozen_input = await planner.load_planning_input(planning_run)
                    _assert_minimal_profile(frozen_input.career_profile, kind)

                async with database.sessionmaker() as session:
                    training_input = await TrainingPlanningService(
                        session
                    )._build_authoritative_input(
                        user_id=owner.id,
                        target_role_id=role.id,
                        interaction_language="en",
                    )
                    assert training_input.constraints.mock_interview is not None
                    assert training_input.constraints.targeted_practice is not None
                    assert training_input.matching_analysis is not None
            finally:
                await database.reset()

    asyncio.run(run_test())


@pytest.mark.parametrize("kind", ["education", "empty"])
def test_profiles_without_career_evidence_remain_unavailable(
    kind: UnavailableProfile,
) -> None:
    async def run_test() -> None:
        async with Database(_database_url()) as database:
            await database.reset()
            try:
                owner, role, _profile = await _seed_profile(database, kind)

                async with database.sessionmaker() as session:
                    roles_page = await TargetRoleService(session).get_roles_page(owner)
                    assert roles_page.profile_context.completed is False

                    with pytest.raises(APIError) as matching_error:
                        await TargetRoleService(
                            session,
                            llm_provider="qwen",
                            llm_model=MODEL,
                        ).start_matching_analysis(
                            owner,
                            role.id,
                            StartMatchingAnalysisRequest(version=role.version),
                            interaction_language="en",
                        )
                    assert matching_error.value.error == "matching_profile_incomplete"

                async with database.sessionmaker() as session:
                    setup = await InterviewSessionService(session).get_setup(
                        user_id=owner.id
                    )
                    assert setup.profile_complete is False
                    assert setup.blocked_reason == "profileIncomplete"

                    with pytest.raises(TrainingPlanningStateError) as training_error:
                        await TrainingPlanningService(
                            session
                        )._build_authoritative_input(
                            user_id=owner.id,
                            target_role_id=role.id,
                            interaction_language="en",
                        )
                    assert training_error.value.code == (
                        TRAINING_PLANNING_TARGET_UNAVAILABLE
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())
