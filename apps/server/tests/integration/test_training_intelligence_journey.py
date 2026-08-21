import asyncio
import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CompetencyEvidence,
    CurrentTargetRole,
    InterviewPlan,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    PracticeAttempt,
    TargetRole,
    User,
    UserCompetency,
)
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.training_records import TrainingRecordKind, TrainingRecordStatus
from riva.services.competency_aggregation import CompetencyAggregationService
from riva.services.dashboard import DashboardService
from riva.services.practice_sessions import PracticeSessionService
from riva.services.question_generation import QuestionGenerationService
from riva.services.training_memory import TrainingMemoryService
from riva.services.training_records import TrainingRecordService
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_interview_planning_workflow import (
    _app as interview_app,
)
from tests.integration.test_interview_planning_workflow import (
    _planner_output,
    _start_and_begin,
)
from tests.integration.test_interview_planning_workflow import (
    _settings as interview_settings,
)
from tests.integration.test_interview_planning_workflow import (
    _worker as interview_worker,
)
from tests.integration.test_practice_next_question_workflow import (
    build_worker as practice_worker,
)
from tests.integration.test_practice_next_question_workflow import (
    evaluation_output,
    question_output,
    recommendation_output,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context

pytestmark = pytest.mark.integration


async def _complete_personalized_practice(
    database: Database,
    *,
    user_id: UUID,
    role_id: UUID,
    project_id: UUID,
    label: str,
    score: int,
) -> tuple[UUID, UUID]:
    async with database.sessionmaker() as session:
        started = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).start_session(
            user_id=user_id,
            selection=PracticeSessionSelection(
                target_role_id=role_id,
                question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                difficulty=QuestionCardDifficulty.BASIC,
                source="personalized",
                prioritize_weaknesses=False,
            ),
            interaction_language="en",
        )
        session_id = started.session.id
        attempt_id = started.attempt.id

    assert await practice_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [
                    question_output(
                        project_id,
                        prompt=f"Explain the reliability decision in {label}.",
                    )
                ],
                provider=f"journey-{label}-question-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        answering = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_question_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=1,
        )
        assert answering.question_card is not None
        question_id = answering.question_card.id

    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).submit_primary_answer(
            user_id=user_id,
            session_id=session_id,
            expected_version=2,
            question_id=question_id,
            content=f"I owned the rollout for {label} and reduced failures.",
        )
        assert submitted.session.version == 3

    assert await practice_worker(
        database,
        FollowUpAgent(
            FakeLLMProvider(
                [{"action": "complete"}],
                provider=f"journey-{label}-follow-up-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_follow_up_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=3,
        )
        assert evaluating.attempt.status == "evaluating"
        assert evaluating.session.version == 4

    assert await practice_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider(
                [evaluation_output(overall_score=score)],
                provider=f"journey-{label}-evaluation-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        review_queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=4,
        )
        assert review_queued.attempt.status == "evaluating"

    assert await practice_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider(
                [review_output()],
                provider=f"journey-{label}-review-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        recommendation_queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=4,
        )
        assert recommendation_queued.attempt.status == "evaluating"

    assert await practice_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider(
                [recommendation_output()],
                provider=f"journey-{label}-recommendation-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        references_queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=4,
        )
        assert references_queued.attempt.status == "evaluating"

    assert await complete_queued_reference_answers(database)
    async with database.sessionmaker() as session:
        review = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=user_id,
            session_id=session_id,
            expected_version=4,
        )
        assert review.attempt.status == "review"
        assert review.session.version == 5

        completed = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).complete_session_after_review(
            user_id=user_id,
            session_id=session_id,
            expected_version=5,
        )
        assert completed.session.status == "completed"
        assert completed.final_attempt.status == "completed"

    return session_id, attempt_id


def test_training_intelligence_cross_module_journey() -> None:
    async def run_journey() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, profile, project_id = await seed_context(database)
                owner_id = owner.id
                role_id = role.id
                profile_id = profile.profile_id

                async with database.sessionmaker() as session:
                    session.add(CurrentTargetRole(user_id=owner_id, role_id=role_id))
                    await session.commit()

                (
                    first_session_id,
                    first_attempt_id,
                ) = await _complete_personalized_practice(
                    database,
                    user_id=owner_id,
                    role_id=role_id,
                    project_id=project_id,
                    label="first",
                    score=82,
                )
                (
                    second_session_id,
                    second_attempt_id,
                ) = await _complete_personalized_practice(
                    database,
                    user_id=owner_id,
                    role_id=role_id,
                    project_id=project_id,
                    label="second",
                    score=50,
                )

                async with database.sessionmaker() as session:
                    stored_profile = await session.get(
                        CareerProfile,
                        profile_id,
                    )
                    stored_role = await session.get(TargetRole, role_id)
                    completed_attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.id.in_(
                                        [first_attempt_id, second_attempt_id]
                                    )
                                )
                            )
                        ).all()
                    )
                    assert stored_profile is not None
                    assert stored_role is not None
                    assert stored_role.preparation_status != "archived"
                    assert stored_role.job_description_status == "saved"
                    assert stored_role.job_description_parsing_run_id is not None
                    current_role = await session.scalar(
                        select(CurrentTargetRole).where(
                            CurrentTargetRole.user_id == owner_id,
                            CurrentTargetRole.role_id == role_id,
                        )
                    )
                    assert current_role is not None
                    job_description_analysis = await session.scalar(
                        select(JobDescriptionAnalysis).where(
                            JobDescriptionAnalysis.user_id == owner_id,
                            JobDescriptionAnalysis.role_id == role_id,
                        )
                    )
                    matching_analysis = await session.scalar(
                        select(MatchingAnalysis).where(
                            MatchingAnalysis.user_id == owner_id,
                            MatchingAnalysis.role_id == role_id,
                        )
                    )
                    assert job_description_analysis is not None
                    assert matching_analysis is not None
                    assert (
                        matching_analysis.source_agent_run_id
                        == stored_role.matching_analysis_run_id
                    )
                    assert stored_profile.version == 1
                    assert len(completed_attempts) == 2
                    assert {attempt.status for attempt in completed_attempts} == {
                        "completed"
                    }

                    evidence = list(
                        (
                            await session.scalars(
                                select(CompetencyEvidence).where(
                                    CompetencyEvidence.user_id == owner_id,
                                    CompetencyEvidence.source_type == "practice",
                                    CompetencyEvidence.source_session_id.in_(
                                        [first_session_id, second_session_id]
                                    ),
                                )
                            )
                        ).all()
                    )
                    score_evidence = [
                        item for item in evidence if item.signal_type == "score"
                    ]
                    dimension_evidence = [
                        item
                        for item in score_evidence
                        if isinstance(item.details, dict)
                        and "dimension" in item.details
                    ]
                    assert score_evidence
                    assert dimension_evidence
                    assert all(
                        item.source_entity_type == "practiceAttempt"
                        and item.source_entity_id
                        in {first_attempt_id, second_attempt_id}
                        and item.source_session_id
                        in {first_session_id, second_session_id}
                        and item.score is not None
                        for item in score_evidence
                    )
                    assert {item.source_session_id for item in score_evidence} == {
                        first_session_id,
                        second_session_id,
                    }

                async with database.sessionmaker() as session:
                    await CompetencyAggregationService(
                        session
                    ).recompute_user_in_transaction(owner_id)
                    await session.commit()

                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner_id,
                            UserCompetency.competency_key == "answer_quality",
                        )
                    )
                    assert competency is not None
                    competency_id = competency.id
                    competency_evidence = list(
                        (
                            await session.scalars(
                                select(CompetencyEvidence).where(
                                    CompetencyEvidence.competency_id == competency_id
                                )
                            )
                        ).all()
                    )
                    assert competency.evidence_count == len(competency_evidence)
                    assert competency.evidence_count >= 2
                    assert competency.level is not None
                    assert 0 <= competency.level <= 100
                    assert 0 <= competency.confidence <= 100
                    assert competency.confidence >= 40
                    assert competency.trend in {
                        "insufficient",
                        "improving",
                        "stable",
                        "declining",
                    }
                    assert competency.last_evidence_at is not None
                    assert competency.last_evidence_at.tzinfo is not None

                    memory = await TrainingMemoryService(session).get_context(owner_id)
                    memory_snapshot = memory.model_dump(mode="json", by_alias=True)
                    memory_keys = {
                        item.competency_key
                        for item in (
                            memory.focus_competencies + memory.established_competencies
                        )
                    }
                    assert "answer_quality" in memory_keys
                    assert all(
                        item.competency_key in memory_keys
                        for item in memory.focus_competencies
                        + memory.established_competencies
                    )

                async with database.sessionmaker() as session:
                    generated = await QuestionGenerationService(
                        session,
                        llm_model="fake-question-model",
                    ).enqueue_generation(
                        user_id=owner_id,
                        target_role_id=role_id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="training-intelligence-journey-question",
                    )
                    generated_run_id = generated.id
                    generated_memory = generated.payload["trainingMemory"]
                    assert generated_memory == memory_snapshot

                question_provider = FakeLLMProvider(
                    [
                        question_output(
                            project_id,
                            prompt=(
                                "Explain the next evidence-based reliability decision."
                            ),
                        )
                    ],
                    provider="training-intelligence-question-provider",
                )
                assert await practice_worker(
                    database,
                    QuestionGenerationAgent(
                        question_provider,
                        model="fake-question-model",
                    ),
                ).process_one()
                question_messages = "\n".join(
                    message.content for message in question_provider.calls[0].messages
                )
                serialized_memory = json.dumps(
                    generated_memory,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                assert serialized_memory in question_messages

                async with database.sessionmaker() as session:
                    generated_run = await session.get(AgentRun, generated_run_id)
                    assert generated_run is not None
                    assert generated_run.status is AgentRunStatus.SUCCEEDED

                interview_application = interview_app(database_url(), owner)
                with TestClient(interview_application) as client:
                    interview_session_id, _opening, generating = _start_and_begin(
                        client,
                        role_id,
                    )
                    assert generating["status"] == "generatingQuestion"
                    assert generating["version"] == 2

                    async with database.sessionmaker() as session:
                        planning_run = await session.scalar(
                            select(AgentRun).where(
                                AgentRun.user_id == owner_id,
                                AgentRun.agent_id == "interview-planner",
                                AgentRun.payload["sessionId"].as_string()
                                == str(interview_session_id),
                            )
                        )
                        assert planning_run is not None
                        planning_memory = planning_run.payload[
                            "interviewPlanningInput"
                        ]["trainingMemory"]
                        assert planning_memory == memory_snapshot

                    planner_provider = FakeLLMProvider(
                        [_planner_output()],
                        provider="training-intelligence-planner-provider",
                    )
                    assert await interview_worker(
                        database,
                        interview_settings(database_url()),
                        planner_provider,
                    ).process_one()
                    planner_messages = "\n".join(
                        message.content
                        for message in planner_provider.calls[0].messages
                    )
                    assert serialized_memory in planner_messages

                    async with database.sessionmaker() as session:
                        stored_plan_run = await session.get(
                            AgentRun,
                            planning_run.id,
                        )
                        plan = await session.scalar(
                            select(InterviewPlan).where(
                                InterviewPlan.session_id == interview_session_id
                            )
                        )
                        assert stored_plan_run is not None
                        assert stored_plan_run.status is AgentRunStatus.SUCCEEDED
                        assert plan is not None
                        assert plan.source_agent_run_id == stored_plan_run.id

                async with database.sessionmaker() as session:
                    dashboard_user = await session.get(User, owner_id)
                    assert dashboard_user is not None
                    dashboard = await DashboardService(session).get_dashboard(
                        dashboard_user
                    )
                    assert dashboard.current_role is not None
                    assert dashboard.current_role.id == role_id
                    assert dashboard.current_role.profile_completed is True
                    assert dashboard.current_role.job_description_added is True

                    answer_quality = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.id == competency_id,
                            UserCompetency.user_id == owner_id,
                        )
                    )
                    assert answer_quality is not None
                    weakness_ids = {item.id for item in dashboard.weaknesses}
                    assert answer_quality.id in weakness_ids

                    latest_score = await session.scalar(
                        select(CompetencyEvidence)
                        .where(
                            CompetencyEvidence.competency_id == answer_quality.id,
                            CompetencyEvidence.signal_type == "score",
                        )
                        .order_by(
                            CompetencyEvidence.occurred_at.desc(),
                            CompetencyEvidence.created_at.desc(),
                            CompetencyEvidence.id.desc(),
                        )
                    )
                    assert latest_score is not None
                    assert dashboard.recommendation is not None
                    assert (
                        dashboard.recommendation.source_record_id
                        == latest_score.source_session_id
                    )
                    assert dashboard.recommendation.target_role_id == role_id

                    records = await TrainingRecordService(
                        session
                    ).list_training_records(
                        user_id=owner_id,
                        kinds=[TrainingRecordKind.TARGETED_PRACTICE],
                    )
                    practice_record = next(
                        item
                        for item in records.items
                        if item.record_id == second_session_id
                    )
                    assert practice_record.kind is TrainingRecordKind.TARGETED_PRACTICE
                    assert practice_record.status is TrainingRecordStatus.COMPLETED

                    overview = await TrainingRecordService(
                        session
                    ).get_training_records_overview(user_id=owner_id)
                    assert overview.total_record_count >= 2
                    assert overview.completed_record_count >= 2
                    assert (
                        overview.by_kind[
                            TrainingRecordKind.TARGETED_PRACTICE
                        ].record_count
                        >= 2
                    )

                    assert latest_score.source_session_id == practice_record.record_id
            finally:
                await database.reset()

    asyncio.run(run_journey())
