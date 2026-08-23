from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, TypeVar, cast
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.practice.question import QuestionGenerationAgent
from riva.agents.practice.question_types import (
    MAX_QUESTION_GENERATION_EDUCATION_ITEMS,
    MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS,
    MAX_QUESTION_GENERATION_PROFILE_SKILLS,
    MAX_QUESTION_GENERATION_PROJECT_EXPERIENCE_ITEMS,
    MAX_QUESTION_GENERATION_WORK_EXPERIENCE_ITEMS,
    QuestionGenerationEducationContext,
    QuestionGenerationInput,
    QuestionGenerationJobContext,
    QuestionGenerationMatchingAnalysisContext,
    QuestionGenerationOutput,
    QuestionGenerationProfileContext,
    QuestionGenerationProjectExperienceContext,
    QuestionGenerationTargetRoleContext,
    QuestionGenerationWeaknessEvidence,
    QuestionGenerationWorkExperienceContext,
)
from riva.agents.practice.reference_types import (
    PracticeReferenceFrozenContext,
    PracticeReferenceProjectEvidence,
    PracticeReferenceRoleContext,
    PracticeReferenceWorkEvidence,
)
from riva.core.language import InteractionLanguage
from riva.integrations.llm import LLMProvider
from riva.models import (
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
)
from riva.services.practice.question_types import (
    MAX_QUESTION_CARD_LIST_ITEMS,
    QuestionCardDifficulty,
    QuestionCardMaterialType,
    QuestionCardQuestionType,
)
from riva.services.practice.weakness import PracticeWeaknessFocus
from riva.services.profile.completion import career_profile_completed
from riva.services.training.memory import TrainingMemoryService
from riva.utils import utc_now

QuestionGenerationStateErrorCode = Literal[
    "question_generation_target_not_found",
    "question_generation_target_archived",
    "question_generation_profile_not_found",
    "question_generation_profile_incomplete",
    "question_generation_job_description_not_ready",
    "question_generation_job_description_analysis_not_ready",
    "question_generation_matching_analysis_not_ready",
    "question_generation_matching_analysis_stale",
]
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
QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY: QuestionGenerationStateErrorCode = (
    "question_generation_job_description_not_ready"
)
QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY: QuestionGenerationStateErrorCode = "question_generation_job_description_analysis_not_ready"
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


QuestionGenerationWeaknessFocusInput = PracticeWeaknessFocus | Iterable[object]
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
    return QuestionGenerationProfileContext(
        education=[
            QuestionGenerationEducationContext(
                school=item.school, degree=item.degree, major=item.major
            )
            for item in _ordered(
                profile.education, limit=MAX_QUESTION_GENERATION_EDUCATION_ITEMS
            )
        ],
        work_experiences=[
            QuestionGenerationWorkExperienceContext(
                id=item.id,
                company=item.company,
                title=item.title,
                responsibilities=_stable_unique_texts(
                    item.responsibilities, limit=MAX_QUESTION_CARD_LIST_ITEMS
                ),
                achievements=_stable_unique_texts(
                    item.achievements, limit=MAX_QUESTION_CARD_LIST_ITEMS
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
        ],
        project_experiences=[
            QuestionGenerationProjectExperienceContext(
                id=item.id,
                name=item.name,
                role=item.role,
                responsibilities=_stable_unique_texts(
                    item.responsibilities, limit=MAX_QUESTION_CARD_LIST_ITEMS
                ),
                achievements=_stable_unique_texts(
                    item.achievements, limit=MAX_QUESTION_CARD_LIST_ITEMS
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
        ],
        skills=_stable_unique_texts(
            [item.name for item in _ordered(profile.skills, limit=None)],
            limit=MAX_QUESTION_GENERATION_PROFILE_SKILLS,
        ),
    )


def build_question_generation_job_context(
    role: TargetRole, analysis: JobDescriptionAnalysis
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
    role: TargetRole,
    profile: CareerProfile,
    job_description_analysis: JobDescriptionAnalysis,
    matching_analysis: MatchingAnalysis,
    interaction_language: InteractionLanguage,
    question_type: QuestionCardQuestionType,
    difficulty: QuestionCardDifficulty,
    weakness_focus: QuestionGenerationWeaknessFocusInput | None = None,
    training_memory: object | None = None,
) -> QuestionGenerationInput:
    return QuestionGenerationInput(
        interaction_language=interaction_language,
        question_type=question_type,
        difficulty=difficulty,
        weakness_focus=_snapshot_weakness_focus(weakness_focus),
        training_memory=training_memory,
        target_role=build_question_generation_target_role_context(role),
        career_profile=build_question_generation_profile_context(profile),
        job_description_analysis=build_question_generation_job_context(
            role, job_description_analysis
        ),
        matching_analysis=build_question_generation_matching_context(matching_analysis),
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
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.training_memory_service_factory = training_memory_service_factory
        self.clock = clock

    async def generate(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        question_type: QuestionCardQuestionType,
        difficulty: QuestionCardDifficulty,
        interaction_language: InteractionLanguage,
        weakness_focus: QuestionGenerationWeaknessFocusInput | None = None,
        commit: bool = True,
    ) -> QuestionCard:
        self._require_configuration()
        context = await self._load_context(
            user_id=user_id, role_id=target_role_id, for_update=True
        )
        memory = await self.training_memory_service_factory(self.session).get_context(
            user_id
        )
        input_snapshot = build_question_generation_input(
            role=context.role,
            profile=context.profile,
            job_description_analysis=context.job_description_analysis,
            matching_analysis=context.matching_analysis,
            interaction_language=interaction_language,
            question_type=question_type,
            difficulty=difficulty,
            weakness_focus=weakness_focus,
            training_memory=memory,
        )
        result = await QuestionGenerationAgent(self.llm_provider, self.llm_model).run(
            input_snapshot
        )
        card = self._persist_card(context, input_snapshot, result.output)
        if commit:
            await self.session.commit()
        return card

    def _persist_card(
        self,
        context: _QuestionGenerationContext,
        input_snapshot: QuestionGenerationInput,
        output: QuestionGenerationOutput,
    ) -> QuestionCard:
        if (
            output.question_type != input_snapshot.question_type
            or output.difficulty != input_snapshot.difficulty
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_MATCHING_ANALYSIS_STALE
            )
        now = self.clock()
        _require_aware_datetime(now)
        values = output.model_dump(mode="json")
        frozen_context = build_practice_reference_frozen_context(context, output)
        card = QuestionCard(
            id=uuid4(),
            user_id=context.role.user_id,
            target_role_id=context.role.id,
            profile_id=context.profile.profile_id,
            language=input_snapshot.interaction_language,
            question_type=output.question_type.value,
            difficulty=output.difficulty.value,
            prompt=cast(str, values["prompt"]),
            assessed_capabilities=cast(list[str], values["assessed_capabilities"]),
            recommended_materials=cast(
                list[dict[str, object]], values["recommended_materials"]
            ),
            answer_hints=cast(list[str], values["answer_hints"]),
            answer_framework=cast(list[str], values["answer_framework"]),
            follow_up_directions=cast(list[str], values["follow_up_directions"]),
            scoring_focus=cast(list[str], values["scoring_focus"]),
            profile_version=context.profile.version,
            job_description_version=context.role.job_description_version,
            job_description_analysis_version=context.job_description_analysis.analysis_version,
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
                frozen_context=frozen_context.model_dump(mode="json", by_alias=True),
                created_at=now,
            )
        )
        return card

    async def _load_context(
        self, *, user_id: UUID, role_id: UUID, for_update: bool
    ) -> _QuestionGenerationContext:
        role_statement = select(TargetRole).where(
            TargetRole.id == role_id, TargetRole.user_id == user_id
        )
        if for_update:
            role_statement = role_statement.with_for_update()
        role = await self.session.scalar(role_statement)
        if role is None:
            raise QuestionGenerationStateError(QUESTION_GENERATION_TARGET_NOT_FOUND)
        if role.preparation_status == "archived":
            raise QuestionGenerationStateError(QUESTION_GENERATION_TARGET_ARCHIVED)
        profile_statement = (
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(CareerProfile.user_id == user_id)
        )
        if for_update:
            profile_statement = profile_statement.with_for_update()
        profile = await self.session.scalar(profile_statement)
        if profile is None:
            raise QuestionGenerationStateError(QUESTION_GENERATION_PROFILE_NOT_FOUND)
        if not career_profile_completed(profile):
            raise QuestionGenerationStateError(QUESTION_GENERATION_PROFILE_INCOMPLETE)
        if (
            role.job_description_status != "saved"
            or not role.raw_job_description
            or role.job_description_version is None
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_NOT_READY
            )
        analysis = await self.session.scalar(
            select(JobDescriptionAnalysis).where(
                JobDescriptionAnalysis.role_id == role.id,
                JobDescriptionAnalysis.user_id == user_id,
            )
        )
        if (
            analysis is None
            or analysis.job_description_version != role.job_description_version
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_JOB_DESCRIPTION_ANALYSIS_NOT_READY
            )
        matching = await self.session.scalar(
            select(MatchingAnalysis).where(
                MatchingAnalysis.role_id == role.id, MatchingAnalysis.user_id == user_id
            )
        )
        if (
            matching is None
            or matching.profile_id != profile.profile_id
            or matching.profile_version != profile.version
            or matching.job_description_version != role.job_description_version
            or matching.job_description_analysis_version != analysis.analysis_version
        ):
            raise QuestionGenerationStateError(
                QUESTION_GENERATION_MATCHING_ANALYSIS_STALE
            )
        return _QuestionGenerationContext(role, profile, analysis, matching)

    def _require_configuration(self) -> None:
        if self.llm_provider is None or not self.llm_model:
            raise ValueError("llm provider and model must be configured")


def build_practice_reference_frozen_context(
    context: _QuestionGenerationContext, output: QuestionGenerationOutput
) -> PracticeReferenceFrozenContext:
    role_context = PracticeReferenceRoleContext(
        title=context.role.title,
        company=context.role.company,
        riva_summary=context.job_description_analysis.riva_summary,
        responsibilities=context.job_description_analysis.responsibilities,
        qualification_requirements=context.job_description_analysis.qualification_requirements,
        required_skills=context.job_description_analysis.required_skills,
        business_domains=context.job_description_analysis.business_domains,
    )
    work_by_id = {item.id: item for item in context.profile.work_experiences}
    project_by_id = {item.id: item for item in context.profile.project_experiences}
    evidence = []
    for material in output.recommended_materials:
        if material.type is QuestionCardMaterialType.WORK_EXPERIENCE:
            item = work_by_id.get(material.id)
            if item is None:
                raise QuestionGenerationStateError(
                    QUESTION_GENERATION_PROFILE_INCOMPLETE
                )
            evidence.append(
                PracticeReferenceWorkEvidence(
                    type="workExperience",
                    id=item.id,
                    company=item.company,
                    title=item.title,
                    responsibilities=_stable_unique_texts(
                        item.responsibilities, limit=MAX_QUESTION_CARD_LIST_ITEMS
                    ),
                    achievements=_stable_unique_texts(
                        item.achievements, limit=MAX_QUESTION_CARD_LIST_ITEMS
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
                raise QuestionGenerationStateError(
                    QUESTION_GENERATION_PROFILE_INCOMPLETE
                )
            evidence.append(
                PracticeReferenceProjectEvidence(
                    type="projectExperience",
                    id=item.id,
                    name=item.name,
                    role=item.role,
                    responsibilities=_stable_unique_texts(
                        item.responsibilities, limit=MAX_QUESTION_CARD_LIST_ITEMS
                    ),
                    achievements=_stable_unique_texts(
                        item.achievements, limit=MAX_QUESTION_CARD_LIST_ITEMS
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
            raise QuestionGenerationStateError(QUESTION_GENERATION_PROFILE_INCOMPLETE)
    return PracticeReferenceFrozenContext(
        target_role=role_context, candidate_evidence=evidence
    )


def _snapshot_weakness_focus(
    weakness_focus: QuestionGenerationWeaknessFocusInput | None,
) -> list[QuestionGenerationWeaknessEvidence]:
    if weakness_focus is None:
        return []
    values = (
        weakness_focus.evidence
        if isinstance(weakness_focus, PracticeWeaknessFocus)
        else weakness_focus
    )
    try:
        return [
            QuestionGenerationWeaknessEvidence.model_validate(
                value, from_attributes=True
            )
            for value in values
        ]
    except TypeError, ValueError, ValidationError:
        raise ValueError("weakness focus is invalid") from None


def _stable_unique_texts(values: Iterable[str], *, limit: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result[:limit]


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
