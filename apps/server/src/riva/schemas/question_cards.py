from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.profile import StandardUUID

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
    seen: set[tuple[QuestionCardMaterialType, UUID]] = set()
    for material in value:
        key = (material.type, material.id)
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


class QuestionCardMaterialReference(APIModel):
    model_config = ConfigDict(extra="forbid")

    type: QuestionCardMaterialType
    id: UUID
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


class StartQuestionGenerationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    request_id: StandardUUID
    target_role_id: StandardUUID
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty


class QuestionCardResponse(APIModel):
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


QuestionGenerationLifecycleStatus = Literal[
    "queued",
    "running",
    "succeeded",
    "failed",
]


class QuestionGenerationStatusResponse(APIModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    status: QuestionGenerationLifecycleStatus
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    language: InteractionLanguage
    attempt_count: int = Field(ge=0)
    max_attempts: int = Field(ge=1)
    error_code: str | None
    failure_reason: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    question_card: QuestionCardResponse | None

    @field_validator("created_at", "started_at", "finished_at")
    @classmethod
    def validate_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("timestamps must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_state(self) -> Self:
        if self.status == "queued":
            self._require(
                self.question_card is None
                and self.error_code is None
                and self.failure_reason is None
                and self.finished_at is None,
                "queued state contains terminal data",
            )
        elif self.status == "running":
            self._require(
                self.question_card is None
                and self.error_code is None
                and self.failure_reason is None
                and self.started_at is not None
                and self.finished_at is None,
                "running state contains invalid lifecycle data",
            )
        elif self.status == "succeeded":
            self._require(
                self.question_card is not None
                and self.error_code is None
                and self.failure_reason is None
                and self.finished_at is not None,
                "succeeded state is incomplete",
            )
        elif self.status == "failed":
            self._require(
                self.question_card is None
                and self.error_code is not None
                and self.failure_reason is not None
                and bool(self.failure_reason.strip())
                and self.finished_at is not None,
                "failed state is invalid",
            )
        return self

    @staticmethod
    def _require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError(message)


__all__ = [
    "MAX_QUESTION_CARD_ANSWER_FRAMEWORK",
    "MAX_QUESTION_CARD_ANSWER_HINTS",
    "MAX_QUESTION_CARD_ASSESSED_CAPABILITIES",
    "MAX_QUESTION_CARD_FOLLOW_UP_DIRECTIONS",
    "MAX_QUESTION_CARD_LIST_ITEM_LENGTH",
    "MAX_QUESTION_CARD_LIST_ITEMS",
    "MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH",
    "MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH",
    "MAX_QUESTION_CARD_PROMPT_LENGTH",
    "MAX_QUESTION_CARD_RECOMMENDED_MATERIALS",
    "MAX_QUESTION_CARD_SCORING_FOCUS",
    "QuestionCardDifficulty",
    "QuestionCardMaterialList",
    "QuestionCardMaterialReference",
    "QuestionCardMaterialType",
    "QuestionCardPrompt",
    "QuestionCardQuestionType",
    "QuestionCardResponse",
    "QuestionCardTextItem",
    "QuestionCardTextList",
    "QuestionGenerationLifecycleStatus",
    "QuestionGenerationStatusResponse",
    "StartQuestionGenerationRequest",
]
