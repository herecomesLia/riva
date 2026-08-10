import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    QuestionCard,
    TargetRole,
    User,
)
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardMaterialReference,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import (
    QuestionGenerationOutput,
    QuestionGenerationRunPayload,
)
from riva.services.question_generation import (
    INVALID_QUESTION_GENERATION_RUN,
    QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
    QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY,
    QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY,
    QUESTION_GENERATION_MATCHING_ANALYSIS_STALE,
    QUESTION_GENERATION_PROFILE_INCOMPLETE,
    QUESTION_GENERATION_PROFILE_NOT_FOUND,
    QUESTION_GENERATION_PROFILE_VERSION_STALE,
    QUESTION_GENERATION_TARGET_ARCHIVED,
    QUESTION_GENERATION_TARGET_NOT_FOUND,
    QuestionGenerationService,
    QuestionGenerationStateError,
    build_question_generation_profile_context,
    question_generation_output_from_card,
)


NOW = datetime(2026, 8, 10, 9, 30, tzinfo=UTC)


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


class FakeAgentRunService:
    def __init__(self, run: AgentRun) -> None:
        self.run = run
        self.calls: list[dict[str, object]] = []

    async def enqueue_in_transaction(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        return self.run


def graph() -> tuple[
    User,
    TargetRole,
    CareerProfile,
    JobDescriptionAnalysis,
    MatchingAnalysis,
]:
    owner = User(
        id=uuid4(),
        username="question-generation-service",
        normalized_username="question-generation-service",
        password_hash="hash",
        display_name="Question Generation Service",
    )
    role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=2,
        version=10,
    )
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=owner.id,
        summary="must not be sent",
        version=3,
    )
    python = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=1,
        name="Python",
        normalized_name="python",
    )
    fastapi = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=0,
        name="FastAPI",
        normalized_name="fastapi",
    )
    education = CareerProfileEducation(
        id=uuid4(),
        career_profile_id=profile.profile_id,
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
        career_profile_id=profile.profile_id,
        position=1,
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
            career_profile_id=profile.profile_id,
            work_experience_id=work.id,
            skill_id=python.id,
            position=1,
            skill=python,
        ),
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            work_experience_id=work.id,
            skill_id=fastapi.id,
            position=0,
            skill=fastapi,
        ),
    ]
    project = CareerProfileProjectExperience(
        id=uuid4(),
        career_profile_id=profile.profile_id,
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
            career_profile_id=profile.profile_id,
            project_experience_id=project.id,
            skill_id=fastapi.id,
            position=0,
            skill=fastapi,
        )
    ]
    profile.skills = [python, fastapi]
    profile.education = [education]
    profile.work_experiences = [work]
    profile.project_experiences = [project]

    analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=owner.id,
        job_description_version=2,
        analysis_version=4,
        source_agent_run_id=uuid4(),
        parsed_at=NOW,
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
            "frameworks_and_libraries": ["FastAPI"],
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
    matching = MatchingAnalysis(
        role_id=role.id,
        user_id=owner.id,
        profile_id=profile.profile_id,
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
        source_agent_run_id=uuid4(),
        generated_at=NOW,
        overall_match_score=82,
        core_requirements_summary="Reliable backend APIs.",
        matched_capabilities=["Python"],
        missing_capabilities=["Kubernetes"],
        underrepresented_capabilities=["Scale"],
        resume_highlights=["Improved reliability"],
        resume_gaps=["Scale is not quantified"],
        high_risk_questions=["How did you improve reliability?"],
        preparation_recommendations=["Prepare the reliability example."],
    )
    role.matching_analysis_run_id = matching.source_agent_run_id
    return owner, role, profile, analysis, matching


def payload(
    role: TargetRole,
    profile: CareerProfile,
    analysis: JobDescriptionAnalysis,
    matching: MatchingAnalysis,
) -> QuestionGenerationRunPayload:
    return QuestionGenerationRunPayload(
        role_id=role.id,
        profile_id=profile.profile_id,
        profile_version=profile.version,
        job_description_version=analysis.job_description_version,
        job_description_analysis_version=analysis.analysis_version,
        matching_analysis_run_id=matching.source_agent_run_id,
        interaction_language="zh-CN",
        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        difficulty=QuestionCardDifficulty.BASIC,
    )


def run_for(
    owner: User,
    payload: QuestionGenerationRunPayload,
) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id=QUESTION_GENERATION_PROMPT.prompt_id,
        prompt_id=QUESTION_GENERATION_PROMPT.prompt_id,
        prompt_version=QUESTION_GENERATION_PROMPT.version,
        output_schema_id=QUESTION_GENERATION_PROMPT.output_schema_id,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=f"question-generation-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )


def output_for(
    payload: QuestionGenerationRunPayload,
) -> QuestionGenerationOutput:
    return QuestionGenerationOutput(
        prompt="Explain how you designed the payment workflows.",
        question_type=payload.question_type,
        difficulty=payload.difficulty,
        assessed_capabilities=["Technical decision-making"],
        recommended_materials=[],
        answer_hints=["Explain your personal contribution."],
        answer_framework=["Context", "Decision", "Result"],
        follow_up_directions=["Technical rationale"],
        scoring_focus=["Evidence of personal contribution"],
    )


def service_for(session: ScriptedSession) -> QuestionGenerationService:
    return QuestionGenerationService(
        session,  # type: ignore[arg-type]
        llm_model="test-model",
        clock=lambda: NOW,
    )


def test_profile_context_uses_stable_order_and_only_curated_fields() -> None:
    _, _, profile, _, _ = graph()

    context = build_question_generation_profile_context(profile)

    assert context.skills == ["FastAPI", "Python"]
    assert context.work_experiences[0].id == profile.work_experiences[0].id
    assert context.work_experiences[0].skills == ["FastAPI", "Python"]
    assert context.project_experiences[0].skills == ["FastAPI"]
    assert "summary" not in context.model_dump()
    assert "description" not in context.project_experiences[0].model_dump()


def test_question_generation_output_projection_from_card_is_validated() -> None:
    owner, role, profile, analysis, matching = graph()
    expected = QuestionGenerationOutput(
        prompt="Explain how you designed the payment workflows.",
        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        difficulty=QuestionCardDifficulty.BASIC,
        assessed_capabilities=["Technical decision-making"],
        recommended_materials=[
            QuestionCardMaterialReference(
                type="projectExperience",
                id=profile.project_experiences[0].id,
                label="Payment Platform",
                reason="Relevant project evidence.",
            )
        ],
        answer_hints=["Explain your personal contribution."],
        answer_framework=["Context", "Decision", "Result"],
        follow_up_directions=["Technical rationale"],
        scoring_focus=["Evidence of personal contribution"],
    )
    card = QuestionCard(
        id=uuid4(),
        user_id=owner.id,
        target_role_id=role.id,
        profile_id=profile.profile_id,
        source_agent_run_id=uuid4(),
        matching_analysis_run_id=matching.source_agent_run_id,
        language="en",
        question_type=expected.question_type.value,
        difficulty=expected.difficulty.value,
        prompt=expected.prompt,
        assessed_capabilities=expected.assessed_capabilities,
        recommended_materials=[
            material.model_dump(mode="json")
            for material in expected.recommended_materials
        ],
        answer_hints=expected.answer_hints,
        answer_framework=expected.answer_framework,
        follow_up_directions=expected.follow_up_directions,
        scoring_focus=expected.scoring_focus,
        profile_version=profile.version,
        job_description_version=analysis.job_description_version,
        job_description_analysis_version=analysis.analysis_version,
        is_saved=True,
        is_marked_weak=True,
        created_at=NOW,
        updated_at=NOW,
    )

    projected = question_generation_output_from_card(card)

    assert projected == expected
    assert projected.question_type is QuestionCardQuestionType.PROJECT_DEEP_DIVE
    assert projected.difficulty is QuestionCardDifficulty.BASIC
    assert set(projected.model_dump()) == {
        "prompt",
        "question_type",
        "difficulty",
        "assessed_capabilities",
        "recommended_materials",
        "answer_hints",
        "answer_framework",
        "follow_up_directions",
        "scoring_focus",
    }
    assert "is_saved" not in projected.model_dump()
    assert "is_marked_weak" not in projected.model_dump()
    assert "source_agent_run_id" not in projected.model_dump()
    assert "created_at" not in projected.model_dump()


def test_load_generation_input_rebuilds_real_db_snapshot() -> None:
    owner, role, profile, analysis, matching = graph()
    run = run_for(owner, payload(role, profile, analysis, matching))
    session = ScriptedSession(role, profile, analysis, matching)

    result = asyncio.run(service_for(session).load_generation_input(run))

    assert result.interaction_language == "zh-CN"
    assert result.question_type is QuestionCardQuestionType.PROJECT_DEEP_DIVE
    assert result.difficulty is QuestionCardDifficulty.BASIC
    assert result.target_role.id == role.id
    assert result.career_profile.project_experiences[0].id == (
        profile.project_experiences[0].id
    )
    assert result.career_profile.project_experiences[0].skills == ["FastAPI"]
    assert result.job_description_analysis.role_title == role.title
    assert result.matching_analysis.overall_match_score == 82
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_enqueue_generation_freezes_only_snapshot_and_controls() -> None:
    owner, role, profile, analysis, matching = graph()
    expected_run = run_for(owner, payload(role, profile, analysis, matching))
    fake_agent_runs = FakeAgentRunService(expected_run)
    session = ScriptedSession(owner.id, role, profile, analysis, matching)

    run = asyncio.run(
        QuestionGenerationService(
            session,  # type: ignore[arg-type]
            llm_model="test-model",
            agent_run_service_factory=lambda _session: fake_agent_runs,  # type: ignore[arg-type]
        ).enqueue_generation(
            user_id=owner.id,
            target_role_id=role.id,
            question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
            difficulty=QuestionCardDifficulty.BASIC,
            interaction_language="en",
            idempotency_key="caller-request-id",
        )
    )

    assert run is expected_run
    call = fake_agent_runs.calls[0]
    assert call["agent_id"] == "question-generator"
    assert call["prompt_id"] == QUESTION_GENERATION_PROMPT.prompt_id
    assert call["prompt_version"] == "1"
    assert call["output_schema_id"] == "question-generation-v1"
    assert call["model"] == "test-model"
    assert call["max_attempts"] == 3
    assert call["idempotency_key"] == "caller-request-id"
    assert call["payload"] == {
        "roleId": str(role.id),
        "profileId": str(profile.profile_id),
        "profileVersion": 3,
        "jobDescriptionVersion": 2,
        "jobDescriptionAnalysisVersion": 4,
        "matchingAnalysisRunId": str(matching.source_agent_run_id),
        "interactionLanguage": "en",
        "questionType": "projectDeepDive",
        "difficulty": "basic",
    }


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda role, profile, matching: setattr(role, "preparation_status", "archived"), QUESTION_GENERATION_TARGET_ARCHIVED),
        (lambda role, profile, matching: setattr(profile, "version", 4), QUESTION_GENERATION_PROFILE_VERSION_STALE),
        (lambda role, profile, matching: setattr(matching, "profile_version", 4), QUESTION_GENERATION_MATCHING_ANALYSIS_STALE),
    ],
)
def test_load_generation_input_rejects_stale_or_archived_context(
    mutate,
    expected: str,
) -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    mutate(role, profile, matching)
    run = run_for(owner, run_payload)
    session = ScriptedSession(role, profile, analysis, matching)

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(service_for(session).load_generation_input(run))

    assert error.value.code == expected
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ((None,), QUESTION_GENERATION_TARGET_NOT_FOUND),
        (("profile", None, ), QUESTION_GENERATION_PROFILE_NOT_FOUND),
        (("matching",), QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY),
    ],
)
def test_load_generation_input_rejects_missing_prerequisites(
    values: tuple[object, ...],
    expected: str,
) -> None:
    owner, role, profile, analysis, matching = graph()
    run = run_for(owner, payload(role, profile, analysis, matching))
    if values == (None,):
        scalar_values = (None,)
    elif values[0] == "profile":
        scalar_values = (role, None)
    else:
        scalar_values = (role, profile, analysis, None)
    session = ScriptedSession(*scalar_values)

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(service_for(session).load_generation_input(run))

    assert error.value.code == expected


@pytest.mark.parametrize(
    ("mutate", "expected", "scalar_values"),
    [
        (
            lambda role, analysis: setattr(
                role,
                "job_description_status",
                "missing",
            ),
            QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY,
            lambda role, profile, analysis: (role, profile),
        ),
        (
            lambda role, analysis: None,
            QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
            lambda role, profile, analysis: (role, profile, None),
        ),
    ],
)
def test_load_generation_input_rejects_unready_jd_context(
    mutate,
    expected: str,
    scalar_values,
) -> None:
    owner, role, profile, analysis, matching = graph()
    run = run_for(owner, payload(role, profile, analysis, matching))
    mutate(role, analysis)
    values = scalar_values(role, profile, analysis)
    session = ScriptedSession(*values)

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(service_for(session).load_generation_input(run))

    assert error.value.code == expected


def test_persist_success_creates_question_card_with_lineage() -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    run = run_for(owner, run_payload)
    session = ScriptedSession(
        owner.id,
        role,
        profile,
        analysis,
        matching,
        None,
    )

    card = asyncio.run(
        service_for(session).persist_success(run, output_for(run_payload))
    )

    assert card in session.added
    assert card.id is not None
    assert card.user_id == owner.id
    assert card.target_role_id == role.id
    assert card.profile_id == profile.profile_id
    assert card.source_agent_run_id == run.id
    assert card.matching_analysis_run_id == matching.source_agent_run_id
    assert card.language == "zh-CN"
    assert card.question_type == "projectDeepDive"
    assert card.difficulty == "basic"
    assert card.profile_version == 3
    assert card.job_description_version == 2
    assert card.job_description_analysis_version == 4
    assert card.is_saved is False
    assert card.is_marked_weak is False
    assert session.commit_count == 1


def test_persist_success_is_idempotent_for_matching_lineage() -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    run = run_for(owner, run_payload)
    existing = QuestionCard(
        id=uuid4(),
        user_id=owner.id,
        target_role_id=role.id,
        profile_id=profile.profile_id,
        source_agent_run_id=run.id,
        matching_analysis_run_id=matching.source_agent_run_id,
        language="zh-CN",
        question_type="projectDeepDive",
        difficulty="basic",
        prompt="Existing question",
        assessed_capabilities=[],
        recommended_materials=[],
        answer_hints=[],
        answer_framework=[],
        follow_up_directions=[],
        scoring_focus=[],
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
    )
    session = ScriptedSession(
        owner.id,
        role,
        profile,
        analysis,
        matching,
        existing,
    )

    returned = asyncio.run(
        service_for(session).persist_success(run, output_for(run_payload))
    )

    assert returned is existing
    assert session.added == []
    assert session.commit_count == 1


def test_persist_success_rejects_mismatched_existing_lineage() -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    run = run_for(owner, run_payload)
    existing = QuestionCard(
        id=uuid4(),
        user_id=owner.id,
        target_role_id=role.id,
        profile_id=uuid4(),
        source_agent_run_id=run.id,
        matching_analysis_run_id=matching.source_agent_run_id,
        language="zh-CN",
        question_type="projectDeepDive",
        difficulty="basic",
        prompt="Existing question",
        assessed_capabilities=[],
        recommended_materials=[],
        answer_hints=[],
        answer_framework=[],
        follow_up_directions=[],
        scoring_focus=[],
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
    )
    session = ScriptedSession(
        owner.id,
        role,
        profile,
        analysis,
        matching,
        existing,
    )

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(
            service_for(session).persist_success(run, output_for(run_payload))
        )

    assert error.value.code == INVALID_QUESTION_GENERATION_RUN
    assert session.added == []
    assert session.rollback_count == 1


def test_persist_success_rejects_output_control_mismatch() -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    run = run_for(owner, run_payload)
    mismatched = output_for(run_payload).model_copy(
        update={"question_type": QuestionCardQuestionType.BEHAVIORAL}
    )
    session = ScriptedSession(
        owner.id,
        role,
        profile,
        analysis,
        matching,
        None,
    )

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(service_for(session).persist_success(run, mismatched))

    assert error.value.code == INVALID_QUESTION_GENERATION_RUN
    assert session.added == []


def test_persist_success_rejects_profile_snapshot_change_without_writing_card() -> None:
    owner, role, profile, analysis, matching = graph()
    run_payload = payload(role, profile, analysis, matching)
    run = run_for(owner, run_payload)
    profile.version = 4
    session = ScriptedSession(owner.id, role, profile, analysis, matching)

    with pytest.raises(QuestionGenerationStateError) as error:
        asyncio.run(
            service_for(session).persist_success(run, output_for(run_payload))
        )

    assert error.value.code == QUESTION_GENERATION_PROFILE_VERSION_STALE
    assert session.added == []
    assert session.rollback_count == 1
