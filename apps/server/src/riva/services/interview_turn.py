from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewAnswer,
    InterviewFollowUpAnswer,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    InterviewTurnAssessment,
    User,
)
from riva.prompts import INTERVIEW_TURN_PROMPT
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewRound,
)
from riva.schemas.interview_planning import (
    InterviewPlanningQuestion,
    InterviewPlanningRunPayload,
)
from riva.schemas.interview_turn import (
    InterviewTurnAnswerSnapshot,
    InterviewTurnAssessmentOutput,
    InterviewTurnCompleteQuestionAction,
    InterviewTurnFollowUpAction,
    InterviewTurnFollowUpExchange,
    InterviewTurnInput,
    InterviewTurnNextAction,
    InterviewTurnOutput,
    InterviewTurnQuestionContext,
    InterviewTurnRunPayload,
    InterviewTurnSessionSnapshot,
    MAX_INTERVIEW_FOLLOW_UPS_BASIC,
    MAX_INTERVIEW_FOLLOW_UPS_PRESSURE,
)
from riva.services.agent_runs import AgentRunService
from riva.utils import utc_now


InterviewTurnStateErrorCode = Literal[
    "interview_turn_session_not_found",
    "interview_turn_version_conflict",
    "interview_turn_state_invalid",
    "interview_turn_question_mismatch",
    "interview_turn_follow_up_mismatch",
    "interview_turn_answer_invalid",
    "interview_turn_run_invalid",
    "interview_turn_snapshot_invalid",
    "interview_turn_model_not_configured",
]

INTERVIEW_TURN_SESSION_NOT_FOUND: InterviewTurnStateErrorCode = (
    "interview_turn_session_not_found"
)
INTERVIEW_TURN_VERSION_CONFLICT: InterviewTurnStateErrorCode = (
    "interview_turn_version_conflict"
)
INTERVIEW_TURN_STATE_INVALID: InterviewTurnStateErrorCode = (
    "interview_turn_state_invalid"
)
INTERVIEW_TURN_QUESTION_MISMATCH: InterviewTurnStateErrorCode = (
    "interview_turn_question_mismatch"
)
INTERVIEW_TURN_FOLLOW_UP_MISMATCH: InterviewTurnStateErrorCode = (
    "interview_turn_follow_up_mismatch"
)
INTERVIEW_TURN_ANSWER_INVALID: InterviewTurnStateErrorCode = (
    "interview_turn_answer_invalid"
)
INTERVIEW_TURN_RUN_INVALID: InterviewTurnStateErrorCode = (
    "interview_turn_run_invalid"
)
INTERVIEW_TURN_SNAPSHOT_INVALID: InterviewTurnStateErrorCode = (
    "interview_turn_snapshot_invalid"
)
INTERVIEW_TURN_MODEL_NOT_CONFIGURED: InterviewTurnStateErrorCode = (
    "interview_turn_model_not_configured"
)


class InterviewTurnStateError(RuntimeError):
    safe_message = "The interview turn state is invalid."

    def __init__(self, code: InterviewTurnStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]


class InterviewTurnService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = llm_model
        self.clock = clock

    async def submit_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
        target: Literal["question", "followUp"],
        question_id: UUID,
        content: str,
        follow_up_question_id: UUID | None = None,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            normalized_content = _normalized_content(content)

            question = await self._current_question(
                interview_session,
                for_update=True,
            )
            if question is None:
                raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
            if question.id != question_id:
                raise InterviewTurnStateError(INTERVIEW_TURN_QUESTION_MISMATCH)

            if target == "question":
                if follow_up_question_id is not None:
                    raise InterviewTurnStateError(
                        INTERVIEW_TURN_QUESTION_MISMATCH
                    )
                if interview_session.status != "question":
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                existing_answer = await self.session.scalar(
                    select(InterviewAnswer)
                    .where(InterviewAnswer.question_id == question.id)
                    .with_for_update()
                )
                if existing_answer is not None:
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                now = self._now()
                answer = InterviewAnswer(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=question.id,
                    content=normalized_content,
                    submitted_at=now,
                )
                self.session.add(answer)
                await self.session.flush()
                turn_input = await self._build_turn_input(
                    interview_session,
                    question,
                    answer,
                    (),
                )
                target_type: Literal["main", "followUp"] = "main"
                submitted_answer_id = answer.id
                follow_up_answer_id = None
                follow_up_id = None
            else:
                if interview_session.status != "followUp":
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                if follow_up_question_id is None:
                    raise InterviewTurnStateError(
                        INTERVIEW_TURN_FOLLOW_UP_MISMATCH
                    )
                follow_up = await self.session.scalar(
                    select(InterviewFollowUpQuestion)
                    .where(
                        InterviewFollowUpQuestion.id == follow_up_question_id,
                        InterviewFollowUpQuestion.parent_question_id == question.id,
                        InterviewFollowUpQuestion.session_id == interview_session.id,
                    )
                    .with_for_update()
                )
                if follow_up is None:
                    raise InterviewTurnStateError(
                        INTERVIEW_TURN_FOLLOW_UP_MISMATCH
                    )
                existing_follow_up_answer = await self.session.scalar(
                    select(InterviewFollowUpAnswer)
                    .where(
                        InterviewFollowUpAnswer.follow_up_question_id
                        == follow_up.id
                    )
                    .with_for_update()
                )
                if existing_follow_up_answer is not None:
                    raise InterviewTurnStateError(
                        INTERVIEW_TURN_STATE_INVALID
                    )
                main_answer = await self._main_answer(question.id)
                if main_answer is None:
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                now = self._now()
                answer = InterviewFollowUpAnswer(
                    id=uuid4(),
                    session_id=interview_session.id,
                    follow_up_question_id=follow_up.id,
                    content=normalized_content,
                    submitted_at=now,
                )
                self.session.add(answer)
                await self.session.flush()
                answered_follow_ups = await self._answered_follow_ups(
                    question.id,
                )
                turn_input = await self._build_turn_input(
                    interview_session,
                    question,
                    main_answer,
                    answered_follow_ups,
                )
                target_type = "followUp"
                submitted_answer_id = answer.id
                follow_up_answer_id = answer.id
                follow_up_id = follow_up.id

            run = await self._enqueue_turn(
                interview_session=interview_session,
                turn_input=turn_input,
                target_type=target_type,
                submitted_answer_id=submitted_answer_id,
                main_answer_id=turn_input.main_answer.id,
                follow_up_question_id=follow_up_id,
                follow_up_answer_id=follow_up_answer_id,
                idempotency_key=(
                    f"interview-turn:{interview_session.id}:answer:"
                    f"{submitted_answer_id}"
                ),
            )
            interview_session.turn_run_id = run.id
            interview_session.status = "generatingTurn"
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewTurnStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def retry_turn(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            if (
                interview_session.status != "generatingTurn"
                or interview_session.turn_run_id is None
            ):
                raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
            failed_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == interview_session.turn_run_id)
                .with_for_update()
            )
            if failed_run is None:
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            if _status_value(failed_run.status) != AgentRunStatus.FAILED.value:
                raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
            payload = self._validate_run_payload(failed_run)
            if (
                payload.session_id != interview_session.id
                or payload.session_state_version != interview_session.version
            ):
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            retry_payload = payload.model_copy(
                update={
                    "session_state_version": interview_session.version + 1,
                    "retry_of_run_id": failed_run.id,
                }
            )
            run = await self._enqueue_turn_payload(
                user_id=user_id,
                payload=retry_payload,
                idempotency_key=(
                    f"interview-turn-retry:{interview_session.id}:run:"
                    f"{failed_run.id}"
                ),
            )
            interview_session.turn_run_id = run.id
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewTurnStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def load_turn_input(self, run: AgentRun) -> InterviewTurnInput:
        payload = self._validate_run_payload(run)
        return payload.interview_turn_input

    async def persist_success(
        self,
        run: AgentRun,
        output: InterviewTurnOutput,
    ) -> InterviewTurnOutput:
        try:
            payload = self._validate_run_payload(run)
            validated_output = _validate_output(output)
            await self._lock_user(run.user_id)
            persisted_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == run.id)
                .with_for_update()
            )
            if persisted_run is None or _status_value(persisted_run.status) != (
                AgentRunStatus.RUNNING.value
            ):
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            self._validate_run_metadata(persisted_run, run.user_id)

            interview_session = await self._locked_session(
                run.user_id,
                payload.session_id,
            )
            if (
                interview_session.turn_run_id != run.id
                or interview_session.status != "generatingTurn"
                or interview_session.version != payload.session_state_version
            ):
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            question = await self.session.scalar(
                select(InterviewQuestion)
                .where(
                    InterviewQuestion.id == payload.question_id,
                    InterviewQuestion.session_id == interview_session.id,
                )
                .with_for_update()
            )
            if question is None or question.completed_at is not None:
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            self._validate_answer_lineage(payload, question)
            self._validate_question_lineage(payload, question)
            await self._validate_persisted_answer_lineage(payload, question)

            existing_assessment = await self.session.scalar(
                select(InterviewTurnAssessment)
                .where(InterviewTurnAssessment.source_agent_run_id == run.id)
                .with_for_update()
            )
            if existing_assessment is not None:
                canonical = _output_from_assessment(
                    existing_assessment,
                    await self._follow_up_for_assessment(existing_assessment),
                )
                await self.session.commit()
                return canonical

            plan = await self.session.scalar(
                select(InterviewPlan)
                .where(
                    InterviewPlan.id == payload.plan_id,
                    InterviewPlan.session_id == interview_session.id,
                    InterviewPlan.revision == payload.plan_revision,
                )
            )
            if plan is None:
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)

            effective_action: InterviewTurnNextAction = validated_output.next_action
            follow_up_count = len(
                list(
                    (
                        await self.session.scalars(
                            select(InterviewFollowUpQuestion)
                            .where(
                                InterviewFollowUpQuestion.parent_question_id
                                == question.id
                            )
                            .order_by(InterviewFollowUpQuestion.order.asc())
                        )
                    ).all()
                )
            )
            if isinstance(effective_action, InterviewTurnFollowUpAction):
                max_follow_ups = _max_follow_ups(interview_session.difficulty)
                if (
                    payload.remaining_follow_up_slots <= 0
                    or follow_up_count >= max_follow_ups
                ):
                    effective_action = InterviewTurnCompleteQuestionAction(
                        type="completeQuestion"
                    )

            assessment = InterviewTurnAssessment(
                id=uuid4(),
                session_id=interview_session.id,
                question_id=question.id,
                source_agent_run_id=run.id,
                main_answer_id=(
                    payload.main_answer_id
                    if payload.target_type == "main"
                    else None
                ),
                follow_up_answer_id=(
                    payload.follow_up_answer_id
                    if payload.target_type == "followUp"
                    else None
                ),
                score=validated_output.assessment.score,
                summary=validated_output.assessment.summary,
                strengths=list(validated_output.assessment.strengths),
                issues=list(validated_output.assessment.issues),
                decision=effective_action.type,
                created_at=self._now(),
            )
            self.session.add(assessment)
            await self.session.flush()

            if isinstance(effective_action, InterviewTurnFollowUpAction):
                self.session.add(
                    InterviewFollowUpQuestion(
                        id=uuid4(),
                        session_id=interview_session.id,
                        parent_question_id=question.id,
                        source_turn_run_id=run.id,
                        order=follow_up_count + 1,
                        prompt=effective_action.prompt,
                        created_at=self._now(),
                    )
                )
                interview_session.status = "followUp"
            else:
                question.completed_at = self._now()
                next_question = await self._next_planned_question(
                    plan,
                    question.order,
                )
                if next_question is None:
                    interview_session.status = "candidateQuestions"
                else:
                    existing_next = await self.session.scalar(
                        select(InterviewQuestion).where(
                            InterviewQuestion.session_id == interview_session.id,
                            InterviewQuestion.order == next_question.order,
                        )
                    )
                    if existing_next is not None:
                        raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                    self.session.add(
                        InterviewQuestion(
                            id=uuid4(),
                            session_id=interview_session.id,
                            source_plan_id=plan.id,
                            plan_revision=plan.revision,
                            order=next_question.order,
                            prompt=next_question.prompt,
                            question_type=next_question.question_type.value,
                            assessed_capabilities=list(
                                next_question.assessed_capabilities
                            ),
                            created_at=self._now(),
                        )
                    )
                    interview_session.status = "question"
            interview_session.version += 1
            await self.session.commit()
            if effective_action is validated_output.next_action:
                return validated_output
            return validated_output.model_copy(
                update={"next_action": effective_action}
            )
        except InterviewTurnStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _enqueue_turn(
        self,
        *,
        interview_session: InterviewSession,
        turn_input: InterviewTurnInput,
        target_type: Literal["main", "followUp"],
        submitted_answer_id: UUID,
        main_answer_id: UUID,
        follow_up_question_id: UUID | None,
        follow_up_answer_id: UUID | None,
        idempotency_key: str,
    ) -> AgentRun:
        payload = InterviewTurnRunPayload(
            session_id=interview_session.id,
            session_version=turn_input.session.version,
            session_state_version=interview_session.version + 1,
            plan_id=turn_input.plan_id,
            plan_revision=turn_input.plan_revision,
            question_id=turn_input.question_id,
            target_type=target_type,
            submitted_answer_id=submitted_answer_id,
            main_answer_id=main_answer_id,
            follow_up_question_id=follow_up_question_id,
            follow_up_answer_id=follow_up_answer_id,
            interaction_language=turn_input.session.language,
            remaining_follow_up_slots=turn_input.remaining_follow_up_slots,
            interview_turn_input=turn_input,
        )
        return await self._enqueue_turn_payload(
            user_id=interview_session.user_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )

    async def _enqueue_turn_payload(
        self,
        *,
        user_id: UUID,
        payload: InterviewTurnRunPayload,
        idempotency_key: str,
    ) -> AgentRun:
        model = (self.llm_model or "").strip()
        if not model:
            raise InterviewTurnStateError(INTERVIEW_TURN_MODEL_NOT_CONFIGURED)
        return await AgentRunService(self.session).enqueue_in_transaction(
            user_id=user_id,
            agent_id=INTERVIEW_TURN_PROMPT.prompt_id,
            prompt_id=INTERVIEW_TURN_PROMPT.prompt_id,
            prompt_version=INTERVIEW_TURN_PROMPT.version,
            output_schema_id=INTERVIEW_TURN_PROMPT.output_schema_id,
            model=model,
            payload=cast(
                dict[str, object],
                payload.model_dump(mode="json", by_alias=True, exclude_none=True),
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def _build_turn_input(
        self,
        interview_session: InterviewSession,
        question: InterviewQuestion,
        main_answer: InterviewAnswer,
        answered_follow_ups: Sequence[
            tuple[InterviewFollowUpQuestion, InterviewFollowUpAnswer]
        ],
    ) -> InterviewTurnInput:
        plan = await self.session.scalar(
            select(InterviewPlan).where(
                InterviewPlan.id == question.source_plan_id,
                InterviewPlan.session_id == interview_session.id,
                InterviewPlan.revision == question.plan_revision,
            )
        )
        if plan is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
        planning_run = await self.session.scalar(
            select(AgentRun).where(AgentRun.id == plan.source_agent_run_id)
        )
        if planning_run is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID)
        try:
            planning_payload = InterviewPlanningRunPayload.model_validate(
                planning_run.payload
            )
            planning_input = planning_payload.interview_planning_input
            planned_question = _planned_question(plan.questions, question.order)
            if (
                question.prompt != planned_question.prompt
                or question.question_type != planned_question.question_type.value
                or list(question.assessed_capabilities)
                != list(planned_question.assessed_capabilities)
            ):
                raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID)
            turn_question = InterviewTurnQuestionContext(
                prompt=planned_question.prompt,
                question_type=planned_question.question_type,
                assessed_capabilities=list(
                    planned_question.assessed_capabilities
                ),
                objective=planned_question.objective,
                follow_up_directions=list(
                    planned_question.follow_up_directions
                ),
                scoring_focus=list(planned_question.scoring_focus),
            )
            exchanges = tuple(
                InterviewTurnFollowUpExchange(
                    order=follow_up.order,
                    question_id=follow_up.id,
                    prompt=follow_up.prompt,
                    answer=InterviewTurnAnswerSnapshot(
                        id=answer.id,
                        content=answer.content,
                        submitted_at=answer.submitted_at,
                    ),
                )
                for follow_up, answer in answered_follow_ups
            )
            return InterviewTurnInput(
                session=InterviewTurnSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=interview_session.language,
                    configuration=_session_configuration(interview_session),
                ),
                plan_id=plan.id,
                plan_revision=plan.revision,
                question_id=question.id,
                planned_question=turn_question,
                main_answer=InterviewTurnAnswerSnapshot(
                    id=main_answer.id,
                    content=main_answer.content,
                    submitted_at=main_answer.submitted_at,
                ),
                answered_follow_ups=list(exchanges),
                remaining_follow_up_slots=(
                    _max_follow_ups(interview_session.difficulty)
                    - len(exchanges)
                ),
                career_profile=planning_input.career_profile,
                target_role=planning_input.target_role,
                job_description_analysis=planning_input.job_description_analysis,
                matching_analysis=planning_input.matching_analysis,
            )
        except (TypeError, ValueError, ValidationError, AttributeError):
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None

    async def _next_planned_question(
        self,
        plan: InterviewPlan,
        current_order: int,
    ) -> InterviewPlanningQuestion | None:
        try:
            return _planned_question(
                plan.questions,
                current_order + 1,
                required=False,
            )
        except (TypeError, ValueError, ValidationError):
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None

    async def _main_answer(self, question_id: UUID) -> InterviewAnswer | None:
        return await self.session.scalar(
            select(InterviewAnswer)
            .where(InterviewAnswer.question_id == question_id)
            .with_for_update()
        )

    async def _answered_follow_ups(
        self,
        question_id: UUID,
    ) -> tuple[tuple[InterviewFollowUpQuestion, InterviewFollowUpAnswer], ...]:
        rows = (
            await self.session.execute(
                select(InterviewFollowUpQuestion, InterviewFollowUpAnswer)
                .join(
                    InterviewFollowUpAnswer,
                    InterviewFollowUpAnswer.follow_up_question_id
                    == InterviewFollowUpQuestion.id,
                )
                .where(
                    InterviewFollowUpQuestion.parent_question_id == question_id
                )
                .order_by(InterviewFollowUpQuestion.order.asc())
                .with_for_update()
            )
        ).all()
        return tuple((question, answer) for question, answer in rows)

    async def _current_question(
        self,
        interview_session: InterviewSession,
        *,
        for_update: bool,
    ) -> InterviewQuestion | None:
        statement = (
            select(InterviewQuestion)
            .where(
                InterviewQuestion.session_id == interview_session.id,
                InterviewQuestion.completed_at.is_(None),
            )
            .order_by(InterviewQuestion.order.desc())
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _locked_session(
        self,
        user_id: UUID,
        session_id: UUID,
    ) -> InterviewSession:
        interview_session = await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
            .with_for_update()
        )
        if interview_session is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)
        return interview_session

    async def _lock_user(self, user_id: UUID) -> None:
        exists = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if exists is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)

    def _require_version(
        self,
        interview_session: InterviewSession,
        version: int,
    ) -> None:
        if interview_session.version != version:
            raise InterviewTurnStateError(INTERVIEW_TURN_VERSION_CONFLICT)

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value

    @staticmethod
    def _validate_run_metadata(run: AgentRun, user_id: UUID) -> None:
        if (
            run.user_id != user_id
            or run.agent_id != INTERVIEW_TURN_PROMPT.prompt_id
            or run.prompt_id != INTERVIEW_TURN_PROMPT.prompt_id
            or run.prompt_version != INTERVIEW_TURN_PROMPT.version
            or run.output_schema_id != INTERVIEW_TURN_PROMPT.output_schema_id
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)

    @classmethod
    def _validate_run_payload(cls, run: AgentRun) -> InterviewTurnRunPayload:
        cls._validate_run_metadata(run, run.user_id)
        try:
            return InterviewTurnRunPayload.model_validate(run.payload)
        except (TypeError, ValueError, ValidationError):
            raise InterviewTurnStateError(
                INTERVIEW_TURN_SNAPSHOT_INVALID
            ) from None

    async def _follow_up_for_assessment(
        self,
        assessment: InterviewTurnAssessment,
    ) -> InterviewFollowUpQuestion | None:
        if assessment.decision != "followUp":
            return None
        return await self.session.scalar(
            select(InterviewFollowUpQuestion).where(
                InterviewFollowUpQuestion.source_turn_run_id
                == assessment.source_agent_run_id
            )
        )

    async def _validate_persisted_answer_lineage(
        self,
        payload: InterviewTurnRunPayload,
        question: InterviewQuestion,
    ) -> None:
        main_answer = await self.session.scalar(
            select(InterviewAnswer)
            .where(
                InterviewAnswer.id == payload.main_answer_id,
                InterviewAnswer.session_id == payload.session_id,
                InterviewAnswer.question_id == question.id,
            )
            .with_for_update()
        )
        if main_answer is None or (
            main_answer.content != payload.interview_turn_input.main_answer.content
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
        if payload.target_type == "main":
            if payload.submitted_answer_id != main_answer.id:
                raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
            return
        if payload.follow_up_question_id is None or payload.follow_up_answer_id is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
        follow_up = await self.session.scalar(
            select(InterviewFollowUpQuestion).where(
                InterviewFollowUpQuestion.id == payload.follow_up_question_id,
                InterviewFollowUpQuestion.session_id == payload.session_id,
                InterviewFollowUpQuestion.parent_question_id == question.id,
            )
        )
        follow_up_answer = await self.session.scalar(
            select(InterviewFollowUpAnswer)
            .where(
                InterviewFollowUpAnswer.id == payload.follow_up_answer_id,
                InterviewFollowUpAnswer.session_id == payload.session_id,
                InterviewFollowUpAnswer.follow_up_question_id
                == payload.follow_up_question_id,
            )
            .with_for_update()
        )
        if follow_up is None or follow_up_answer is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
        exchanges = payload.interview_turn_input.answered_follow_ups
        if not exchanges:
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)
        submitted_exchange = exchanges[-1]
        if (
            payload.submitted_answer_id != follow_up_answer.id
            or submitted_exchange.question_id != follow_up.id
            or submitted_exchange.order != follow_up.order
            or submitted_exchange.prompt != follow_up.prompt
            or submitted_exchange.answer.id != follow_up_answer.id
            or submitted_exchange.answer.content != follow_up_answer.content
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)

    @staticmethod
    def _validate_question_lineage(
        payload: InterviewTurnRunPayload,
        question: InterviewQuestion,
    ) -> None:
        planned_question = payload.interview_turn_input.planned_question
        if (
            question.prompt != planned_question.prompt
            or question.question_type != planned_question.question_type.value
            or list(question.assessed_capabilities)
            != list(planned_question.assessed_capabilities)
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)

    @staticmethod
    def _validate_answer_lineage(
        payload: InterviewTurnRunPayload,
        question: InterviewQuestion,
    ) -> None:
        if (
            question.order < 1
            or question.source_plan_id != payload.plan_id
            or question.plan_revision != payload.plan_revision
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID)


def _validate_output(output: object) -> InterviewTurnOutput:
    try:
        return InterviewTurnOutput.model_validate(output)
    except (TypeError, ValueError, ValidationError):
        raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID) from None


def _output_from_assessment(
    assessment: InterviewTurnAssessment,
    follow_up: InterviewFollowUpQuestion | None,
) -> InterviewTurnOutput:
    try:
        action: InterviewTurnNextAction
        if assessment.decision == "followUp":
            if follow_up is None:
                raise ValueError
            action = InterviewTurnFollowUpAction(
                type="followUp",
                prompt=follow_up.prompt,
            )
        else:
            action = InterviewTurnCompleteQuestionAction(type="completeQuestion")
        return InterviewTurnOutput(
            assessment=InterviewTurnAssessmentOutput(
                score=assessment.score,
                summary=assessment.summary,
                strengths=list(assessment.strengths),
                issues=list(assessment.issues),
            ),
            next_action=action,
        )
    except (TypeError, ValueError, ValidationError):
        raise InterviewTurnStateError(INTERVIEW_TURN_RUN_INVALID) from None


def _planned_question(
    questions: object,
    order: int,
    *,
    required: bool = True,
) -> InterviewPlanningQuestion | None:
    if not isinstance(questions, list):
        raise ValueError("plan questions must be a list")
    for raw in questions:
        question = InterviewPlanningQuestion.model_validate(raw)
        if question.order == order:
            return question
    if required:
        raise ValueError("planned question does not exist")
    return None


def _max_follow_ups(difficulty: str) -> int:
    try:
        value = InterviewDifficulty(difficulty)
    except ValueError:
        raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID) from None
    return (
        MAX_INTERVIEW_FOLLOW_UPS_PRESSURE
        if value.value == "pressure"
        else MAX_INTERVIEW_FOLLOW_UPS_BASIC
    )


def _normalized_content(content: str) -> str:
    if not isinstance(content, str):
        raise InterviewTurnStateError(INTERVIEW_TURN_ANSWER_INVALID)
    normalized = content.strip()
    if not normalized or len(normalized) > 20_000:
        raise InterviewTurnStateError(INTERVIEW_TURN_ANSWER_INVALID)
    return normalized


def _session_configuration(session: InterviewSession) -> InterviewConfiguration:
    try:
        return InterviewConfiguration(
            target_role_id=session.target_role_id,
            round=InterviewRound(session.round),
            difficulty=InterviewDifficulty(session.difficulty),
            duration_minutes=session.duration_minutes,
        )
    except (TypeError, ValueError):
        raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID) from None


def _status_value(status_value: object) -> str:
    return str(getattr(status_value, "value", status_value))


__all__ = [
    "INTERVIEW_TURN_ANSWER_INVALID",
    "INTERVIEW_TURN_FOLLOW_UP_MISMATCH",
    "INTERVIEW_TURN_MODEL_NOT_CONFIGURED",
    "INTERVIEW_TURN_QUESTION_MISMATCH",
    "INTERVIEW_TURN_RUN_INVALID",
    "INTERVIEW_TURN_SESSION_NOT_FOUND",
    "INTERVIEW_TURN_SNAPSHOT_INVALID",
    "INTERVIEW_TURN_STATE_INVALID",
    "INTERVIEW_TURN_VERSION_CONFLICT",
    "InterviewTurnService",
    "InterviewTurnStateError",
    "InterviewTurnStateErrorCode",
]
