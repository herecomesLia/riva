from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, TypeVar, cast
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.language import InteractionLanguage
from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    PracticeQuestionReferenceContext,
    QuestionCard,
    TargetRole,
    User,
)
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_LIST_ITEMS,
    QuestionCardDifficulty,
    QuestionCardMaterialType,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import (
    MAX_QUESTION_GENERATION_EDUCATION_ITEMS,
    MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
    MAX_QUESTION_GENERATION_PROJECT_EXPERIENCE_ITEMS,
    MAX_QUESTION_GENERATION_PROFILE_SKILLS,
    MAX_QUESTION_GENERATION_WORK_EXPERIENCE_ITEMS,
    QuestionGenerationEducationContext,
    QuestionGenerationInput,
    QuestionGenerationJobContext,
    QuestionGenerationMatchingAnalysisContext,
    QuestionGenerationOutput,
    QuestionGenerationProfileContext,
    QuestionGenerationProjectExperienceContext,
    QuestionGenerationRunPayload,
    QuestionGenerationTargetRoleContext,
    QuestionGenerationWorkExperienceContext,
)
from riva.schemas.practice_reference_answer import (
    PracticeReferenceFrozenContext,
    PracticeReferenceProjectEvidence,
    PracticeReferenceRoleContext,
    PracticeReferenceWorkEvidence,
)
from riva.services.agent_runs import AgentRunService
from riva.services.profile_completion import career_profile_completed
from riva.utils import utc_now


QuestionGenerationStateErrorCode = Literal[
    "invalid_question_generation_run",
    "question_generation_target_not_found",
    "question_generation_target_archived",
    "question_generation_profile_not_found",
    "question_generation_profile_incomplete",
    "question_generation_profile_version_stale",
    "question_generation_job_description_not_ready",
    "question_generation_job_description_version_stale",
    "question_generation_job_description_analysis_not_ready",
    "question_generation_job_description_analysis_version_stale",
    "question_generation_matching_analysis_not_ready",
    "question_generation_matching_analysis_stale",
]

INVALID_QUESTION_GENERATION_RUN: QuestionGenerationStateErrorCode = (
    "invalid_question_generation_run"
)
QUESTION_GENERATION_TARGET_NOT_FOUND: QuestionGenerationStateErrorCode = (
    "question_generation_target_not_found"
)
QUESTION_GENERATION_TARGET_ARCHIVED: QuestionGenerationStateErrorCode = (
    "question_generation_target_archived"
)
QUESTION_GENERATION_PROFILE_NOT_FOUND: QuestionGenerationStateErrorCode = (
    "question_generation_profile_not_found"
)
QUESTION_GENERATION_PROFILE_INCOMPLETE: QuestionGenerationStateErrorCode = (
    "question_generation_profile_incomplete"
)
QUESTION_GENERATION_PROFILE_VERSION_STALE: QuestionGenerationStateErrorCode = (
    "question_generation_profile_version_stale"
)
QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY: QuestionGenerationStateErrorCode = (
    "question_generation_job_description_not_ready"
)
QUESTION_GENERATION_JOB_DESCRIPTION_VERSION_STALE: QuestionGenerationStateErrorCode = (
    "question_generation_job_description_version_stale"
)
QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY: QuestionGenerationStateErrorCode = (
    "question_generation_job_description_analysis_not_ready"
)
QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE: QuestionGenerationStateErrorCode = (
    "question_generation_job_description_analysis_version_stale"
)
QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY: QuestionGenerationStateErrorCode = (
    "question_generation_matching_analysis_not_ready"
)
QUESTION_GENERATION_MATCHING_ANALYSIS_STALE: QuestionGenerationStateErrorCode = (
    "question_generation_matching_analysis_stale"
)


class QuestionGenerationStateError(RuntimeError):
    safe_message = "The question generation state is invalid."

    def __init__(self, code: QuestionGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


def validate_question_generation_run(
    run: AgentRun,
) -> QuestionGenerationRunPayload:
    """Validate the immutable contract shared by generation consumers."""

    prompt = QUESTION_GENERATION_PROMPT
    if (
        run.agent_id != "question-generator"
        or run.prompt_id != prompt.prompt_id
        or run.prompt_version != prompt.version
        or run.output_schema_id != prompt.output_schema_id
    ):
        raise QuestionGenerationStateError(INVALID_QUESTION_GENERATION_RUN)
    try:
        return QuestionGenerationRunPayload.model_validate(run.payload)
    except ValidationError:
        raise QuestionGenerationStateError(
            INVALID_QUESTION_GENERATION_RUN
        ) from None


def validate_question_card_generation_lineage(
    card: QuestionCard,
    run: AgentRun,
) -> QuestionGenerationRunPayload:
    payload = validate_question_generation_run(run)
    try:
        matches = _question_card_lineage_matches(card, run, payload)
    except (AttributeError, TypeError, ValueError):
        matches = False
    if not matches:
        raise QuestionGenerationStateError(INVALID_QUESTION_GENERATION_RUN)
    return payload


_Item = TypeVar("_Item")


@dataclass(frozen=True)
class _QuestionGenerationContext:
    role: TargetRole
    profile: CareerProfile
    job_description_analysis: JobDescriptionAnalysis
    matching_analysis: MatchingAnalysis


def build_question_generation_target_role_context(
    role: TargetRole,
) -> QuestionGenerationTargetRoleContext:
    return QuestionGenerationTargetRoleContext(
        id=role.id,
        title=role.title,
        company=role.company,
        recruitment_type=role.recruitment_type,
        location=role.location,
    )


def build_question_generation_profile_context(
    profile: CareerProfile,
) -> QuestionGenerationProfileContext:
    education = [
        QuestionGenerationEducationContext(
            school=item.school,
            degree=item.degree,
            major=item.major,
        )
        for item in _ordered(
            profile.education,
            limit=MAX_QUESTION_GENERATION_EDUCATION_ITEMS,
        )
    ]
    work_experiences = [
        QuestionGenerationWorkExperienceContext(
            id=item.id,
            company=item.company,
            title=item.title,
            responsibilities=_stable_unique_texts(
                item.responsibilities,
                limit=MAX_QUESTION_CARD_LIST_ITEMS,
            ),
            achievements=_stable_unique_texts(
                item.achievements,
                limit=MAX_QUESTION_CARD_LIST_ITEMS,
            ),
            skills=_stable_unique_texts(
                [
                    link.skill.name
                    for link in _ordered(item.skill_links, limit=None)
                ],
                limit=MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
            ),
        )
        for item in _ordered(
            profile.work_experiences,
            limit=MAX_QUESTION_GENERATION_WORK_EXPERIENCE_ITEMS,
        )
    ]
    project_experiences = [
        QuestionGenerationProjectExperienceContext(
            id=item.id,
            name=item.name,
            role=item.role,
            responsibilities=_stable_unique_texts(
                item.responsibilities,
                limit=MAX_QUESTION_CARD_LIST_ITEMS,
            ),
            achievements=_stable_unique_texts(
                item.achievements,
                limit=MAX_QUESTION_CARD_LIST_ITEMS,
            ),
            skills=_stable_unique_texts(
                [
                    link.skill.name
                    for link in _ordered(item.skill_links, limit=None)
                ],
                limit=MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
            ),
        )
        for item in _ordered(
            profile.project_experiences,
            limit=MAX_QUESTION_GENERATION_PROJECT_EXPERIENCE_ITEMS,
        )
    ]
    return QuestionGenerationProfileContext(
        education=education,
        work_experiences=work_experiences,
        project_experiences=project_experiences,
        skills=_stable_unique_texts(
            [item.name for item in _ordered(profile.skills, limit=None)],
            limit=MAX_QUESTION_GENERATION_PROFILE_SKILLS,
        ),
    )


def build_question_generation_job_context(
    role: TargetRole,
    analysis: JobDescriptionAnalysis,
) -> QuestionGenerationJobContext:
    return QuestionGenerationJobContext(
        role_title=role.title,
        company=role.company,
        riva_summary=analysis.riva_summary,
        responsibilities=analysis.responsibilities,
        qualification_requirements=analysis.qualification_requirements,
        required_skills=analysis.required_skills,
        preferred_qualifications=analysis.preferred_qualifications,
        soft_skills=analysis.soft_skills,
        business_domains=analysis.business_domains,
    )


def build_question_generation_matching_context(
    matching: MatchingAnalysis,
) -> QuestionGenerationMatchingAnalysisContext:
    return QuestionGenerationMatchingAnalysisContext(
        overall_match_score=matching.overall_match_score,
        core_requirements_summary=matching.core_requirements_summary,
        matched_capabilities=matching.matched_capabilities,
        missing_capabilities=matching.missing_capabilities,
        underrepresented_capabilities=matching.underrepresented_capabilities,
        resume_highlights=matching.resume_highlights,
        resume_gaps=matching.resume_gaps,
        high_risk_questions=matching.high_risk_questions,
        preparation_recommendations=matching.preparation_recommendations,
    )


def build_question_generation_input(
    *,
    payload: QuestionGenerationRunPayload,
    role: TargetRole,
    profile: CareerProfile,
    job_description_analysis: JobDescriptionAnalysis,
    matching_analysis: MatchingAnalysis,
) -> QuestionGenerationInput:
    return QuestionGenerationInput(
        interaction_language=payload.interaction_language,
        question_type=payload.question_type,
        difficulty=payload.difficulty,
        target_role=build_question_generation_target_role_context(role),
        career_profile=build_question_generation_profile_context(profile),
        job_description_analysis=build_question_generation_job_context(
            role,
            job_description_analysis,
        ),
        matching_analysis=build_question_generation_matching_context(
            matching_analysis
        ),
    )


def question_generation_output_from_card(
    card: QuestionCard,
) -> QuestionGenerationOutput:
    return QuestionGenerationOutput.model_validate(
        {
            "prompt": card.prompt,
            "question_type": QuestionCardQuestionType(card.question_type),
            "difficulty": QuestionCardDifficulty(card.difficulty),
            "assessed_capabilities": card.assessed_capabilities,
            "recommended_materials": card.recommended_materials,
            "answer_hints": card.answer_hints,
            "answer_framework": card.answer_framework,
            "follow_up_directions": card.follow_up_directions,
            "scoring_focus": card.scoring_focus,
        }
    )


class QuestionGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: Callable[[AsyncSession], AgentRunService] = (
            AgentRunService
        ),
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory
        self.clock = clock

    async def enqueue_generation(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        question_type: QuestionCardQuestionType,
        difficulty: QuestionCardDifficulty,
        interaction_language: InteractionLanguage,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            run = await self.enqueue_generation_in_transaction(
                user_id=user_id,
                target_role_id=target_role_id,
                question_type=question_type,
                difficulty=difficulty,
                interaction_language=interaction_language,
                idempotency_key=idempotency_key,
            )
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def enqueue_generation_in_transaction(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        question_type: QuestionCardQuestionType,
        difficulty: QuestionCardDifficulty,
        interaction_language: InteractionLanguage,
        idempotency_key: str,
    ) -> AgentRun:
        self._require_configuration()
        await self._lock_user(user_id)
        context = await self._load_context(
            user_id=user_id,
            role_id=target_role_id,
            for_update=True,
        )
        payload = QuestionGenerationRunPayload(
            role_id=context.role.id,
            profile_id=context.profile.profile_id,
            profile_version=context.profile.version,
            job_description_version=cast(
                int,
                context.role.job_description_version,
            ),
            job_description_analysis_version=(
                context.job_description_analysis.analysis_version
            ),
            matching_analysis_run_id=(
                context.matching_analysis.source_agent_run_id
            ),
            interaction_language=interaction_language,
            question_type=question_type,
            difficulty=difficulty,
        )
        _build_context_input(context, payload)
        prompt = QUESTION_GENERATION_PROMPT
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="question-generator",
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> QuestionGenerationInput:
        try:
            payload = validate_question_generation_run(run)
            context = await self._load_context(
                user_id=run.user_id,
                role_id=payload.role_id,
                profile_id=payload.profile_id,
                profile_version=payload.profile_version,
                job_description_version=payload.job_description_version,
                job_description_analysis_version=(
                    payload.job_description_analysis_version
                ),
                matching_analysis_run_id=payload.matching_analysis_run_id,
                for_update=False,
            )
            result = _build_context_input(context, payload)
            await self.session.commit()
            return result
        except Exception:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: QuestionGenerationOutput,
    ) -> QuestionCard:
        try:
            payload = validate_question_generation_run(run)
            await self._lock_user(run.user_id)
            if not isinstance(output, QuestionGenerationOutput):
                raise QuestionGenerationStateError(INVALID_QUESTION_GENERATION_RUN)
            if (
                output.question_type != payload.question_type
                or output.difficulty != payload.difficulty
            ):
                raise QuestionGenerationStateError(INVALID_QUESTION_GENERATION_RUN)

            existing = await self.session.scalar(
                select(QuestionCard)
                .where(QuestionCard.source_agent_run_id == run.id)
                .with_for_update()
            )
            if existing is not None:
                validate_question_card_generation_lineage(existing, run)
                reference_context = await self.session.scalar(
                    select(PracticeQuestionReferenceContext)
                    .where(
                        PracticeQuestionReferenceContext.question_card_id
                        == existing.id
                    )
                    .with_for_update()
                )
                if reference_context is None:
                    raise QuestionGenerationStateError(
                        INVALID_QUESTION_GENERATION_RUN
                    )
                try:
                    PracticeReferenceFrozenContext.model_validate(
                        reference_context.frozen_context
                    )
                except (TypeError, ValueError, ValidationError):
                    raise QuestionGenerationStateError(
                        INVALID_QUESTION_GENERATION_RUN
                    ) from None
                await self.session.commit()
                return existing

            context = await self._load_context(
                user_id=run.user_id,
                role_id=payload.role_id,
                profile_id=payload.profile_id,
                profile_version=payload.profile_version,
                job_description_version=payload.job_description_version,
                job_description_analysis_version=(
                    payload.job_description_analysis_version
                ),
                matching_analysis_run_id=payload.matching_analysis_run_id,
                for_update=True,
            )
            _build_context_input(context, payload)

            now = self.clock()
            _require_aware_datetime(now)
            values = output.model_dump(mode="json")
            frozen_context = build_practice_reference_frozen_context(
                context,
                output,
            )
            card = QuestionCard(
                id=uuid4(),
                user_id=run.user_id,
                target_role_id=payload.role_id,
                profile_id=payload.profile_id,
                source_agent_run_id=run.id,
                matching_analysis_run_id=payload.matching_analysis_run_id,
                language=payload.interaction_language,
                question_type=output.question_type.value,
                difficulty=output.difficulty.value,
                prompt=cast(str, values["prompt"]),
                assessed_capabilities=cast(
                    list[str],
                    values["assessed_capabilities"],
                ),
                recommended_materials=cast(
                    list[dict[str, object]],
                    values["recommended_materials"],
                ),
                answer_hints=cast(list[str], values["answer_hints"]),
                answer_framework=cast(
                    list[str],
                    values["answer_framework"],
                ),
                follow_up_directions=cast(
                    list[str],
                    values["follow_up_directions"],
                ),
                scoring_focus=cast(list[str], values["scoring_focus"]),
                profile_version=payload.profile_version,
                job_description_version=payload.job_description_version,
                job_description_analysis_version=(
                    payload.job_description_analysis_version
                ),
                is_saved=False,
                is_marked_weak=False,
                answer_hints_revealed=False,
                answer_framework_revealed=False,
                created_at=now,
                updated_at=now,
            )
            self.session.add(card)
            self.session.add(
                PracticeQuestionReferenceContext(
                    question_card_id=card.id,
                    frozen_context=frozen_context.model_dump(
                        mode="json",
                        by_alias=True,
                    ),
                    created_at=now,
                )
            )
            await self.session.commit()
            return card
        except Exception:
            await self.session.rollback()
            raise

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )

    async def _load_context(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        profile_id: UUID | None = None,
        profile_version: int | None = None,
        job_description_version: int | None = None,
        job_description_analysis_version: int | None = None,
        matching_analysis_run_id: UUID | None = None,
        for_update: bool,
    ) -> _QuestionGenerationContext:
        role_statement = select(TargetRole).where(
            TargetRole.id == role_id,
            TargetRole.user_id == user_id,
        )
        if for_update:
            role_statement = role_statement.with_for_update()
        role = await self.session.scalar(role_statement)
        if role is None:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_TARGET_NOT_FOUND
            )
        if role.preparation_status == "archived":
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_TARGET_ARCHIVED
            )

        profile_statement = (
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(CareerProfile.user_id == user_id)
        )
        if profile_id is not None:
            profile_statement = profile_statement.where(
                CareerProfile.profile_id == profile_id
            )
        if for_update:
            profile_statement = profile_statement.with_for_update()
        profile = await self.session.scalar(profile_statement)
        if profile is None:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_PROFILE_NOT_FOUND
            )
        if profile_version is not None and profile.version != profile_version:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_PROFILE_VERSION_STALE
            )
        if not career_profile_completed(profile):
            raise QuestionGenerationStateError(QUESTION_GENERATION_PROFILE_INCOMPLETE)

        if (
            role.job_description_status != "saved"
            or role.raw_job_description is None
            or not role.raw_job_description.strip()
            or role.job_description_version is None
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY
            )
        if (
            job_description_version is not None
            and role.job_description_version != job_description_version
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_VERSION_STALE
            )

        analysis_statement = select(JobDescriptionAnalysis).where(
            JobDescriptionAnalysis.role_id == role.id,
            JobDescriptionAnalysis.user_id == user_id,
        )
        if for_update:
            analysis_statement = analysis_statement.with_for_update()
        analysis = await self.session.scalar(analysis_statement)
        if analysis is None:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY
            )
        if analysis.job_description_version != role.job_description_version:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY
            )
        if (
            job_description_analysis_version is not None
            and analysis.analysis_version != job_description_analysis_version
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE
            )

        matching_statement = select(MatchingAnalysis).where(
            MatchingAnalysis.role_id == role.id,
            MatchingAnalysis.user_id == user_id,
        )
        if for_update:
            matching_statement = matching_statement.with_for_update()
        matching = await self.session.scalar(matching_statement)
        if matching is None or role.matching_analysis_run_id is None:
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY
            )
        if (
            matching.source_agent_run_id != role.matching_analysis_run_id
            or matching.profile_id != profile.profile_id
            or matching.profile_version != profile.version
            or matching.job_description_version != role.job_description_version
            or matching.job_description_analysis_version
            != analysis.analysis_version
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_MATCHING_ANALYSIS_STALE
            )
        if (
            matching_analysis_run_id is not None
            and matching.source_agent_run_id != matching_analysis_run_id
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_MATCHING_ANALYSIS_STALE
            )

        return _QuestionGenerationContext(
            role=role,
            profile=profile,
            job_description_analysis=analysis,
            matching_analysis=matching,
        )

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _build_context_input(
    context: _QuestionGenerationContext,
    payload: QuestionGenerationRunPayload,
) -> QuestionGenerationInput:
    try:
        target_role = build_question_generation_target_role_context(
            context.role
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            QUESTION_GENERATION_TARGET_NOT_FOUND
        ) from None
    try:
        career_profile = build_question_generation_profile_context(
            context.profile
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            QUESTION_GENERATION_PROFILE_INCOMPLETE
        ) from None
    try:
        job_description_analysis = build_question_generation_job_context(
            context.role,
            context.job_description_analysis,
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY
        ) from None
    try:
        matching_analysis = build_question_generation_matching_context(
            context.matching_analysis
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY
        ) from None
    try:
        return QuestionGenerationInput(
            interaction_language=payload.interaction_language,
            question_type=payload.question_type,
            difficulty=payload.difficulty,
            target_role=target_role,
            career_profile=career_profile,
            job_description_analysis=job_description_analysis,
            matching_analysis=matching_analysis,
        )
    except (TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            INVALID_QUESTION_GENERATION_RUN
        ) from None


def _question_card_lineage_matches(
    card: QuestionCard,
    run: AgentRun,
    payload: QuestionGenerationRunPayload,
) -> bool:
    return (
        card.user_id == run.user_id
        and card.target_role_id == payload.role_id
        and card.profile_id == payload.profile_id
        and card.source_agent_run_id == run.id
        and card.matching_analysis_run_id == payload.matching_analysis_run_id
        and card.language == payload.interaction_language
        and card.question_type == payload.question_type.value
        and card.difficulty == payload.difficulty.value
        and card.profile_version == payload.profile_version
        and card.job_description_version == payload.job_description_version
        and card.job_description_analysis_version
        == payload.job_description_analysis_version
    )


def build_practice_reference_frozen_context(
    context: _QuestionGenerationContext,
    output: QuestionGenerationOutput,
) -> PracticeReferenceFrozenContext:
    try:
        role_context = PracticeReferenceRoleContext(
            title=context.role.title,
            company=context.role.company,
            riva_summary=context.job_description_analysis.riva_summary,
            responsibilities=context.job_description_analysis.responsibilities,
            qualification_requirements=(
                context.job_description_analysis.qualification_requirements
            ),
            required_skills=context.job_description_analysis.required_skills,
            business_domains=context.job_description_analysis.business_domains,
        )
        work_by_id = {
            item.id: item for item in context.profile.work_experiences
        }
        project_by_id = {
            item.id: item for item in context.profile.project_experiences
        }
        evidence = []
        for material in output.recommended_materials:
            if material.type is QuestionCardMaterialType.WORK_EXPERIENCE:
                item = work_by_id.get(material.id)
                if item is None:
                    raise ValueError("recommended work material is not canonical")
                evidence.append(
                    PracticeReferenceWorkEvidence(
                        type="workExperience",
                        id=item.id,
                        company=item.company,
                        title=item.title,
                        responsibilities=_stable_unique_texts(
                            item.responsibilities,
                            limit=MAX_QUESTION_CARD_LIST_ITEMS,
                        ),
                        achievements=_stable_unique_texts(
                            item.achievements,
                            limit=MAX_QUESTION_CARD_LIST_ITEMS,
                        ),
                        skills=_stable_unique_texts(
                            [
                                link.skill.name
                                for link in _ordered(item.skill_links, limit=None)
                            ],
                            limit=MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
                        ),
                    )
                )
            elif material.type is QuestionCardMaterialType.PROJECT_EXPERIENCE:
                item = project_by_id.get(material.id)
                if item is None:
                    raise ValueError(
                        "recommended project material is not canonical"
                    )
                evidence.append(
                    PracticeReferenceProjectEvidence(
                        type="projectExperience",
                        id=item.id,
                        name=item.name,
                        role=item.role,
                        responsibilities=_stable_unique_texts(
                            item.responsibilities,
                            limit=MAX_QUESTION_CARD_LIST_ITEMS,
                        ),
                        achievements=_stable_unique_texts(
                            item.achievements,
                            limit=MAX_QUESTION_CARD_LIST_ITEMS,
                        ),
                        skills=_stable_unique_texts(
                            [
                                link.skill.name
                                for link in _ordered(item.skill_links, limit=None)
                            ],
                            limit=MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
                        ),
                    )
                )
            else:
                raise ValueError("recommended material type is invalid")
        return PracticeReferenceFrozenContext(
            target_role=role_context,
            candidate_evidence=evidence,
        )
    except (AttributeError, KeyError, TypeError, ValueError, ValidationError):
        raise QuestionGenerationStateError(
            INVALID_QUESTION_GENERATION_RUN
        ) from None


def _stable_unique_texts(
    values: Iterable[str],
    *,
    limit: int,
) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            raise ValueError("question generation context text must be a string")
        value = value.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized[:limit]


def _ordered(items: Iterable[_Item], *, limit: int | None) -> list[_Item]:
    ordered = sorted(
        items,
        key=lambda item: (
            cast(int, getattr(item, "position")),
            str(getattr(item, "id")),
        ),
    )
    return ordered if limit is None else ordered[:limit]


def _career_profile_loader_options() -> tuple[object, ...]:
    return (
        selectinload(CareerProfile.education),
        selectinload(CareerProfile.skills),
        selectinload(CareerProfile.work_experiences)
        .selectinload(CareerProfileWorkExperience.skill_links)
        .selectinload(CareerProfileWorkSkill.skill),
        selectinload(CareerProfile.project_experiences)
        .selectinload(CareerProfileProjectExperience.skill_links)
        .selectinload(CareerProfileProjectSkill.skill),
    )


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INVALID_QUESTION_GENERATION_RUN",
    "QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY",
    "QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE",
    "QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY",
    "QUESTION_GENERATION_JOB_DESCRIPTION_VERSION_STALE",
    "QUESTION_GENERATION_MATCHING_ANALYSIS_NOT_READY",
    "QUESTION_GENERATION_MATCHING_ANALYSIS_STALE",
    "QUESTION_GENERATION_PROFILE_INCOMPLETE",
    "QUESTION_GENERATION_PROFILE_NOT_FOUND",
    "QUESTION_GENERATION_PROFILE_VERSION_STALE",
    "QUESTION_GENERATION_TARGET_ARCHIVED",
    "QUESTION_GENERATION_TARGET_NOT_FOUND",
    "QuestionGenerationService",
    "QuestionGenerationStateError",
    "build_practice_reference_frozen_context",
    "build_question_generation_input",
    "build_question_generation_job_context",
    "build_question_generation_matching_context",
    "build_question_generation_profile_context",
    "build_question_generation_target_role_context",
    "question_generation_output_from_card",
    "validate_question_card_generation_lineage",
    "validate_question_generation_run",
]
