from typing import Annotated, Literal, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.core.language import InteractionLanguage
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerSnapshot,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
)


class _FollowUpModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FollowUpQuestionContext(_FollowUpModel):
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType = Field(
        validation_alias=AliasChoices("question_type", "questionType"),
        serialization_alias="questionType",
    )
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList = Field(
        validation_alias=AliasChoices(
            "assessed_capabilities", "assessedCapabilities"
        ),
        serialization_alias="assessedCapabilities",
    )
    follow_up_directions: QuestionCardTextList = Field(
        validation_alias=AliasChoices(
            "follow_up_directions", "followUpDirections"
        ),
        serialization_alias="followUpDirections",
    )
    scoring_focus: QuestionCardTextList = Field(
        validation_alias=AliasChoices("scoring_focus", "scoringFocus"),
        serialization_alias="scoringFocus",
    )


class FollowUpPreviousExchange(_FollowUpModel):
    order: Annotated[
        int,
        Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS),
    ]
    prompt: QuestionCardPrompt
    answer: PracticeAnswerContent


class FollowUpInput(_FollowUpModel):
    interaction_language: InteractionLanguage = Field(
        validation_alias=AliasChoices(
            "interaction_language", "interactionLanguage"
        ),
        serialization_alias="interactionLanguage",
    )
    question: FollowUpQuestionContext
    main_answer: PracticeAnswerSnapshot = Field(
        validation_alias=AliasChoices("main_answer", "mainAnswer"),
        serialization_alias="mainAnswer",
    )
    previous_follow_ups: list[FollowUpPreviousExchange] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
        validation_alias=AliasChoices(
            "previous_follow_ups", "previousFollowUps"
        ),
        serialization_alias="previousFollowUps",
    )
    next_follow_up_order: Annotated[
        int,
        Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS),
    ] = Field(
        validation_alias=AliasChoices(
            "next_follow_up_order", "nextFollowUpOrder"
        ),
        serialization_alias="nextFollowUpOrder",
    )

    @model_validator(mode="after")
    def validate_context(self) -> Self:
        if self.main_answer.order != 1:
            raise ValueError("main_answer.order must be 1")
        expected_orders = list(range(1, self.next_follow_up_order))
        actual_orders = [exchange.order for exchange in self.previous_follow_ups]
        if actual_orders != expected_orders:
            raise ValueError(
                "previous_follow_ups must contain each completed order exactly "
                "once and in sequence"
            )
        return self


FollowUpFocus = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=1_000,
    ),
]


class FollowUpCompleteOutput(_FollowUpModel):
    action: Literal["complete"]


class FollowUpQuestionOutput(_FollowUpModel):
    action: Literal["askFollowUp"]
    prompt: QuestionCardPrompt
    focus: FollowUpFocus
    answer_hints: QuestionCardTextList = Field(
        validation_alias=AliasChoices("answer_hints", "answerHints"),
        serialization_alias="answerHints",
    )
    answer_framework: QuestionCardTextList = Field(
        validation_alias=AliasChoices("answer_framework", "answerFramework"),
        serialization_alias="answerFramework",
    )


FollowUpGenerationOutput = Annotated[
    FollowUpCompleteOutput | FollowUpQuestionOutput,
    Field(discriminator="action"),
]


__all__ = [
    "FollowUpCompleteOutput",
    "FollowUpFocus",
    "FollowUpGenerationOutput",
    "FollowUpInput",
    "FollowUpPreviousExchange",
    "FollowUpQuestionContext",
    "FollowUpQuestionOutput",
    "MAX_PRACTICE_FOLLOW_UPS",
]
