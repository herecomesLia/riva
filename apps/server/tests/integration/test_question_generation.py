import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.agents import QuestionGenerationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    PracticeQuestionReferenceContext,
    QuestionCard,
    TargetRole,
    User,
)
from riva.prompts import (
    JOB_DESCRIPTION_PARSING_PROMPT,
    MATCHING_ANALYSIS_PROMPT,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import QuestionGenerationOutput
from riva.services.agent_runs import AgentRunService
from riva.services.question_generation import QuestionGenerationService
from riva.workers import AgentHandlerRegistry, AgentWorker, QuestionGenerationHandler
from tests.helpers.llm import FakeLLMProvider

pytestmark = pytest.mark.integration
START = datetime(2026, 8, 10, 9, 30, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def succeeded_run(
    *,
    user_id: UUID,
    agent_id: str,
    prompt_id: str,
    prompt_version: str,
    output_schema_id: str,
    payload: dict[str, object],
    key: str,
) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        output_schema_id=output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload=payload,
        idempotency_key=key,
        attempt_count=1,
        max_attempts=3,
        started_at=START,
        finished_at=START,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )


async def seed_context(
    database: Database,
) -> tuple[User, TargetRole, CareerProfile, UUID]:
    user_id = uuid4()
    role_id = uuid4()
    profile_id = uuid4()
    owner = User(
        id=user_id,
        username=user_id.hex,
        normalized_username=user_id.hex,
        password_hash="hash",
        display_name="Question Generation Integration User",
    )
    role = TargetRole(
        id=role_id,
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=1,
        version=1,
    )
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=user_id,
        summary="Not part of QuestionGeneration context.",
        version=1,
    )
    skill = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="Python",
        normalized_name="python",
    )
    education = CareerProfileEducation(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        school="Tongji University",
        degree="Master",
        major="Software Engineering",
        start_date="2018-09",
        end_date="2021-06",
        is_current=False,
    )
    work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        company="Riva",
        title="Backend Engineer",
        employment_type="fullTime",
        start_date="2021-07",
        end_date=None,
        is_current=True,
        responsibilities=["Build reliable APIs"],
        achievements=["Improved reliability"],
    )
    work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=work.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    project = CareerProfileProjectExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="Payment Platform",
        role="Developer",
        start_date="2023-01",
        end_date="2023-06",
        responsibilities=["Designed payment workflows"],
        achievements=["Shipped the first version"],
    )
    project.skill_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            project_experience_id=project.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    profile.skills = [skill]
    profile.education = [education]
    profile.work_experiences = [work]
    profile.project_experiences = [project]

    parsing_run = succeeded_run(
        user_id=user_id,
        agent_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_version=JOB_DESCRIPTION_PARSING_PROMPT.version,
        output_schema_id=JOB_DESCRIPTION_PARSING_PROMPT.output_schema_id,
        payload={"roleId": str(role_id), "jobDescriptionVersion": 1},
        key=f"question-generation-jd-{role_id}",
    )
    role.job_description_parsing_run_id = parsing_run.id
    analysis = JobDescriptionAnalysis(
        role_id=role_id,
        user_id=user_id,
        job_description_version=1,
        analysis_version=1,
        source_agent_run_id=parsing_run.id,
        parsed_at=START,
        riva_summary="Build reliable APIs.",
        responsibilities=["Design backend APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": ["Backend experience"],
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
        soft_skills=["Communication"],
        business_domains=["Payments"],
    )
    matching_run = succeeded_run(
        user_id=user_id,
        agent_id=MATCHING_ANALYSIS_PROMPT.prompt_id,
        prompt_id=MATCHING_ANALYSIS_PROMPT.prompt_id,
        prompt_version=MATCHING_ANALYSIS_PROMPT.version,
        output_schema_id=MATCHING_ANALYSIS_PROMPT.output_schema_id,
        payload={
            "roleId": str(role_id),
            "profileId": str(profile_id),
            "profileVersion": 1,
            "jobDescriptionVersion": 1,
            "jobDescriptionAnalysisVersion": 1,
        },
        key=f"question-generation-matching-{role_id}",
    )
    role.matching_analysis_run_id = matching_run.id
    matching = MatchingAnalysis(
        role_id=role_id,
        user_id=user_id,
        profile_id=profile_id,
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        source_agent_run_id=matching_run.id,
        generated_at=START,
        overall_match_score=82,
        core_requirements_summary="Reliable backend APIs.",
        matched_capabilities=["Python"],
        missing_capabilities=["Kubernetes"],
        underrepresented_capabilities=[],
        resume_highlights=["Improved reliability"],
        resume_gaps=[],
        high_risk_questions=[],
        preparation_recommendations=["Prepare the reliability example."],
    )

    async with database.sessionmaker() as session:
        session.add_all(
            [
                owner,
                role,
                profile,
                parsing_run,
                analysis,
                matching_run,
                matching,
            ]
        )
        await session.commit()
    return owner, role, profile, project.id


def test_question_generation_worker_persists_and_retries_idempotently() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, profile, project_id = await seed_context(database)
                response = {
                    "prompt": "Explain how you designed the payment workflows.",
                    "question_type": "projectDeepDive",
                    "difficulty": "basic",
                    "assessed_capabilities": ["Technical decision-making"],
                    "recommended_materials": [
                        {
                            "type": "projectExperience",
                            "id": str(project_id),
                            "label": "Untrusted label",
                            "reason": "Relevant project evidence.",
                        }
                    ],
                    "answer_hints": ["Explain your personal contribution."],
                    "answer_framework": ["Context", "Decision", "Result"],
                    "follow_up_directions": ["Technical rationale"],
                    "scoring_focus": ["Evidence of personal contribution"],
                }
                async with database.sessionmaker() as session:
                    run = await QuestionGenerationService(
                        session,
                        llm_model="fake-question-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="question-generation-integration",
                    )

                provider = FakeLLMProvider(
                    [response],
                    provider="fake-question-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(
                        provider,
                        model="fake-question-model",
                    ),
                )
                registry = AgentHandlerRegistry()
                registry.register(handler)
                worker = AgentWorker(
                    worker_id="question-generation-integration-worker",
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
                assert await worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    card = await session.scalar(
                        select(QuestionCard).where(
                            QuestionCard.source_agent_run_id == run.id
                        )
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert card is not None
                    frozen_context = await session.get(
                        PracticeQuestionReferenceContext,
                        card.id,
                    )
                    assert card.source_agent_run_id == run.id
                    assert frozen_context is not None
                    assert frozen_context.frozen_context["candidateEvidence"] == [
                        {
                            "type": "projectExperience",
                            "id": str(project_id),
                            "name": "Payment Platform",
                            "role": "Developer",
                            "responsibilities": ["Designed payment workflows"],
                            "achievements": ["Shipped the first version"],
                            "skills": ["Python"],
                        }
                    ]
                    assert card.matching_analysis_run_id == (
                        role.matching_analysis_run_id
                    )
                    assert card.language == "en"
                    assert card.question_type == "projectDeepDive"
                    assert card.difficulty == "basic"
                    assert card.profile_version == profile.version
                    assert card.job_description_version == 1
                    assert card.job_description_analysis_version == 1
                    assert card.recommended_materials[0]["label"] == (
                        "Payment Platform"
                    )

                    persisted_output = QuestionGenerationOutput.model_validate(response)
                    returned = await QuestionGenerationService(session).persist_success(
                        stored_run, persisted_output
                    )
                    count = await session.scalar(
                        select(func.count())
                        .select_from(QuestionCard)
                        .where(QuestionCard.source_agent_run_id == run.id)
                    )
                    context_count = await session.scalar(
                        select(func.count())
                        .select_from(PracticeQuestionReferenceContext)
                        .where(
                            PracticeQuestionReferenceContext.question_card_id == card.id
                        )
                    )
                    assert returned.id == card.id
                    assert count == 1
                    assert context_count == 1

                async with database.sessionmaker() as session:
                    retry_run = await QuestionGenerationService(
                        session,
                        llm_model="fake-question-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="question-generation-retry-window",
                    )

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="question-generation-first-attempt",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == retry_run.id

                retry_response_a = {
                    **response,
                    "prompt": "Explain how you designed the payment workflows for the retry case.",
                    "recommended_materials": [],
                }
                retry_output_a = QuestionGenerationOutput.model_validate(
                    retry_response_a
                )
                async with database.sessionmaker() as session:
                    await QuestionGenerationService(session).persist_success(
                        claimed, retry_output_a
                    )

                async with database.sessionmaker() as session:
                    now = datetime.now(UTC)
                    running = await session.get(AgentRun, retry_run.id)
                    assert running is not None
                    running.lease_expires_at = now - timedelta(seconds=1)
                    await session.commit()
                    assert (
                        await AgentRunService(
                            session,
                            clock=lambda: now,
                        ).requeue_expired()
                        == 1
                    )

                retry_response_b = {
                    **retry_response_a,
                    "prompt": "Describe a completely different retry question.",
                }
                retry_provider = FakeLLMProvider(
                    [retry_response_b],
                    provider="fake-question-retry-provider",
                    usage=LLMUsage(input_tokens=30, output_tokens=12),
                )
                retry_handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(
                        retry_provider,
                        model="fake-question-retry-model",
                    ),
                )
                retry_registry = AgentHandlerRegistry()
                retry_registry.register(retry_handler)
                retry_worker = AgentWorker(
                    worker_id="question-generation-retry-worker",
                    session_factory=database.sessionmaker,
                    registry=retry_registry,
                    lease_duration=timedelta(minutes=10),
                    heartbeat_interval=timedelta(minutes=2),
                    poll_interval=timedelta(seconds=1),
                    requeue_interval=timedelta(minutes=1),
                    retry_base_delay=timedelta(seconds=1),
                    retry_max_delay=timedelta(minutes=2),
                    logger=SilentLogger(),
                )
                assert await retry_worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_retry_run = await session.get(
                        AgentRun,
                        retry_run.id,
                    )
                    retry_cards = list(
                        (
                            await session.scalars(
                                select(QuestionCard).where(
                                    QuestionCard.source_agent_run_id == retry_run.id
                                )
                            )
                        ).all()
                    )
                    assert stored_retry_run is not None
                    assert stored_retry_run.status is AgentRunStatus.SUCCEEDED
                    assert len(retry_cards) == 1
                    assert retry_cards[0].source_agent_run_id == retry_run.id
                    assert retry_cards[0].prompt == retry_response_a["prompt"]
                    assert stored_retry_run.result is not None
                    assert (
                        stored_retry_run.result["prompt"] == retry_response_a["prompt"]
                    )
                    assert (
                        stored_retry_run.result["prompt"] != retry_response_b["prompt"]
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())
