from __future__ import annotations

from enum import IntEnum, StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import (
    AfterValidator,
    BeforeValidator,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
)

from riva.agents.base import AgentModel

MAX_QUESTION_CARD_PROMPT_LENGTH = 4_000
MAX_QUESTION_CARD_LIST_ITEM_LENGTH = 1_000
MAX_QUESTION_CARD_LIST_ITEMS = 20
MAX_QUESTION_CARD_RECOMMENDED_MATERIALS = 10
MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH = 255
MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH = 1_000


def _normalize_optional_text(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _validate_standard_uuid(value: object) -> object:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        return value
    try:
        parsed = UUID(value)
    except ValueError:
        return value
    if str(parsed) != value.lower():
        raise ValueError("id must be a standard UUID")
    return value


def _normalize_list_items(value: object) -> object:
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


StandardUUID = Annotated[UUID, BeforeValidator(_validate_standard_uuid)]
RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
    Annotated[str, StringConstraints(max_length=255)] | None,
    BeforeValidator(_normalize_optional_text),
]
Summary = Annotated[
    Annotated[str, StringConstraints(max_length=2_000)] | None,
    BeforeValidator(_normalize_optional_text),
]
Month = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
]
Bullet = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1_000),
]
OptionalProjectUrl = Annotated[
    HttpUrl | None,
    BeforeValidator(_normalize_optional_text),
]


class EmploymentType(StrEnum):
    FULL_TIME = "fullTime"
    PART_TIME = "partTime"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    FREELANCE = "freelance"


QuestionCardPrompt = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_QUESTION_CARD_PROMPT_LENGTH,
    ),
]
QuestionCardTextItem = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_QUESTION_CARD_LIST_ITEM_LENGTH,
    ),
]
QuestionCardTextList = Annotated[
    list[QuestionCardTextItem],
    BeforeValidator(_normalize_list_items),
    Field(max_length=MAX_QUESTION_CARD_LIST_ITEMS),
]


class QuestionCardQuestionType(StrEnum):
    PROJECT_DEEP_DIVE = "projectDeepDive"
    BEHAVIORAL = "behavioral"
    BUSINESS_UNDERSTANDING = "businessUnderstanding"
    MOTIVATION = "motivation"
    TECHNICAL_FOUNDATION = "technicalFoundation"


class QuestionCardDifficulty(StrEnum):
    BASIC = "basic"
    PRESSURE = "pressure"


class QuestionCardMaterialType(StrEnum):
    WORK_EXPERIENCE = "workExperience"
    PROJECT_EXPERIENCE = "projectExperience"


class QuestionCardMaterialReference(AgentModel):
    model_config = ConfigDict(extra="forbid")

    type: QuestionCardMaterialType
    label: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH,
        ),
    ]
    reason: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH,
        ),
    ]


def _deduplicate_materials(
    value: list[QuestionCardMaterialReference],
) -> list[QuestionCardMaterialReference]:
    normalized: list[QuestionCardMaterialReference] = []
    seen: set[tuple[QuestionCardMaterialType, str]] = set()
    for material in value:
        key = (material.type, material.label.casefold())
        if key in seen:
            continue
        seen.add(key)
        normalized.append(material)
    return normalized


QuestionCardMaterialList = Annotated[
    list[QuestionCardMaterialReference],
    Field(max_length=MAX_QUESTION_CARD_RECOMMENDED_MATERIALS),
    AfterValidator(_deduplicate_materials),
]


class InterviewRound(StrEnum):
    HR = "hr"
    FIRST_BUSINESS = "firstBusiness"
    TECHNICAL = "technical"
    MANAGER = "manager"
    FINAL = "final"
    COMPREHENSIVE = "comprehensive"


class InterviewDifficulty(StrEnum):
    BASIC = "basic"
    PRESSURE = "pressure"


class InterviewQuestionType(StrEnum):
    SELF_INTRODUCTION = "selfIntroduction"
    PROJECT_DEEP_DIVE = "projectDeepDive"
    ROLE_CAPABILITY = "roleCapability"
    BEHAVIORAL = "behavioral"
    TECHNICAL_OR_BUSINESS = "technicalOrBusiness"
    RESUME_RISK = "resumeRisk"
    MOTIVATION = "motivation"


class InterviewDurationMinutes(IntEnum):
    FIFTEEN = 15
    THIRTY = 30
    FORTY_FIVE = 45


class InterviewSessionStatus(StrEnum):
    OPENING = "opening"
    QUESTION = "question"
    FOLLOW_UP = "followUp"
    CANDIDATE_QUESTIONS = "candidateQuestions"
    COMPLETED = "completed"


class InterviewConfiguration(AgentModel):
    model_config = ConfigDict(extra="forbid")

    target_role_id: StandardUUID
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


class TargetRoleRecruitmentType(StrEnum):
    CAMPUS = "campus"
    EXPERIENCED = "experienced"


class TrainingRecordKind(StrEnum):
    TARGETED_PRACTICE = "targetedPractice"
    MOCK_INTERVIEW = "mockInterview"


class TrainingRecordStatus(StrEnum):
    COMPLETED = "completed"
    ENDED_EARLY = "endedEarly"
    PARTIALLY_COMPLETED = "partiallyCompleted"
