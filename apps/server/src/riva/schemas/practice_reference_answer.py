from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.core.language import InteractionLanguage
from riva.schemas.follow_up import FollowUpFocus
from riva.schemas.job_description_parsing import (
    AnalysisItemList,
    Company,
    RoleTitle,
    Summary,
)
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
)
from riva.schemas.profile import OptionalText, RequiredText, StandardUUID
from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_RECOMMENDED_MATERIALS,
    QuestionCardDifficulty,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
)


MAX_PRACTICE_REFERENCE_ANSWER_LENGTH = 6_000
MAX_PRACTICE_REFERENCE_ADDRESSED_GAP_LENGTH = 1_000
MAX_PRACTICE_REFERENCE_ANSWER_ITEM_LENGTH = 1_000
MAX_PRACTICE_REFERENCE_ANSWER_ITEMS = 5


def _alias(snake_case: str, camel_case: str, **kwargs: Any) -> Any:
    return Field(
        validation_alias=AliasChoices(snake_case, camel_case),
        serialization_alias=camel_case,
        **kwargs,
    )


def _discriminator_alias(camel_case: str) -> Any:
    return Field(alias=camel_case, serialization_alias=camel_case)


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


def _deduplicate_ids(value: object) -> object:
    if not isinstance(value, list):
        return value

    deduplicated: list[object] = []
    seen: set[str] = set()
    for item in value:
        key = str(item).lower()
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(item)
    return deduplicated


ReferenceAnswerText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REFERENCE_ANSWER_ITEM_LENGTH,
    ),
]
ReferenceAnswer = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REFERENCE_ANSWER_LENGTH,
    ),
]
PracticeReferenceAnswer = ReferenceAnswer
ReferenceAnswerAddressedGap = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REFERENCE_ADDRESSED_GAP_LENGTH,
    ),
]
PracticeReferenceAnswerKeyPoints = Annotated[
    list[ReferenceAnswerText],
    BeforeValidator(_normalize_text_list),
    Field(min_length=2, max_length=MAX_PRACTICE_REFERENCE_ANSWER_ITEMS),
]
PracticeReferenceAnswerCommonMistakes = Annotated[
    list[ReferenceAnswerText],
    BeforeValidator(_normalize_text_list),
    Field(min_length=1, max_length=MAX_PRACTICE_REFERENCE_ANSWER_ITEMS),
]
PracticeReferenceRecommendedMaterialIds = Annotated[
    list[StandardUUID],
    BeforeValidator(_deduplicate_ids),
    Field(max_length=MAX_QUESTION_CARD_RECOMMENDED_MATERIALS),
]


class PracticeReferenceAnswerTargetType(StrEnum):
    MAIN = "main"
    FOLLOW_UP = "followUp"


class PracticeReferenceAnswerKind(StrEnum):
    PERSONALIZED_EXAMPLE = "personalizedExample"
    PERSONALIZED_SUPPLEMENT = "personalizedSupplement"
    TECHNICAL_REFERENCE = "technicalReference"


class _PracticeReferenceModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )


class PracticeReferenceQualificationRequirements(_PracticeReferenceModel):
    education: AnalysisItemList
    graduation_cohorts: AnalysisItemList = _alias(
        "graduation_cohorts",
        "graduationCohorts",
    )
    majors: AnalysisItemList
    experience: AnalysisItemList
    languages: AnalysisItemList
    certifications: AnalysisItemList
    other: AnalysisItemList


class PracticeReferenceRequiredSkillGroups(_PracticeReferenceModel):
    programming_languages: AnalysisItemList = _alias(
        "programming_languages",
        "programmingLanguages",
    )
    frameworks_and_libraries: AnalysisItemList = _alias(
        "frameworks_and_libraries",
        "frameworksAndLibraries",
    )
    platforms: AnalysisItemList
    tools: AnalysisItemList
    concepts_and_methods: AnalysisItemList = _alias(
        "concepts_and_methods",
        "conceptsAndMethods",
    )
    databases_and_middleware: AnalysisItemList = _alias(
        "databases_and_middleware",
        "databasesAndMiddleware",
    )
    other: AnalysisItemList


class PracticeReferenceRoleContext(_PracticeReferenceModel):
    title: RoleTitle
    company: Company
    riva_summary: Summary = _alias("riva_summary", "rivaSummary")
    responsibilities: AnalysisItemList
    qualification_requirements: PracticeReferenceQualificationRequirements = _alias(
        "qualification_requirements",
        "qualificationRequirements",
    )
    required_skills: PracticeReferenceRequiredSkillGroups = _alias(
        "required_skills",
        "requiredSkills",
    )
    business_domains: AnalysisItemList = _alias(
        "business_domains",
        "businessDomains",
    )


class PracticeReferenceQuestionContext(_PracticeReferenceModel):
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType = _alias(
        "question_type",
        "questionType",
    )
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList = _alias(
        "assessed_capabilities",
        "assessedCapabilities",
    )
    answer_framework: QuestionCardTextList = _alias(
        "answer_framework",
        "answerFramework",
    )
    scoring_focus: QuestionCardTextList = _alias(
        "scoring_focus",
        "scoringFocus",
    )
    recommended_material_ids: PracticeReferenceRecommendedMaterialIds = _alias(
        "recommended_material_ids",
        "recommendedMaterialIds",
    )


class PracticeReferenceWorkEvidence(_PracticeReferenceModel):
    type: Literal["workExperience"]
    id: StandardUUID
    company: RequiredText
    title: RequiredText
    responsibilities: QuestionCardTextList
    achievements: QuestionCardTextList
    skills: QuestionCardTextList


class PracticeReferenceProjectEvidence(_PracticeReferenceModel):
    type: Literal["projectExperience"]
    id: StandardUUID
    name: RequiredText
    role: OptionalText
    responsibilities: QuestionCardTextList
    achievements: QuestionCardTextList
    skills: QuestionCardTextList


PracticeReferenceEvidence = Annotated[
    PracticeReferenceWorkEvidence | PracticeReferenceProjectEvidence,
    Field(discriminator="type"),
]
PracticeReferenceEvidenceList = Annotated[
    list[PracticeReferenceEvidence],
    Field(max_length=MAX_QUESTION_CARD_RECOMMENDED_MATERIALS),
]


class PracticeReferenceFrozenContext(_PracticeReferenceModel):
    target_role: PracticeReferenceRoleContext = _alias(
        "target_role",
        "targetRole",
    )
    candidate_evidence: PracticeReferenceEvidenceList = _alias(
        "candidate_evidence",
        "candidateEvidence",
        default_factory=list,
    )


class PracticeReferenceMainAnswer(_PracticeReferenceModel):
    content: PracticeAnswerContent


class PracticeReferencePreviousFollowUp(_PracticeReferenceModel):
    order: Annotated[int, Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS)]
    prompt: QuestionCardPrompt
    answer: PracticeAnswerContent


class PracticeReferenceCurrentFollowUp(_PracticeReferenceModel):
    order: Annotated[int, Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS)]
    prompt: QuestionCardPrompt
    focus: FollowUpFocus


class _PracticeReferenceAnswerInput(_PracticeReferenceModel):
    interaction_language: InteractionLanguage = _alias(
        "interaction_language",
        "interactionLanguage",
    )
    target_role: PracticeReferenceRoleContext = _alias(
        "target_role",
        "targetRole",
    )
    question: PracticeReferenceQuestionContext
    candidate_evidence: PracticeReferenceEvidenceList = _alias(
        "candidate_evidence",
        "candidateEvidence",
        default_factory=list,
    )

    @model_validator(mode="after")
    def validate_candidate_evidence(self) -> Self:
        evidence_ids = [evidence.id for evidence in self.candidate_evidence]
        if len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("candidate_evidence ids must be unique")
        if not set(evidence_ids).issubset(
            set(self.question.recommended_material_ids)
        ):
            raise ValueError(
                "candidate_evidence ids must reference recommended materials"
            )
        return self


class PracticeMainReferenceAnswerInput(_PracticeReferenceAnswerInput):
    target_type: Literal[PracticeReferenceAnswerTargetType.MAIN] = (
        _discriminator_alias("targetType")
    )
    expected_kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ] = _alias("expected_kind", "expectedKind")

    @model_validator(mode="after")
    def validate_expected_kind(self) -> Self:
        expected = (
            PracticeReferenceAnswerKind.TECHNICAL_REFERENCE
            if self.question.question_type
            == QuestionCardQuestionType.TECHNICAL_FOUNDATION
            else PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE
        )
        if self.expected_kind != expected:
            raise ValueError(
                "expected_kind does not match the question type"
            )
        return self


class PracticeFollowUpReferenceAnswerInput(_PracticeReferenceAnswerInput):
    target_type: Literal[PracticeReferenceAnswerTargetType.FOLLOW_UP] = (
        _discriminator_alias("targetType")
    )
    expected_kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ] = _alias("expected_kind", "expectedKind")
    main_answer: PracticeReferenceMainAnswer = _alias(
        "main_answer",
        "mainAnswer",
    )
    previous_follow_ups: list[PracticeReferencePreviousFollowUp] = _alias(
        "previous_follow_ups",
        "previousFollowUps",
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    current_follow_up: PracticeReferenceCurrentFollowUp = _alias(
        "current_follow_up",
        "currentFollowUp",
    )

    @model_validator(mode="after")
    def validate_follow_up_lineage(self) -> Self:
        actual_orders = [item.order for item in self.previous_follow_ups]
        expected_orders = list(range(1, len(actual_orders) + 1))
        if actual_orders != expected_orders:
            raise ValueError(
                "previous_follow_ups must contain completed orders in sequence"
            )
        if self.current_follow_up.order != len(self.previous_follow_ups) + 1:
            raise ValueError(
                "current_follow_up.order must follow previous_follow_ups"
            )
        return self

    @model_validator(mode="after")
    def validate_expected_kind(self) -> Self:
        expected = (
            PracticeReferenceAnswerKind.TECHNICAL_REFERENCE
            if self.question.question_type
            == QuestionCardQuestionType.TECHNICAL_FOUNDATION
            else PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT
        )
        if self.expected_kind != expected:
            raise ValueError(
                "expected_kind does not match the question type"
            )
        return self


PracticeReferenceAnswerInput = Annotated[
    PracticeMainReferenceAnswerInput | PracticeFollowUpReferenceAnswerInput,
    Field(discriminator="target_type"),
]


class PracticeReferencePreviousFollowUpRunPayload(_PracticeReferenceModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    order: Annotated[
        int,
        Field(
            ge=1,
            le=MAX_PRACTICE_FOLLOW_UPS,
            strict=True,
        ),
    ]
    question_id: StandardUUID = _alias("question_id", "questionId")
    answer_id: StandardUUID = _alias("answer_id", "answerId")


class PracticeMainReferenceAnswerRunPayload(_PracticeReferenceModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    target_type: Literal[PracticeReferenceAnswerTargetType.MAIN] = (
        _discriminator_alias("targetType")
    )
    question_card_id: StandardUUID = _alias(
        "question_card_id",
        "questionCardId",
    )
    interaction_language: InteractionLanguage = _alias(
        "interaction_language",
        "interactionLanguage",
    )
    expected_kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ] = _alias("expected_kind", "expectedKind")
    reference_context: PracticeReferenceFrozenContext = _alias(
        "reference_context",
        "referenceContext",
    )


class PracticeFollowUpReferenceAnswerRunPayload(_PracticeReferenceModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    target_type: Literal[PracticeReferenceAnswerTargetType.FOLLOW_UP] = (
        _discriminator_alias("targetType")
    )
    question_card_id: StandardUUID = _alias(
        "question_card_id",
        "questionCardId",
    )
    attempt_id: StandardUUID = _alias("attempt_id", "attemptId")
    main_answer_id: StandardUUID = _alias(
        "main_answer_id",
        "mainAnswerId",
    )
    follow_up_question_id: StandardUUID = _alias(
        "follow_up_question_id",
        "followUpQuestionId",
    )
    previous_follow_ups: list[PracticeReferencePreviousFollowUpRunPayload] = (
        _alias(
            "previous_follow_ups",
            "previousFollowUps",
            default_factory=list,
            max_length=MAX_PRACTICE_FOLLOW_UPS,
        )
    )
    interaction_language: InteractionLanguage = _alias(
        "interaction_language",
        "interactionLanguage",
    )
    expected_kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ] = _alias("expected_kind", "expectedKind")
    reference_context: PracticeReferenceFrozenContext = _alias(
        "reference_context",
        "referenceContext",
    )

    @model_validator(mode="after")
    def validate_previous_follow_ups(self) -> Self:
        actual_orders = [item.order for item in self.previous_follow_ups]
        if actual_orders != list(range(1, len(actual_orders) + 1)):
            raise ValueError(
                "previous_follow_ups must contain completed orders in sequence"
            )
        question_ids = [item.question_id for item in self.previous_follow_ups]
        answer_ids = [item.answer_id for item in self.previous_follow_ups]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("previous_follow_ups question ids must be unique")
        if len(answer_ids) != len(set(answer_ids)):
            raise ValueError("previous_follow_ups answer ids must be unique")
        return self


PracticeReferenceAnswerRunPayload = Annotated[
    PracticeMainReferenceAnswerRunPayload
    | PracticeFollowUpReferenceAnswerRunPayload,
    Field(discriminator="target_type"),
]


class PracticeMainReferenceAnswerOutput(_PracticeReferenceModel):
    target_type: Literal[PracticeReferenceAnswerTargetType.MAIN] = (
        _discriminator_alias("targetType")
    )
    kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ]
    answer: ReferenceAnswer
    key_points: PracticeReferenceAnswerKeyPoints = _alias(
        "key_points",
        "keyPoints",
    )
    common_mistakes: PracticeReferenceAnswerCommonMistakes = _alias(
        "common_mistakes",
        "commonMistakes",
    )


class PracticeFollowUpReferenceAnswerOutput(_PracticeReferenceModel):
    target_type: Literal[PracticeReferenceAnswerTargetType.FOLLOW_UP] = (
        _discriminator_alias("targetType")
    )
    kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ]
    addressed_gap: ReferenceAnswerAddressedGap = _alias(
        "addressed_gap",
        "addressedGap",
    )
    answer: ReferenceAnswer
    key_points: PracticeReferenceAnswerKeyPoints = _alias(
        "key_points",
        "keyPoints",
    )
    common_mistakes: PracticeReferenceAnswerCommonMistakes = _alias(
        "common_mistakes",
        "commonMistakes",
    )


PracticeReferenceAnswerOutput = Annotated[
    PracticeMainReferenceAnswerOutput | PracticeFollowUpReferenceAnswerOutput,
    Field(discriminator="target_type"),
]


__all__ = [
    "MAX_PRACTICE_REFERENCE_ADDRESSED_GAP_LENGTH",
    "MAX_PRACTICE_REFERENCE_ANSWER_ITEMS",
    "MAX_PRACTICE_REFERENCE_ANSWER_ITEM_LENGTH",
    "MAX_PRACTICE_REFERENCE_ANSWER_LENGTH",
    "PracticeFollowUpReferenceAnswerInput",
    "PracticeFollowUpReferenceAnswerOutput",
    "PracticeFollowUpReferenceAnswerRunPayload",
    "PracticeMainReferenceAnswerInput",
    "PracticeMainReferenceAnswerOutput",
    "PracticeMainReferenceAnswerRunPayload",
    "PracticeReferenceAnswer",
    "PracticeReferenceAnswerCommonMistakes",
    "PracticeReferenceAnswerInput",
    "PracticeReferenceAnswerKeyPoints",
    "PracticeReferenceAnswerKind",
    "PracticeReferenceAnswerOutput",
    "PracticeReferenceAnswerRunPayload",
    "PracticeReferenceAnswerTargetType",
    "PracticeReferenceCurrentFollowUp",
    "PracticeReferenceEvidence",
    "PracticeReferenceEvidenceList",
    "PracticeReferenceFrozenContext",
    "PracticeReferenceMainAnswer",
    "PracticeReferencePreviousFollowUp",
    "PracticeReferencePreviousFollowUpRunPayload",
    "PracticeReferenceProjectEvidence",
    "PracticeReferenceQuestionContext",
    "PracticeReferenceRecommendedMaterialIds",
    "PracticeReferenceRequiredSkillGroups",
    "PracticeReferenceQualificationRequirements",
    "PracticeReferenceRoleContext",
    "PracticeReferenceWorkEvidence",
    "ReferenceAnswer",
    "ReferenceAnswerAddressedGap",
    "ReferenceAnswerText",
]
