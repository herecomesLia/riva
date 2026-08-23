from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.interview_turn import InterviewTurnAgent
from riva.integrations import LLMProvider
from riva.models import (
    InterviewAnswer,
    InterviewFollowUpAnswer,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    InterviewTurnAssessment,
    User,
)
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewRound,
)
from riva.schemas.interview_planning import InterviewPlanningQuestion
from riva.schemas.interview_turn import (
    MAX_INTERVIEW_FOLLOW_UPS_BASIC,
    MAX_INTERVIEW_FOLLOW_UPS_PRESSURE,
    InterviewTurnAnswerSnapshot,
    InterviewTurnCompleteQuestionAction,
    InterviewTurnFollowUpAction,
    InterviewTurnFollowUpExchange,
    InterviewTurnInput,
    InterviewTurnNextAction,
    InterviewTurnOutput,
    InterviewTurnQuestionContext,
    InterviewTurnSessionSnapshot,
)
from riva.services.competency_ingestion import CompetencyIngestionService
from riva.services.interview_planning import InterviewPlanningService
from riva.utils import utc_now

InterviewTurnStateErrorCode = Literal[
    "interview_turn_session_not_found",
    "interview_turn_version_conflict",
    "interview_turn_state_invalid",
    "interview_turn_question_mismatch",
    "interview_turn_follow_up_mismatch",
    "interview_turn_answer_invalid",
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
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        clock: Clock = utc_now,
        competency_ingestion_service_factory: Callable[
            [AsyncSession], CompetencyIngestionService
        ] = CompetencyIngestionService,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.clock = clock
        self.competency_ingestion_service_factory = competency_ingestion_service_factory

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
            question = await self._current_question(interview_session, for_update=True)
            if question is None or question.id != question_id:
                raise InterviewTurnStateError(INTERVIEW_TURN_QUESTION_MISMATCH)
            normalized_content = _normalized_content(content)

            if target == "question":
                if (
                    follow_up_question_id is not None
                    or interview_session.status != "question"
                ):
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                if await self._main_answer(question.id) is not None:
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                now = self._now()
                main_answer = InterviewAnswer(
                    id=uuid4(),
                    session_id=session_id,
                    question_id=question.id,
                    content=normalized_content,
                    submitted_at=now,
                )
                self.session.add(main_answer)
                await self.session.flush()
                answered_follow_ups: tuple[
                    tuple[InterviewFollowUpQuestion, InterviewFollowUpAnswer], ...
                ] = ()
                target_type: Literal["main", "followUp"] = "main"
                main_answer_for_input = main_answer
                follow_up_id = None
                follow_up_answer_id = None
            else:
                if (
                    interview_session.status != "followUp"
                    or follow_up_question_id is None
                ):
                    raise InterviewTurnStateError(INTERVIEW_TURN_FOLLOW_UP_MISMATCH)
                follow_up = await self.session.scalar(
                    select(InterviewFollowUpQuestion)
                    .where(
                        InterviewFollowUpQuestion.id == follow_up_question_id,
                        InterviewFollowUpQuestion.parent_question_id == question.id,
                        InterviewFollowUpQuestion.session_id == session_id,
                    )
                    .with_for_update()
                )
                if follow_up is None:
                    raise InterviewTurnStateError(INTERVIEW_TURN_FOLLOW_UP_MISMATCH)
                if (
                    await self.session.scalar(
                        select(InterviewFollowUpAnswer).where(
                            InterviewFollowUpAnswer.follow_up_question_id
                            == follow_up.id
                        )
                    )
                    is not None
                ):
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                main_answer_for_input = await self._main_answer(question.id)
                if main_answer_for_input is None:
                    raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
                now = self._now()
                follow_up_answer = InterviewFollowUpAnswer(
                    id=uuid4(),
                    session_id=session_id,
                    follow_up_question_id=follow_up.id,
                    content=normalized_content,
                    submitted_at=now,
                )
                self.session.add(follow_up_answer)
                await self.session.flush()
                answered_follow_ups = await self._answered_follow_ups(question.id)
                target_type = "followUp"
                follow_up_id = follow_up.id
                follow_up_answer_id = follow_up_answer.id

            turn_input = await self._build_turn_input(
                interview_session,
                question,
                main_answer_for_input,
                answered_follow_ups,
                user_id=user_id,
            )
            output = await self._run(turn_input)
            await self._persist_output(
                interview_session=interview_session,
                question=question,
                turn_input=turn_input,
                target_type=target_type,
                follow_up_question_id=follow_up_id,
                follow_up_answer_id=follow_up_answer_id,
                output=output,
                user_id=user_id,
            )
            await self.session.commit()
            return interview_session
        except InterviewTurnStateError:
            await self.session.rollback()
            raise
        except TypeError, ValueError, ValidationError:
            await self.session.rollback()
            raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _run(self, turn_input: InterviewTurnInput) -> InterviewTurnOutput:
        if self.llm_provider is None or not self.llm_model:
            raise InterviewTurnStateError(INTERVIEW_TURN_MODEL_NOT_CONFIGURED)
        return (
            await InterviewTurnAgent(self.llm_provider, self.llm_model).run(turn_input)
        ).output

    async def _persist_output(
        self,
        *,
        interview_session: InterviewSession,
        question: InterviewQuestion,
        turn_input: InterviewTurnInput,
        target_type: Literal["main", "followUp"],
        follow_up_question_id: UUID | None,
        follow_up_answer_id: UUID | None,
        output: InterviewTurnOutput,
        user_id: UUID,
    ) -> None:
        validated = _validate_output(output)
        follow_up_count = len(
            list(
                (
                    await self.session.scalars(
                        select(InterviewFollowUpQuestion).where(
                            InterviewFollowUpQuestion.parent_question_id == question.id
                        )
                    )
                ).all()
            )
        )
        effective_action: InterviewTurnNextAction = validated.next_action
        if isinstance(effective_action, InterviewTurnFollowUpAction) and (
            turn_input.remaining_follow_up_slots <= 0
            or follow_up_count >= _max_follow_ups(interview_session.difficulty)
        ):
            effective_action = InterviewTurnCompleteQuestionAction(
                type="completeQuestion"
            )

        assessment = InterviewTurnAssessment(
            id=uuid4(),
            session_id=interview_session.id,
            question_id=question.id,
            main_answer_id=turn_input.main_answer.id if target_type == "main" else None,
            follow_up_answer_id=follow_up_answer_id
            if target_type == "followUp"
            else None,
            score=validated.assessment.score,
            summary=validated.assessment.summary,
            strengths=list(validated.assessment.strengths),
            issues=list(validated.assessment.issues),
            decision=effective_action.type,
            created_at=self._now(),
        )
        self.session.add(assessment)
        await self.session.flush()
        await self.competency_ingestion_service_factory(
            self.session
        ).ingest_interview_turn(
            user_id=user_id,
            interview_session=interview_session,
            assessment=assessment,
        )
        if isinstance(effective_action, InterviewTurnFollowUpAction):
            self.session.add(
                InterviewFollowUpQuestion(
                    id=uuid4(),
                    session_id=interview_session.id,
                    parent_question_id=question.id,
                    order=follow_up_count + 1,
                    prompt=effective_action.prompt,
                    created_at=self._now(),
                )
            )
            interview_session.status = "followUp"
        else:
            question.completed_at = self._now()
            plan = await self.session.scalar(
                select(InterviewPlan).where(
                    InterviewPlan.id == question.source_plan_id,
                    InterviewPlan.session_id == interview_session.id,
                    InterviewPlan.revision == question.plan_revision,
                )
            )
            if plan is None:
                raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID)
            next_planned = _planned_question(
                plan.questions, question.order + 1, required=False
            )
            if next_planned is None:
                interview_session.status = "candidateQuestions"
            else:
                self.session.add(
                    InterviewQuestion(
                        id=uuid4(),
                        session_id=interview_session.id,
                        source_plan_id=plan.id,
                        plan_revision=plan.revision,
                        order=next_planned.order,
                        prompt=next_planned.prompt,
                        question_type=next_planned.question_type.value,
                        assessed_capabilities=list(next_planned.assessed_capabilities),
                        created_at=self._now(),
                    )
                )
                interview_session.status = "question"
        interview_session.version += 1
        interview_session.updated_at = self._now()

    async def _build_turn_input(
        self,
        interview_session: InterviewSession,
        question: InterviewQuestion,
        main_answer: InterviewAnswer,
        answered_follow_ups: Sequence[
            tuple[InterviewFollowUpQuestion, InterviewFollowUpAnswer]
        ],
        *,
        user_id: UUID,
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
        planned_question = _planned_question(plan.questions, question.order)
        if (
            question.prompt != planned_question.prompt
            or question.question_type != planned_question.question_type.value
            or list(question.assessed_capabilities)
            != list(planned_question.assessed_capabilities)
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID)
        planner_context = await InterviewPlanningService(
            self.session
        )._build_planning_input(
            interview_session,
            user_id=user_id,
        )
        exchanges = [
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
        ]
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
            planned_question=InterviewTurnQuestionContext(
                prompt=planned_question.prompt,
                question_type=planned_question.question_type,
                assessed_capabilities=list(planned_question.assessed_capabilities),
                objective=planned_question.objective,
                follow_up_directions=list(planned_question.follow_up_directions),
                scoring_focus=list(planned_question.scoring_focus),
            ),
            main_answer=InterviewTurnAnswerSnapshot(
                id=main_answer.id,
                content=main_answer.content,
                submitted_at=main_answer.submitted_at,
            ),
            answered_follow_ups=exchanges,
            remaining_follow_up_slots=(
                _max_follow_ups(interview_session.difficulty) - len(exchanges)
            ),
            career_profile=planner_context.career_profile,
            target_role=planner_context.target_role,
            job_description_analysis=planner_context.job_description_analysis,
            matching_analysis=planner_context.matching_analysis,
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
                .where(InterviewFollowUpQuestion.parent_question_id == question_id)
                .order_by(InterviewFollowUpQuestion.order.asc())
            )
        ).all()
        return tuple((question, answer) for question, answer in rows)

    async def _main_answer(self, question_id: UUID) -> InterviewAnswer | None:
        return await self.session.scalar(
            select(InterviewAnswer).where(InterviewAnswer.question_id == question_id)
        )

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
        self, user_id: UUID, session_id: UUID
    ) -> InterviewSession:
        interview_session = await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id, InterviewSession.user_id == user_id
            )
            .with_for_update()
        )
        if interview_session is None:
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)
        return interview_session

    async def _lock_user(self, user_id: UUID) -> None:
        if (
            await self.session.scalar(
                select(User.id).where(User.id == user_id).with_for_update()
            )
            is None
        ):
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)

    @staticmethod
    def _require_version(interview_session: InterviewSession, version: int) -> None:
        if interview_session.version != version:
            raise InterviewTurnStateError(INTERVIEW_TURN_VERSION_CONFLICT)

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value


def _validate_output(output: object) -> InterviewTurnOutput:
    try:
        return InterviewTurnOutput.model_validate(output)
    except TypeError, ValueError, ValidationError:
        raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID) from None


def _planned_question(
    questions: object,
    order: int,
    *,
    required: bool = True,
) -> InterviewPlanningQuestion | None:
    if not isinstance(questions, list):
        raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID)
    for raw in questions:
        question = InterviewPlanningQuestion.model_validate(raw)
        if question.order == order:
            return question
    if required:
        raise InterviewTurnStateError(INTERVIEW_TURN_SNAPSHOT_INVALID)
    return None


def _max_follow_ups(difficulty: str) -> int:
    try:
        value = InterviewDifficulty(difficulty)
    except ValueError:
        raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID) from None
    return (
        MAX_INTERVIEW_FOLLOW_UPS_PRESSURE
        if value == InterviewDifficulty.PRESSURE
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
    except TypeError, ValueError:
        raise InterviewTurnStateError(INTERVIEW_TURN_STATE_INVALID) from None


__all__ = [
    "INTERVIEW_TURN_ANSWER_INVALID",
    "INTERVIEW_TURN_FOLLOW_UP_MISMATCH",
    "INTERVIEW_TURN_MODEL_NOT_CONFIGURED",
    "INTERVIEW_TURN_QUESTION_MISMATCH",
    "INTERVIEW_TURN_SESSION_NOT_FOUND",
    "INTERVIEW_TURN_SNAPSHOT_INVALID",
    "INTERVIEW_TURN_STATE_INVALID",
    "INTERVIEW_TURN_VERSION_CONFLICT",
    "InterviewTurnService",
    "InterviewTurnStateError",
    "InterviewTurnStateErrorCode",
]
