from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)
from riva.prompts import PRACTICE_REFERENCE_ANSWER_PROMPT
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerKind,
)
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerInput,
    PracticeFollowUpReferenceAnswerRunPayload,
    PracticeMainReferenceAnswerInput,
    PracticeMainReferenceAnswerRunPayload,
    PracticeReferenceAnswerInput,
    PracticeReferenceAnswerKind,
    PracticeReferenceAnswerOutput,
    PracticeReferenceAnswerRunPayload,
    PracticeReferenceAnswerTargetType,
    PracticeReferenceCurrentFollowUp,
    PracticeReferenceFrozenContext,
    PracticeReferenceMainAnswer,
    PracticeReferencePreviousFollowUp,
    PracticeReferenceQuestionContext,
)
from riva.schemas.question_cards import (
    QuestionCardMaterialList,
    QuestionCardQuestionType,
)
from riva.services.agent_runs import AgentRunService
from riva.services.follow_up_generation import (
    FollowUpGenerationStateError,
    validate_follow_up_generation_run,
)
from riva.services.question_generation import (
    QuestionGenerationStateError,
    validate_question_card_generation_lineage,
)
from riva.utils import utc_now


ReferenceAnswerGenerationStateErrorCode = Literal[
    "invalid_reference_answer_generation_run",
    "reference_answer_question_card_not_ready",
    "reference_answer_context_conflict",
    "reference_answer_follow_up_not_ready",
    "reference_answer_main_answer_not_ready",
    "reference_answer_previous_exchange_not_ready",
    "reference_answer_artifact_conflict",
    "reference_answer_output_mismatch",
]

INVALID_REFERENCE_ANSWER_GENERATION_RUN: ReferenceAnswerGenerationStateErrorCode = (
    "invalid_reference_answer_generation_run"
)
REFERENCE_ANSWER_QUESTION_CARD_NOT_READY: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_question_card_not_ready"
)
REFERENCE_ANSWER_CONTEXT_CONFLICT: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_context_conflict"
)
REFERENCE_ANSWER_FOLLOW_UP_NOT_READY: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_follow_up_not_ready"
)
REFERENCE_ANSWER_MAIN_ANSWER_NOT_READY: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_main_answer_not_ready"
)
REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_previous_exchange_not_ready"
)
REFERENCE_ANSWER_ARTIFACT_CONFLICT: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_artifact_conflict"
)
REFERENCE_ANSWER_OUTPUT_MISMATCH: ReferenceAnswerGenerationStateErrorCode = (
    "reference_answer_output_mismatch"
)


class ReferenceAnswerGenerationStateError(RuntimeError):
    safe_message = "The reference answer generation state is invalid."

    def __init__(self, code: ReferenceAnswerGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class PracticeReferenceAnswerLifecycleStatus(StrEnum):
    NOT_REQUESTED = "notRequested"
    GENERATING = "generating"
    REVEALED = "revealed"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class PracticeReferenceAnswerWorkflowState:
    status: PracticeReferenceAnswerLifecycleStatus
    generation_run: AgentRun | None
    artifact: PracticeReferenceAnswerArtifact | None
    output: PracticeReferenceAnswerOutput | None
    viewed_before_submission: bool


def practice_main_reference_answer_idempotency_key(question_card_id: UUID) -> str:
    return f"practice-question-card:{question_card_id}:reference-answer"


def practice_follow_up_reference_answer_idempotency_key(
    follow_up_question_id: UUID,
) -> str:
    return f"practice-follow-up-question:{follow_up_question_id}:reference-answer"


def validate_reference_answer_generation_run(
    run: AgentRun,
) -> PracticeReferenceAnswerRunPayload:
    prompt = PRACTICE_REFERENCE_ANSWER_PROMPT
    if (
        run.agent_id != "practice-reference-answer-generator"
        or run.prompt_id != prompt.prompt_id
        or run.prompt_version != prompt.version
        or run.output_schema_id != prompt.output_schema_id
    ):
        raise ReferenceAnswerGenerationStateError(
            INVALID_REFERENCE_ANSWER_GENERATION_RUN
        )
    try:
        return cast(
            PracticeReferenceAnswerRunPayload,
            TypeAdapter(PracticeReferenceAnswerRunPayload).validate_python(
                run.payload
            ),
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(
            INVALID_REFERENCE_ANSWER_GENERATION_RUN
        ) from None


def practice_reference_answer_output_from_artifact(
    artifact: PracticeReferenceAnswerArtifact,
) -> PracticeReferenceAnswerOutput:
    try:
        if artifact.target_type == PracticeReferenceAnswerTargetType.MAIN:
            if (
                artifact.follow_up_question_id is not None
                or artifact.addressed_gap is not None
            ):
                raise ValueError("main reference artifact target is invalid")
        elif artifact.target_type == PracticeReferenceAnswerTargetType.FOLLOW_UP:
            if (
                artifact.follow_up_question_id is None
                or artifact.addressed_gap is None
            ):
                raise ValueError("follow-up reference artifact target is invalid")
        values: dict[str, object] = {
            "targetType": artifact.target_type,
            "kind": artifact.kind,
            "answer": artifact.answer,
            "keyPoints": artifact.key_points,
            "commonMistakes": artifact.common_mistakes,
        }
        if artifact.target_type == PracticeReferenceAnswerTargetType.FOLLOW_UP:
            values["addressedGap"] = artifact.addressed_gap
        return cast(
            PracticeReferenceAnswerOutput,
            TypeAdapter(PracticeReferenceAnswerOutput).validate_python(values),
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(
            REFERENCE_ANSWER_ARTIFACT_CONFLICT
        ) from None


@dataclass(frozen=True)
class _MainReferenceContext:
    card: QuestionCard
    frozen_context: PracticeReferenceFrozenContext
    input: PracticeMainReferenceAnswerInput


@dataclass(frozen=True)
class _FollowUpReferenceContext:
    card: QuestionCard
    attempt: PracticeAttempt
    question: PracticeFollowUpQuestion
    main_answer: PracticeAnswer
    frozen_context: PracticeReferenceFrozenContext
    input: PracticeFollowUpReferenceAnswerInput
    previous_ids: tuple[tuple[UUID, UUID], ...]


class ReferenceAnswerGenerationService:
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

    async def enqueue_main_generation(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            run = await self.enqueue_main_generation_in_transaction(
                user_id=user_id,
                question_card_id=question_card_id,
                idempotency_key=idempotency_key,
            )
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def enqueue_main_generation_in_transaction(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        self._require_configuration()
        if idempotency_key != practice_main_reference_answer_idempotency_key(
            question_card_id
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        context = await self._load_main_context_for_user(
            user_id=user_id,
            question_card_id=question_card_id,
            for_update=True,
        )
        payload = _main_payload(context)
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="practice-reference-answer-generator",
            prompt_id=PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
            prompt_version=PRACTICE_REFERENCE_ANSWER_PROMPT.version,
            output_schema_id=PRACTICE_REFERENCE_ANSWER_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def enqueue_follow_up_generation(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            run = await self.enqueue_follow_up_generation_in_transaction(
                user_id=user_id,
                question_card_id=question_card_id,
                follow_up_question_id=follow_up_question_id,
                idempotency_key=idempotency_key,
            )
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def enqueue_follow_up_generation_in_transaction(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        self._require_configuration()
        if idempotency_key != practice_follow_up_reference_answer_idempotency_key(
            follow_up_question_id
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        context = await self._load_follow_up_context_for_user(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            for_update=True,
        )
        payload = _follow_up_payload(context)
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="practice-reference-answer-generator",
            prompt_id=PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
            prompt_version=PRACTICE_REFERENCE_ANSWER_PROMPT.version,
            output_schema_id=PRACTICE_REFERENCE_ANSWER_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def get_main_generation_state(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        submitted_at: datetime | None,
        for_update: bool = False,
    ) -> PracticeReferenceAnswerWorkflowState:
        return await self._get_generation_state(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=None,
            submitted_at=submitted_at,
            for_update=for_update,
        )

    async def get_follow_up_generation_state(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID,
        submitted_at: datetime | None,
        for_update: bool = False,
    ) -> PracticeReferenceAnswerWorkflowState:
        return await self._get_generation_state(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            submitted_at=submitted_at,
            for_update=for_update,
        )

    async def _get_generation_state(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID | None,
        submitted_at: datetime | None,
        for_update: bool,
    ) -> PracticeReferenceAnswerWorkflowState:
        target_type = (
            PracticeReferenceAnswerTargetType.FOLLOW_UP
            if follow_up_question_id is not None
            else PracticeReferenceAnswerTargetType.MAIN
        )
        idempotency_key = (
            practice_follow_up_reference_answer_idempotency_key(
                follow_up_question_id
            )
            if follow_up_question_id is not None
            else practice_main_reference_answer_idempotency_key(question_card_id)
        )
        run = await self._load_canonical_reference_run(
            user_id=user_id,
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            idempotency_key=idempotency_key,
            for_update=for_update,
        )
        if run is None:
            target_artifact = await self._load_reference_artifact(
                question_card_id=question_card_id,
                follow_up_question_id=follow_up_question_id,
                for_update=for_update,
            )
            if target_artifact is not None:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_ARTIFACT_CONFLICT
                )
            return PracticeReferenceAnswerWorkflowState(
                status=PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
                generation_run=None,
                artifact=None,
                output=None,
                viewed_before_submission=False,
            )

        payload = validate_reference_answer_generation_run(run)
        if (
            payload.target_type != target_type
            or payload.question_card_id != question_card_id
            or (
                follow_up_question_id is not None
                and (
                    not isinstance(payload, PracticeFollowUpReferenceAnswerRunPayload)
                    or payload.follow_up_question_id != follow_up_question_id
                )
            )
            or (
                follow_up_question_id is None
                and not isinstance(payload, PracticeMainReferenceAnswerRunPayload)
            )
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )

        target_artifact = await self._load_reference_artifact(
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            for_update=for_update,
        )

        if isinstance(payload, PracticeMainReferenceAnswerRunPayload):
            await self._load_main_context_for_run(
                run,
                payload,
                for_update=for_update,
            )
        else:
            await self._load_follow_up_context_for_run(
                run,
                payload,
                for_update=for_update,
            )

        source_artifact = await self._load_source_artifact(
            run.id,
            for_update=for_update,
        )
        if source_artifact is not None:
            if target_artifact is None or source_artifact.id != target_artifact.id:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_ARTIFACT_CONFLICT
                )
        if target_artifact is not None and target_artifact.source_agent_run_id != run.id:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_ARTIFACT_CONFLICT
            )

        if run.status in {AgentRunStatus.QUEUED, AgentRunStatus.RUNNING}:
            if target_artifact is not None or source_artifact is not None:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_ARTIFACT_CONFLICT
                )
            return PracticeReferenceAnswerWorkflowState(
                status=PracticeReferenceAnswerLifecycleStatus.GENERATING,
                generation_run=run,
                artifact=None,
                output=None,
                viewed_before_submission=False,
            )

        if run.status == AgentRunStatus.FAILED:
            if target_artifact is not None or source_artifact is not None:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_ARTIFACT_CONFLICT
                )
            return PracticeReferenceAnswerWorkflowState(
                status=PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
                generation_run=run,
                artifact=None,
                output=None,
                viewed_before_submission=False,
            )

        if run.status != AgentRunStatus.SUCCEEDED or target_artifact is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_ARTIFACT_CONFLICT
            )

        try:
            output = practice_reference_answer_output_from_artifact(
                target_artifact
            )
        except ReferenceAnswerGenerationStateError:
            raise
        if (
            output.target_type != payload.target_type
            or output.kind != payload.expected_kind
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_ARTIFACT_CONFLICT
            )
        if not _artifact_matches(
            target_artifact,
            output,
            question_card_id=question_card_id,
            follow_up_question_id=follow_up_question_id,
            source_agent_run_id=run.id,
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_ARTIFACT_CONFLICT
            )
        return PracticeReferenceAnswerWorkflowState(
            status=PracticeReferenceAnswerLifecycleStatus.REVEALED,
            generation_run=run,
            artifact=target_artifact,
            output=output,
            viewed_before_submission=_viewed_before_submission(
                target_artifact,
                submitted_at,
            ),
        )

    async def _load_canonical_reference_run(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID | None,
        idempotency_key: str,
        for_update: bool,
    ) -> AgentRun | None:
        statement = select(AgentRun).where(
            AgentRun.user_id == user_id,
            AgentRun.agent_id == "practice-reference-answer-generator",
            AgentRun.prompt_id == PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
            AgentRun.prompt_version == PRACTICE_REFERENCE_ANSWER_PROMPT.version,
            AgentRun.output_schema_id
            == PRACTICE_REFERENCE_ANSWER_PROMPT.output_schema_id,
            AgentRun.idempotency_key == idempotency_key,
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is not None:
            return run

        target_field = (
            AgentRun.payload["followUpQuestionId"].as_string()
            if follow_up_question_id is not None
            else AgentRun.payload["questionCardId"].as_string()
        )
        target_id = (
            follow_up_question_id
            if follow_up_question_id is not None
            else question_card_id
        )
        candidate_statement = select(AgentRun).where(
            AgentRun.user_id == user_id,
            AgentRun.agent_id == "practice-reference-answer-generator",
            or_(
                target_field == str(target_id),
                AgentRun.idempotency_key == idempotency_key,
            ),
        )
        if for_update:
            candidate_statement = candidate_statement.with_for_update()
        candidate = await self.session.scalar(candidate_statement)
        if candidate is not None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        return None

    async def _load_reference_artifact(
        self,
        *,
        question_card_id: UUID,
        follow_up_question_id: UUID | None,
        for_update: bool,
    ) -> PracticeReferenceAnswerArtifact | None:
        statement = select(PracticeReferenceAnswerArtifact).where(
            PracticeReferenceAnswerArtifact.question_card_id == question_card_id,
            PracticeReferenceAnswerArtifact.target_type
            == (
                PracticeReferenceAnswerTargetType.FOLLOW_UP.value
                if follow_up_question_id is not None
                else PracticeReferenceAnswerTargetType.MAIN.value
            ),
        )
        if follow_up_question_id is None:
            statement = statement.where(
                PracticeReferenceAnswerArtifact.follow_up_question_id.is_(None)
            )
        else:
            statement = statement.where(
                PracticeReferenceAnswerArtifact.follow_up_question_id
                == follow_up_question_id
            )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _load_source_artifact(
        self,
        source_agent_run_id: UUID,
        *,
        for_update: bool,
    ) -> PracticeReferenceAnswerArtifact | None:
        statement = select(PracticeReferenceAnswerArtifact).where(
            PracticeReferenceAnswerArtifact.source_agent_run_id
            == source_agent_run_id
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> PracticeReferenceAnswerInput:
        try:
            result = await self.load_generation_input_in_transaction(run)
            await self.session.commit()
            return result
        except Exception:
            await self.session.rollback()
            raise

    async def load_generation_input_in_transaction(
        self,
        run: AgentRun,
    ) -> PracticeReferenceAnswerInput:
        payload = validate_reference_answer_generation_run(run)
        if isinstance(payload, PracticeMainReferenceAnswerRunPayload):
            if run.idempotency_key != practice_main_reference_answer_idempotency_key(
                payload.question_card_id
            ):
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_CONTEXT_CONFLICT
                )
            return (
                await self._load_main_context_for_run(
                    run,
                    payload,
                    for_update=False,
                )
            ).input
        if run.idempotency_key != practice_follow_up_reference_answer_idempotency_key(
            payload.follow_up_question_id
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        return (
            await self._load_follow_up_context_for_run(
                run,
                payload,
                for_update=False,
            )
        ).input

    async def persist_success(
        self,
        run: AgentRun,
        output: PracticeReferenceAnswerOutput,
    ) -> PracticeReferenceAnswerOutput:
        try:
            payload = validate_reference_answer_generation_run(run)
            if isinstance(payload, PracticeMainReferenceAnswerRunPayload):
                if run.idempotency_key != (
                    practice_main_reference_answer_idempotency_key(
                        payload.question_card_id
                    )
                ):
                    raise ReferenceAnswerGenerationStateError(
                        REFERENCE_ANSWER_CONTEXT_CONFLICT
                    )
                context = await self._load_main_context_for_run(
                    run,
                    payload,
                    for_update=True,
                )
                target_follow_up_id = None
            else:
                if run.idempotency_key != (
                    practice_follow_up_reference_answer_idempotency_key(
                        payload.follow_up_question_id
                    )
                ):
                    raise ReferenceAnswerGenerationStateError(
                        REFERENCE_ANSWER_CONTEXT_CONFLICT
                    )
                context = await self._load_follow_up_context_for_run(
                    run,
                    payload,
                    for_update=True,
                )
                target_follow_up_id = context.question.id

            validated_output = _validate_output(output)
            expected_target = payload.target_type
            expected_kind = payload.expected_kind
            if (
                validated_output.target_type != expected_target
                or validated_output.kind != expected_kind
            ):
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_OUTPUT_MISMATCH
                )

            existing_by_source = await self.session.scalar(
                select(PracticeReferenceAnswerArtifact)
                .where(
                    PracticeReferenceAnswerArtifact.source_agent_run_id
                    == run.id
                )
                .with_for_update()
            )
            if existing_by_source is not None:
                canonical = practice_reference_answer_output_from_artifact(
                    existing_by_source
                )
                if not _artifact_matches(
                    existing_by_source,
                    canonical,
                    question_card_id=context.card.id,
                    follow_up_question_id=target_follow_up_id,
                    source_agent_run_id=run.id,
                ) or canonical != validated_output:
                    raise ReferenceAnswerGenerationStateError(
                        REFERENCE_ANSWER_ARTIFACT_CONFLICT
                    )
                await self.session.commit()
                return canonical

            target_statement = select(PracticeReferenceAnswerArtifact).where(
                PracticeReferenceAnswerArtifact.question_card_id
                == context.card.id,
                PracticeReferenceAnswerArtifact.target_type
                == payload.target_type.value,
            )
            if target_follow_up_id is not None:
                target_statement = target_statement.where(
                    PracticeReferenceAnswerArtifact.follow_up_question_id
                    == target_follow_up_id
                )
            else:
                target_statement = target_statement.where(
                    PracticeReferenceAnswerArtifact.follow_up_question_id.is_(None)
                )
            existing_by_target = await self.session.scalar(
                target_statement.with_for_update()
            )
            if existing_by_target is not None:
                canonical = practice_reference_answer_output_from_artifact(
                    existing_by_target
                )
                if (
                    existing_by_target.source_agent_run_id == run.id
                    and canonical == validated_output
                ):
                    await self.session.commit()
                    return canonical
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_ARTIFACT_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            values = validated_output.model_dump(mode="json", by_alias=False)
            artifact = PracticeReferenceAnswerArtifact(
                id=uuid4(),
                question_card_id=context.card.id,
                follow_up_question_id=target_follow_up_id,
                source_agent_run_id=run.id,
                target_type=validated_output.target_type.value,
                kind=validated_output.kind.value,
                addressed_gap=cast(str | None, values.get("addressed_gap")),
                answer=cast(str, values["answer"]),
                key_points=cast(list[str], values["key_points"]),
                common_mistakes=cast(list[str], values["common_mistakes"]),
                generated_at=now,
            )
            self.session.add(artifact)
            await self.session.commit()
            return practice_reference_answer_output_from_artifact(artifact)
        except Exception:
            await self.session.rollback()
            raise

    async def _load_main_context_for_user(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        for_update: bool,
    ) -> _MainReferenceContext:
        card, _ = await self._load_card_and_question_generation_run(
            user_id=user_id,
            question_card_id=question_card_id,
            for_update=for_update,
        )
        frozen_context = await self._load_frozen_context(
            question_card_id=card.id,
            expected_context=None,
            for_update=for_update,
        )
        return _main_context_from_card(card, frozen_context)

    async def _load_main_context_for_run(
        self,
        run: AgentRun,
        payload: PracticeMainReferenceAnswerRunPayload,
        *,
        for_update: bool,
    ) -> _MainReferenceContext:
        card, _ = await self._load_card_and_question_generation_run(
            user_id=run.user_id,
            question_card_id=payload.question_card_id,
            for_update=for_update,
        )
        if card.language != payload.interaction_language:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        frozen_context = await self._load_frozen_context(
            question_card_id=card.id,
            expected_context=payload.reference_context,
            for_update=for_update,
        )
        context = _main_context_from_card(card, frozen_context)
        if context.input.expected_kind != payload.expected_kind:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        return context

    async def _load_follow_up_context_for_user(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        follow_up_question_id: UUID,
        for_update: bool,
    ) -> _FollowUpReferenceContext:
        card, _ = await self._load_card_and_question_generation_run(
            user_id=user_id,
            question_card_id=question_card_id,
            for_update=for_update,
        )
        frozen_context = await self._load_frozen_context(
            question_card_id=card.id,
            expected_context=None,
            for_update=for_update,
        )
        return await self._load_follow_up_context(
            user_id=user_id,
            card=card,
            frozen_context=frozen_context,
            follow_up_question_id=follow_up_question_id,
            expected_payload=None,
            for_update=for_update,
        )

    async def _load_follow_up_context_for_run(
        self,
        run: AgentRun,
        payload: PracticeFollowUpReferenceAnswerRunPayload,
        *,
        for_update: bool,
    ) -> _FollowUpReferenceContext:
        card, _ = await self._load_card_and_question_generation_run(
            user_id=run.user_id,
            question_card_id=payload.question_card_id,
            for_update=for_update,
        )
        if card.language != payload.interaction_language:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        frozen_context = await self._load_frozen_context(
            question_card_id=card.id,
            expected_context=payload.reference_context,
            for_update=for_update,
        )
        context = await self._load_follow_up_context(
            user_id=run.user_id,
            card=card,
            frozen_context=frozen_context,
            follow_up_question_id=payload.follow_up_question_id,
            expected_payload=payload,
            for_update=for_update,
        )
        if context.input.expected_kind != payload.expected_kind:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        return context

    async def _load_card_and_question_generation_run(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
        for_update: bool,
    ) -> tuple[QuestionCard, AgentRun]:
        card_statement = select(QuestionCard).where(
            QuestionCard.id == question_card_id,
            QuestionCard.user_id == user_id,
        )
        if for_update:
            card_statement = card_statement.with_for_update()
        card = await self.session.scalar(card_statement)
        if card is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_QUESTION_CARD_NOT_READY
            )

        qg_statement = select(AgentRun).where(
            AgentRun.id == card.source_agent_run_id,
        )
        if for_update:
            qg_statement = qg_statement.with_for_update()
        qg_run = await self.session.scalar(qg_statement)
        if (
            qg_run is None
            or qg_run.status != AgentRunStatus.SUCCEEDED
        ):
            raise ReferenceAnswerGenerationStateError(
                INVALID_REFERENCE_ANSWER_GENERATION_RUN
            )
        try:
            validate_question_card_generation_lineage(card, qg_run)
        except QuestionGenerationStateError:
            raise ReferenceAnswerGenerationStateError(
                INVALID_REFERENCE_ANSWER_GENERATION_RUN
            ) from None
        return card, qg_run

    async def _load_frozen_context(
        self,
        *,
        question_card_id: UUID,
        expected_context: PracticeReferenceFrozenContext | None,
        for_update: bool,
    ) -> PracticeReferenceFrozenContext:
        statement = select(PracticeQuestionReferenceContext).where(
            PracticeQuestionReferenceContext.question_card_id == question_card_id
        )
        if for_update:
            statement = statement.with_for_update()
        row = await self.session.scalar(statement)
        if row is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        try:
            frozen_context = PracticeReferenceFrozenContext.model_validate(
                row.frozen_context
            )
        except (TypeError, ValueError, ValidationError):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            ) from None
        if expected_context is not None and not _same_model(
            frozen_context,
            expected_context,
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_CONTEXT_CONFLICT
            )
        return frozen_context

    async def _load_follow_up_context(
        self,
        *,
        user_id: UUID,
        card: QuestionCard,
        frozen_context: PracticeReferenceFrozenContext,
        follow_up_question_id: UUID,
        expected_payload: PracticeFollowUpReferenceAnswerRunPayload | None,
        for_update: bool,
    ) -> _FollowUpReferenceContext:
        question_statement = select(PracticeFollowUpQuestion).where(
            PracticeFollowUpQuestion.id == follow_up_question_id,
        )
        if for_update:
            question_statement = question_statement.with_for_update()
        question = await self.session.scalar(question_statement)
        if question is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )

        attempt_statement = select(PracticeAttempt).where(
            PracticeAttempt.id == question.attempt_id,
            PracticeAttempt.user_id == user_id,
        )
        if for_update:
            attempt_statement = attempt_statement.with_for_update()
        attempt = await self.session.scalar(attempt_statement)
        if (
            attempt is None
            or attempt.question_card_id != card.id
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )

        follow_up_run_statement = select(AgentRun).where(
            AgentRun.id == question.source_agent_run_id,
        )
        if for_update:
            follow_up_run_statement = follow_up_run_statement.with_for_update()
        follow_up_run = await self.session.scalar(follow_up_run_statement)
        if (
            follow_up_run is None
            or follow_up_run.status != AgentRunStatus.SUCCEEDED
            or follow_up_run.user_id != user_id
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )
        try:
            follow_up_payload = validate_follow_up_generation_run(follow_up_run)
        except FollowUpGenerationStateError:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            ) from None
        if not isinstance(follow_up_payload, FollowUpRunPayload):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )
        if (
            isinstance(question.order, bool)
            or not isinstance(question.order, int)
            or not 1 <= question.order <= MAX_PRACTICE_FOLLOW_UPS
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )
        if follow_up_payload.interaction_language != card.language:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )

        decision_statement = select(PracticeFollowUpDecision).where(
            PracticeFollowUpDecision.follow_up_question_id == question.id,
            PracticeFollowUpDecision.attempt_id == attempt.id,
            PracticeFollowUpDecision.source_agent_run_id == follow_up_run.id,
            PracticeFollowUpDecision.action == "askFollowUp",
            PracticeFollowUpDecision.order == question.order,
        )
        if for_update:
            decision_statement = decision_statement.with_for_update()
        decision = await self.session.scalar(decision_statement)
        if decision is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )

        main_answer_statement = select(PracticeAnswer).where(
            PracticeAnswer.attempt_id == attempt.id,
            PracticeAnswer.kind == PracticeAnswerKind.MAIN.value,
            PracticeAnswer.order == 1,
            PracticeAnswer.follow_up_question_id.is_(None),
        )
        if for_update:
            main_answer_statement = main_answer_statement.with_for_update()
        main_answer = await self.session.scalar(main_answer_statement)
        if main_answer is None:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_MAIN_ANSWER_NOT_READY
            )
        if (
            follow_up_payload.attempt_id != attempt.id
            or follow_up_payload.question_card_id != card.id
            or follow_up_payload.main_answer_id != main_answer.id
            or follow_up_payload.next_follow_up_order != question.order
        ):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            )

        previous: list[PracticeReferencePreviousFollowUp] = []
        previous_ids: list[tuple[UUID, UUID]] = []
        for order in range(1, question.order):
            previous_question_statement = select(PracticeFollowUpQuestion).where(
                PracticeFollowUpQuestion.attempt_id == attempt.id,
                PracticeFollowUpQuestion.order == order,
            )
            if for_update:
                previous_question_statement = (
                    previous_question_statement.with_for_update()
                )
            previous_question = await self.session.scalar(
                previous_question_statement
            )
            if previous_question is None:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY
                )
            previous_answer_statement = select(PracticeAnswer).where(
                PracticeAnswer.attempt_id == attempt.id,
                PracticeAnswer.kind == PracticeAnswerKind.FOLLOW_UP.value,
                PracticeAnswer.order == order + 1,
                PracticeAnswer.follow_up_question_id == previous_question.id,
            )
            if for_update:
                previous_answer_statement = previous_answer_statement.with_for_update()
            previous_answer = await self.session.scalar(previous_answer_statement)
            if previous_answer is None:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY
                )
            try:
                content = _answer_content(
                    previous_answer,
                    REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY,
                )
                previous.append(
                    PracticeReferencePreviousFollowUp(
                        order=order,
                        prompt=previous_question.prompt,
                        answer=content,
                    )
                )
            except (TypeError, ValueError, ValidationError):
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY
                ) from None
            previous_ids.append((previous_question.id, previous_answer.id))

        actual_follow_up_previous = (
            (
                follow_up_payload.previous_follow_up_question_id,
                follow_up_payload.previous_follow_up_answer_id,
            )
            if follow_up_payload.previous_follow_up_question_id is not None
            and follow_up_payload.previous_follow_up_answer_id is not None
            else None
        )
        expected_follow_up_previous = previous_ids[0] if previous_ids else None
        if actual_follow_up_previous != expected_follow_up_previous:
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY
            )
        if expected_payload is not None:
            actual_previous = [
                (entry.question_id, entry.answer_id)
                for entry in expected_payload.previous_follow_ups
            ]
            if actual_previous != previous_ids:
                raise ReferenceAnswerGenerationStateError(
                    REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY
                )

        main_content = _answer_content(main_answer)
        try:
            input = PracticeFollowUpReferenceAnswerInput(
                target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
                interaction_language=card.language,
                expected_kind=_expected_kind(
                    card.question_type,
                    PracticeReferenceAnswerTargetType.FOLLOW_UP,
                ),
                target_role=frozen_context.target_role,
                question=_question_context_from_card(card),
                candidate_evidence=frozen_context.candidate_evidence,
                main_answer=PracticeReferenceMainAnswer(content=main_content),
                previous_follow_ups=previous,
                current_follow_up=PracticeReferenceCurrentFollowUp(
                    order=question.order,
                    prompt=question.prompt,
                    focus=question.focus,
                ),
            )
        except (TypeError, ValueError, ValidationError):
            raise ReferenceAnswerGenerationStateError(
                REFERENCE_ANSWER_FOLLOW_UP_NOT_READY
            ) from None
        return _FollowUpReferenceContext(
            card=card,
            attempt=attempt,
            question=question,
            main_answer=main_answer,
            frozen_context=frozen_context,
            input=input,
            previous_ids=tuple(previous_ids),
        )

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _main_payload(
    context: _MainReferenceContext,
) -> PracticeMainReferenceAnswerRunPayload:
    return PracticeMainReferenceAnswerRunPayload(
        target_type=PracticeReferenceAnswerTargetType.MAIN,
        question_card_id=context.card.id,
        interaction_language=cast(InteractionLanguage, context.card.language),
        expected_kind=context.input.expected_kind,
        reference_context=context.frozen_context,
    )


def _follow_up_payload(
    context: _FollowUpReferenceContext,
) -> PracticeFollowUpReferenceAnswerRunPayload:
    return PracticeFollowUpReferenceAnswerRunPayload(
        target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
        question_card_id=context.card.id,
        attempt_id=context.attempt.id,
        main_answer_id=context.main_answer.id,
        follow_up_question_id=context.question.id,
        previous_follow_ups=[
            {
                "order": item.order,
                "question_id": question_id,
                "answer_id": answer_id,
            }
            for item, (question_id, answer_id) in zip(
                context.input.previous_follow_ups,
                context.previous_ids,
                strict=True,
            )
        ],
        interaction_language=cast(InteractionLanguage, context.card.language),
        expected_kind=context.input.expected_kind,
        reference_context=context.frozen_context,
    )

def _main_context_from_card(
    card: QuestionCard,
    frozen_context: PracticeReferenceFrozenContext,
) -> _MainReferenceContext:
    try:
        question = _question_context_from_card(card)
        expected_kind = _expected_kind(
            card.question_type,
            PracticeReferenceAnswerTargetType.MAIN,
        )
        input = PracticeMainReferenceAnswerInput(
            target_type=PracticeReferenceAnswerTargetType.MAIN,
            interaction_language=cast(InteractionLanguage, card.language),
            expected_kind=expected_kind,
            target_role=frozen_context.target_role,
            question=question,
            candidate_evidence=frozen_context.candidate_evidence,
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(
            REFERENCE_ANSWER_QUESTION_CARD_NOT_READY
        ) from None
    return _MainReferenceContext(
        card=card,
        frozen_context=frozen_context,
        input=input,
    )


def _question_context_from_card(card: QuestionCard) -> PracticeReferenceQuestionContext:
    try:
        materials = TypeAdapter(QuestionCardMaterialList).validate_python(
            card.recommended_materials
        )
        return PracticeReferenceQuestionContext(
            prompt=card.prompt,
            question_type=card.question_type,
            difficulty=card.difficulty,
            assessed_capabilities=card.assessed_capabilities,
            answer_framework=card.answer_framework,
            scoring_focus=card.scoring_focus,
            recommended_material_ids=[material.id for material in materials],
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(
            REFERENCE_ANSWER_QUESTION_CARD_NOT_READY
        ) from None


def _expected_kind(
    question_type: str,
    target_type: PracticeReferenceAnswerTargetType,
) -> PracticeReferenceAnswerKind:
    if question_type == QuestionCardQuestionType.TECHNICAL_FOUNDATION.value:
        return PracticeReferenceAnswerKind.TECHNICAL_REFERENCE
    if target_type is PracticeReferenceAnswerTargetType.MAIN:
        return PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE
    return PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT


def _validate_output(output: object) -> PracticeReferenceAnswerOutput:
    try:
        return cast(
            PracticeReferenceAnswerOutput,
            TypeAdapter(PracticeReferenceAnswerOutput).validate_python(output),
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(
            REFERENCE_ANSWER_OUTPUT_MISMATCH
        ) from None


def _answer_content(
    answer: PracticeAnswer,
    error_code: ReferenceAnswerGenerationStateErrorCode = (
        REFERENCE_ANSWER_MAIN_ANSWER_NOT_READY
    ),
) -> str:
    try:
        return cast(
            str,
            TypeAdapter(PracticeAnswerContent).validate_python(answer.content),
        )
    except (TypeError, ValueError, ValidationError):
        raise ReferenceAnswerGenerationStateError(error_code) from None


def _same_model(left: object, right: object) -> bool:
    return (
        hasattr(left, "model_dump")
        and hasattr(right, "model_dump")
        and left.model_dump(mode="json", by_alias=True)
        == right.model_dump(mode="json", by_alias=True)
    )


def _artifact_matches(
    artifact: PracticeReferenceAnswerArtifact,
    output: PracticeReferenceAnswerOutput,
    *,
    question_card_id: UUID,
    follow_up_question_id: UUID | None,
    source_agent_run_id: UUID,
) -> bool:
    return (
        artifact.question_card_id == question_card_id
        and artifact.follow_up_question_id == follow_up_question_id
        and artifact.source_agent_run_id == source_agent_run_id
        and artifact.target_type == output.target_type.value
        and artifact.kind == output.kind.value
    )


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


def _viewed_before_submission(
    artifact: PracticeReferenceAnswerArtifact,
    submitted_at: datetime | None,
) -> bool:
    if submitted_at is None:
        return True
    try:
        _require_aware_datetime(artifact.generated_at)
        _require_aware_datetime(submitted_at)
    except (AttributeError, TypeError, ValueError):
        raise ReferenceAnswerGenerationStateError(
            REFERENCE_ANSWER_CONTEXT_CONFLICT
        ) from None
    return artifact.generated_at <= submitted_at


__all__ = [
    "INVALID_REFERENCE_ANSWER_GENERATION_RUN",
    "REFERENCE_ANSWER_ARTIFACT_CONFLICT",
    "REFERENCE_ANSWER_CONTEXT_CONFLICT",
    "REFERENCE_ANSWER_FOLLOW_UP_NOT_READY",
    "REFERENCE_ANSWER_MAIN_ANSWER_NOT_READY",
    "REFERENCE_ANSWER_OUTPUT_MISMATCH",
    "REFERENCE_ANSWER_PREVIOUS_EXCHANGE_NOT_READY",
    "REFERENCE_ANSWER_QUESTION_CARD_NOT_READY",
    "PracticeReferenceAnswerLifecycleStatus",
    "PracticeReferenceAnswerWorkflowState",
    "ReferenceAnswerGenerationService",
    "ReferenceAnswerGenerationStateError",
    "ReferenceAnswerGenerationStateErrorCode",
    "practice_follow_up_reference_answer_idempotency_key",
    "practice_main_reference_answer_idempotency_key",
    "practice_reference_answer_output_from_artifact",
    "validate_reference_answer_generation_run",
]
