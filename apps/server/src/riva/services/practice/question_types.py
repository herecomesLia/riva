from datetime import datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import (
    AfterValidator,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)

from riva.core.language import InteractionLanguage
from riva.services.types import DomainModel, StandardUUID

MAX_QUESTION_CARD_PROMPT_LENGTH = 4_000
MAX_QUESTION_CARD_LIST_ITEM_LENGTH = 1_000
MAX_QUESTION_CARD_LIST_ITEMS = 20
MAX_QUESTION_CARD_RECOMMENDED_MATERIALS = 10
MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH = 255
MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH = 1_000

MAX_QUESTION_CARD_ASSESSED_CAPABILITIES = MAX_QUESTION_CARD_LIST_ITEMS
MAX_QUESTION_CARD_ANSWER_HINTS = MAX_QUESTION_CARD_LIST_ITEMS
MAX_QUESTION_CARD_ANSWER_FRAMEWORK = MAX_QUESTION_CARD_LIST_ITEMS
MAX_QUESTION_CARD_FOLLOW_UP_DIRECTIONS = MAX_QUESTION_CARD_LIST_ITEMS
MAX_QUESTION_CARD_SCORING_FOCUS = MAX_QUESTION_CARD_LIST_ITEMS


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


def _deduplicate_materials(
    value: list["QuestionCardMaterialReference"],
) -> list["QuestionCardMaterialReference"]:
    normalized: list[QuestionCardMaterialReference] = []
    seen: set[tuple[QuestionCardMaterialType, str]] = set()
    for material in value:
        key = (material.type, material.label.casefold())
        if key in seen:
            continue
        seen.add(key)
        normalized.append(material)
    return normalized


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


class QuestionCardMaterialReference(DomainModel):
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


QuestionCardMaterialList = Annotated[
    list[QuestionCardMaterialReference],
    Field(max_length=MAX_QUESTION_CARD_RECOMMENDED_MATERIALS),
    AfterValidator(_deduplicate_materials),
]


class StartQuestionGenerationRequest(DomainModel):
    model_config = ConfigDict(extra="forbid")

    request_id: StandardUUID
    target_role_id: StandardUUID
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty


class QuestionCardResponse(DomainModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    target_role_id: UUID
    language: InteractionLanguage
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    prompt: QuestionCardPrompt
    assessed_capabilities: QuestionCardTextList
    recommended_materials: QuestionCardMaterialList
    answer_hints: QuestionCardTextList
    answer_framework: QuestionCardTextList
    is_saved: bool
    is_marked_weak: bool
    created_at: datetime
    updated_at: datetime
