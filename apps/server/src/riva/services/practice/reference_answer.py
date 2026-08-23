from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import cast
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.reference_answer import PracticeReferenceAnswerAgent
from riva.agents.practice.reference_types import (
    PracticeFollowUpReferenceAnswerInput,
    PracticeFollowUpReferenceAnswerOutput,
    PracticeMainReferenceAnswerInput,
    PracticeMainReferenceAnswerOutput,
    PracticeReferenceAnswerInput,
    PracticeReferenceAnswerKind,
    PracticeReferenceAnswerOutput,
    PracticeReferenceAnswerTargetType,
    PracticeReferenceCurrentFollowUp,
    PracticeReferenceFrozenContext,
    PracticeReferenceMainAnswer,
    PracticeReferencePreviousFollowUp,
    PracticeReferenceQuestionContext,
)
from riva.integrations.llm import LLMProvider
from riva.models import (
    PracticeAttempt,
    PracticeFollowUpQuestion,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)
from riva.services.errors import service_error_for_code
from riva.utils import utc_now

REFERENCE_ANSWER_GENERATION_UNAVAILABLE = "reference_answer_generation_unavailable"
REFERENCE_ANSWER_ARTIFACT_CONFLICT = "reference_answer_artifact_conflict"


class PracticeReferenceAnswerLifecycleStatus(StrEnum):
    NOT_REQUESTED = "notRequested"
    REVEALED = "revealed"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class PracticeReferenceAnswerWorkflowState:
    status: PracticeReferenceAnswerLifecycleStatus
    artifact: PracticeReferenceAnswerArtifact | None
    output: PracticeReferenceAnswerOutput | None
    viewed_before_submission: bool

    @classmethod
    def not_requested(cls) -> "PracticeReferenceAnswerWorkflowState":
        return cls(
            status=PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            artifact=None,
            output=None,
            viewed_before_submission=False,
        )


def practice_main_reference_answer_idempotency_key(question_card_id: UUID) -> str:
    return f"practice-question-card:{question_card_id}:reference-answer"


def practice_follow_up_reference_answer_idempotency_key(
    follow_up_question_id: UUID,
) -> str:
    return f"practice-follow-up-question:{follow_up_question_id}:reference-answer"


def practice_reference_answer_output_from_artifact(
    artifact: PracticeReferenceAnswerArtifact,
) -> PracticeReferenceAnswerOutput:
    values: dict[str, object] = {
        "targetType": artifact.target_type,
        "kind": artifact.kind,
        "answer": artifact.answer,
        "keyPoints": artifact.key_points,
        "commonMistakes": artifact.common_mistakes,
    }
    if artifact.target_type == PracticeReferenceAnswerTargetType.FOLLOW_UP:
        values["addressedGap"] = artifact.addressed_gap
    try:
        return cast(
            PracticeReferenceAnswerOutput,
            TypeAdapter(PracticeReferenceAnswerOutput).validate_python(values),
        )
    except TypeError, ValueError, ValidationError:
        raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT) from None


class ReferenceAnswerGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()

    async def generate_main(
        self,
        *,
        user_id: UUID,
        question_card: QuestionCard,
        language: str,
    ) -> PracticeReferenceAnswerArtifact:
        reference_context = await self.get_question_reference_context(
            user_id=user_id,
            question_card_id=question_card.id,
        )
        input_snapshot = PracticeMainReferenceAnswerInput(
            targetType=PracticeReferenceAnswerTargetType.MAIN,
            expectedKind=self._expected_kind(question_card, follow_up=False),
            interactionLanguage=language,
            targetRole=reference_context.target_role,
            question=self._question_context(question_card),
            candidateEvidence=reference_context.candidate_evidence,
        )
        output = await self._run(input_snapshot)
        if not isinstance(output, PracticeMainReferenceAnswerOutput):
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT)
        return await self._persist(
            question_card=question_card,
            follow_up_question=None,
            output=output,
        )

    async def generate_follow_up(
        self,
        *,
        user_id: UUID,
        question_card: QuestionCard,
        follow_up_question: PracticeFollowUpQuestion | None,
        attempt: PracticeAttempt,
        language: str,
    ) -> PracticeReferenceAnswerArtifact:
        if follow_up_question is None:
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT)
        main_answer = next(
            (answer for answer in attempt.answers if answer.order == 1), None
        )
        if main_answer is None:
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT)
        reference_context = await self.get_question_reference_context(
            user_id=user_id,
            question_card_id=question_card.id,
        )
        previous = [
            PracticeReferencePreviousFollowUp(
                order=question.order,
                prompt=question.prompt,
                answer=question.answer.content,
            )
            for question in sorted(
                attempt.follow_up_questions, key=lambda item: item.order
            )
            if question.answer is not None and question.id != follow_up_question.id
        ]
        input_snapshot = PracticeFollowUpReferenceAnswerInput(
            targetType=PracticeReferenceAnswerTargetType.FOLLOW_UP,
            expectedKind=self._expected_kind(question_card, follow_up=True),
            interactionLanguage=language,
            targetRole=reference_context.target_role,
            question=self._question_context(question_card),
            candidateEvidence=reference_context.candidate_evidence,
            mainAnswer=PracticeReferenceMainAnswer(content=main_answer.content),
            previousFollowUps=previous,
            currentFollowUp=PracticeReferenceCurrentFollowUp(
                order=follow_up_question.order,
                prompt=follow_up_question.prompt,
                focus=follow_up_question.focus,
            ),
        )
        output = await self._run(input_snapshot)
        if not isinstance(output, PracticeFollowUpReferenceAnswerOutput):
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT)
        return await self._persist(
            question_card=question_card,
            follow_up_question=follow_up_question,
            output=output,
        )

    async def get_main_generation_state(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        submitted_at: datetime | None = None,
        for_update: bool = False,
    ) -> PracticeReferenceAnswerWorkflowState:
        artifact = await self._artifact(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=None,
            for_update=for_update,
        )
        return self._state(artifact, submitted_at=submitted_at)

    async def get_follow_up_generation_state(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID,
        submitted_at: datetime | None = None,
        for_update: bool = False,
    ) -> PracticeReferenceAnswerWorkflowState:
        artifact = await self._artifact(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            for_update=for_update,
        )
        return self._state(artifact, submitted_at=submitted_at)

    async def get_question_reference_context(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
    ) -> PracticeReferenceFrozenContext:
        row = await self.session.scalar(
            select(PracticeQuestionReferenceContext)
            .join(
                QuestionCard,
                QuestionCard.id == PracticeQuestionReferenceContext.question_card_id,
            )
            .where(
                PracticeQuestionReferenceContext.question_card_id == question_card_id,
                QuestionCard.user_id == user_id,
            )
        )
        if row is None:
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT)
        try:
            return PracticeReferenceFrozenContext.model_validate(row.frozen_context)
        except TypeError, ValueError, ValidationError:
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT) from None

    async def _run(
        self,
        input_snapshot: PracticeReferenceAnswerInput,
    ) -> PracticeReferenceAnswerOutput:
        if self.llm_provider is None or not self.llm_model:
            raise service_error_for_code(REFERENCE_ANSWER_GENERATION_UNAVAILABLE)
        try:
            return (
                await PracticeReferenceAnswerAgent(
                    self.llm_provider,
                    self.llm_model,
                ).run(input_snapshot)
            ).output
        except Exception:
            raise service_error_for_code(REFERENCE_ANSWER_ARTIFACT_CONFLICT) from None

    async def _persist(
        self,
        *,
        question_card: QuestionCard,
        follow_up_question: PracticeFollowUpQuestion | None,
        output: PracticeReferenceAnswerOutput,
    ) -> PracticeReferenceAnswerArtifact:
        target_type = (
            PracticeReferenceAnswerTargetType.FOLLOW_UP
            if follow_up_question is not None
            else PracticeReferenceAnswerTargetType.MAIN
        )
        statement = select(PracticeReferenceAnswerArtifact).where(
            PracticeReferenceAnswerArtifact.question_card_id == question_card.id,
            PracticeReferenceAnswerArtifact.target_type == target_type.value,
        )
        if follow_up_question is not None:
            statement = statement.where(
                PracticeReferenceAnswerArtifact.follow_up_question_id
                == follow_up_question.id
            )
        artifact = await self.session.scalar(statement)
        values = output.model_dump(mode="json", by_alias=True)
        if artifact is None:
            artifact = PracticeReferenceAnswerArtifact(
                id=uuid4(),
                question_card_id=question_card.id,
                follow_up_question_id=(
                    follow_up_question.id if follow_up_question is not None else None
                ),
                target_type=target_type.value,
                kind=str(values["kind"]),
                addressed_gap=cast(str | None, values.get("addressedGap")),
                answer=cast(str, values["answer"]),
                key_points=cast(list[str], values["keyPoints"]),
                common_mistakes=cast(list[str], values["commonMistakes"]),
                generated_at=utc_now(),
            )
            self.session.add(artifact)
        else:
            artifact.kind = str(values["kind"])
            artifact.addressed_gap = cast(str | None, values.get("addressedGap"))
            artifact.answer = cast(str, values["answer"])
            artifact.key_points = cast(list[str], values["keyPoints"])
            artifact.common_mistakes = cast(list[str], values["commonMistakes"])
            artifact.generated_at = utc_now()
        await self.session.flush()
        return artifact

    async def _artifact(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID | None,
        for_update: bool,
    ) -> PracticeReferenceAnswerArtifact | None:
        statement = (
            select(PracticeReferenceAnswerArtifact)
            .join(
                QuestionCard,
                QuestionCard.id == PracticeReferenceAnswerArtifact.question_card_id,
            )
            .where(
                PracticeReferenceAnswerArtifact.question_card_id == question_card_id,
                QuestionCard.user_id == user_id,
                PracticeReferenceAnswerArtifact.follow_up_question_id
                == follow_up_question_id,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    @staticmethod
    def _state(
        artifact: PracticeReferenceAnswerArtifact | None,
        *,
        submitted_at: datetime | None,
    ) -> PracticeReferenceAnswerWorkflowState:
        if artifact is None:
            return PracticeReferenceAnswerWorkflowState.not_requested()
        return PracticeReferenceAnswerWorkflowState(
            status=PracticeReferenceAnswerLifecycleStatus.REVEALED,
            artifact=artifact,
            output=practice_reference_answer_output_from_artifact(artifact),
            viewed_before_submission=(
                submitted_at is not None and artifact.generated_at < submitted_at
            ),
        )

    @staticmethod
    def _question_context(card: QuestionCard) -> PracticeReferenceQuestionContext:
        return PracticeReferenceQuestionContext(
            prompt=card.prompt,
            question_type=card.question_type,
            difficulty=card.difficulty,
            assessed_capabilities=card.assessed_capabilities,
            answer_framework=card.answer_framework,
            scoring_focus=card.scoring_focus,
            recommended_material_ids=[
                item["id"]
                for item in card.recommended_materials
                if isinstance(item, dict) and item.get("id") is not None
            ],
        )

    @staticmethod
    def _expected_kind(
        card: QuestionCard,
        *,
        follow_up: bool,
    ) -> PracticeReferenceAnswerKind:
        if card.question_type == "technicalFoundation":
            return PracticeReferenceAnswerKind.TECHNICAL_REFERENCE
        return (
            PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT
            if follow_up
            else PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE
        )
