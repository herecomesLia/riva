from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from riva.agents.jobs.jd_parser_types import (
    Company,
    JobDescriptionParsingOutput,
    RoleTitle,
)
from riva.agents.jobs.matcher_types import MatchingAnalysisOutput
from riva.agents.training.memory_types import TrainingMemoryContext
from riva.agents.types import (
    OptionalText,
    QuestionCardDifficulty,
    QuestionCardMaterialList,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
    RequiredText,
    StandardUUID,
    TargetRoleRecruitmentType,
)
from riva.core.language import InteractionLanguage

MAX_QUESTION_GENERATION_EDUCATION_ITEMS = 20
MAX_QUESTION_GENERATION_WORK_EXPERIENCE_ITEMS = 20
MAX_QUESTION_GENERATION_PROJECT_EXPERIENCE_ITEMS = 20
MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS = 100
MAX_QUESTION_GENERATION_PROFILE_SKILLS = 200
MAX_QUESTION_GENERATION_WEAKNESS_FOCUS_ITEMS = 8


def _normalize_text_list(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized: list[object] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            normalized.append(item)
            continue
        item = item.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


QuestionGenerationSkill = RequiredText
QuestionGenerationSkillList = Annotated[
    list[QuestionGenerationSkill],
    BeforeValidator(_normalize_text_list),
    Field(max_length=MAX_QUESTION_GENERATION_EXPERIENCE_SKILLS),
]
QuestionGenerationProfileSkillList = Annotated[
    list[QuestionGenerationSkill],
    BeforeValidator(_normalize_text_list),
    Field(max_length=MAX_QUESTION_GENERATION_PROFILE_SKILLS),
]


class _QuestionGenerationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuestionGenerationWeaknessEvidence(_QuestionGenerationModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )

    weakness: RequiredText
    source_attempt_id: StandardUUID = Field(alias="sourceAttemptId")
    source_target_role_id: StandardUUID = Field(alias="sourceTargetRoleId")
    source_question_type: QuestionCardQuestionType = Field(alias="sourceQuestionType")
    reviewed_at: datetime = Field(alias="reviewedAt")


class QuestionGenerationTargetRoleContext(_QuestionGenerationModel):
    id: StandardUUID
    title: RoleTitle
    company: Company
    recruitment_type: TargetRoleRecruitmentType | None
    location: OptionalText


class QuestionGenerationEducationContext(_QuestionGenerationModel):
    school: RequiredText
    degree: OptionalText
    major: OptionalText


class QuestionGenerationWorkExperienceContext(_QuestionGenerationModel):
    id: StandardUUID
    company: RequiredText
    title: RequiredText
    responsibilities: QuestionCardTextList
    achievements: QuestionCardTextList
    skills: QuestionGenerationSkillList


class QuestionGenerationProjectExperienceContext(_QuestionGenerationModel):
    id: StandardUUID
    name: RequiredText
    role: OptionalText
    responsibilities: QuestionCardTextList = Field(default_factory=list)
    achievements: QuestionCardTextList
    skills: QuestionGenerationSkillList


class QuestionGenerationProfileContext(_QuestionGenerationModel):
    education: list[QuestionGenerationEducationContext] = Field(
        max_length=MAX_QUESTION_GENERATION_EDUCATION_ITEMS
    )
    work_experiences: list[QuestionGenerationWorkExperienceContext] = Field(
        max_length=MAX_QUESTION_GENERATION_WORK_EXPERIENCE_ITEMS
    )
    project_experiences: list[QuestionGenerationProjectExperienceContext] = Field(
        max_length=MAX_QUESTION_GENERATION_PROJECT_EXPERIENCE_ITEMS
    )
    skills: QuestionGenerationProfileSkillList


class QuestionGenerationJobContext(JobDescriptionParsingOutput):
    role_title: RoleTitle
    company: Company


class QuestionGenerationMatchingAnalysisContext(MatchingAnalysisOutput):
    pass


class QuestionGenerationInput(_QuestionGenerationModel):
    interaction_language: InteractionLanguage
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    weakness_focus: list[QuestionGenerationWeaknessEvidence] = Field(
        default_factory=list,
        max_length=MAX_QUESTION_GENERATION_WEAKNESS_FOCUS_ITEMS,
    )
    training_memory: TrainingMemoryContext = Field(
        default_factory=TrainingMemoryContext,
    )
    target_role: QuestionGenerationTargetRoleContext
    career_profile: QuestionGenerationProfileContext
    job_description_analysis: QuestionGenerationJobContext
    matching_analysis: QuestionGenerationMatchingAnalysisContext


class QuestionGenerationOutput(_QuestionGenerationModel):
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList
    recommended_materials: QuestionCardMaterialList
    answer_hints: QuestionCardTextList
    answer_framework: QuestionCardTextList
    follow_up_directions: QuestionCardTextList
    scoring_focus: QuestionCardTextList
