from collections.abc import Callable
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.interview.planning import (
    INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED,
    INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY,
    INTERVIEW_PLANNING_PROFILE_INCOMPLETE,
    INTERVIEW_PLANNING_PROFILE_NOT_FOUND,
    INTERVIEW_PLANNING_RUN_INVALID,
    INTERVIEW_PLANNING_SNAPSHOT_INVALID,
    INTERVIEW_PLANNING_STATE_INVALID,
    INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND,
    InterviewPlanningWorkflow,
    InterviewPlanningWorkflowError,
)
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    User,
)
from riva.schemas.interview_planning import (
    InterviewPlanningInput,
    InterviewPlanningOutput,
)
from riva.services.training_memory import TrainingMemoryService
from riva.utils import utc_now

InterviewPlanningStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_session_version_conflict",
    "interview_planning_state_invalid",
    "interview_planning_run_invalid",
    "interview_planning_snapshot_invalid",
    "interview_planning_profile_incomplete",
    "interview_planning_profile_not_found",
    "interview_planning_target_role_not_found",
    "interview_planning_job_description_not_ready",
    "interview_planner_model_not_configured",
]

INTERVIEW_PLANNING_SESSION_NOT_FOUND: InterviewPlanningStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_PLANNING_VERSION_CONFLICT: InterviewPlanningStateErrorCode = (
    "interview_session_version_conflict"
)


class InterviewPlanningStateError(RuntimeError):
    safe_message = "The interview planning state is invalid."

    def __init__(self, code: InterviewPlanningStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]


class InterviewPlanningService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = llm_model
        self.training_memory_service_factory = training_memory_service_factory
        self.clock = clock

    async def begin_questions(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self.session.scalar(
                select(InterviewSession)
                .where(
                    InterviewSession.id == session_id,
                    InterviewSession.user_id == user_id,
                )
                .with_for_update()
            )
            if interview_session is None:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
            if interview_session.version != version:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_VERSION_CONFLICT)

            retry_memory = None
            workflow = self._workflow()
            if interview_session.status == "generatingQuestion":
                if interview_session.planning_run_id is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                planning_run = await self.session.scalar(
                    select(AgentRun)
                    .where(AgentRun.id == interview_session.planning_run_id)
                    .with_for_update()
                )
                if planning_run is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                if _status_value(planning_run.status) in {
                    AgentRunStatus.QUEUED.value,
                    AgentRunStatus.RUNNING.value,
                }:
                    await self.session.commit()
                    return interview_session
                if _status_value(planning_run.status) != AgentRunStatus.FAILED.value:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                retry_memory = workflow.retry_training_memory(planning_run)
            elif interview_session.status != "opening":
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)

            run = await workflow.enqueue_planning_run(
                interview_session,
                user_id=user_id,
                session_version=version,
                training_memory=retry_memory,
            )
            interview_session.status = "generatingQuestion"
            interview_session.planning_run_id = run.id
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewPlanningStateError:
            await self.session.rollback()
            raise
        except InterviewPlanningWorkflowError as error:
            await self.session.rollback()
            raise _state_error(error) from None
        except Exception:
            await self.session.rollback()
            raise

    async def load_planning_input(
        self,
        run: AgentRun,
    ) -> InterviewPlanningInput:
        try:
            return self._workflow().load_planning_input(run)
        except InterviewPlanningWorkflowError as error:
            raise _state_error(error) from None
        except Exception:
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    async def persist_success(
        self,
        run: AgentRun,
        output: InterviewPlanningOutput,
    ) -> InterviewPlan:
        try:
            workflow = self._workflow()
            payload = workflow.validate_run_payload(run)
            output = workflow.validate_output(output)

            await self._lock_user(run.user_id)
            persisted_run = await self.session.scalar(
                select(AgentRun).where(AgentRun.id == run.id).with_for_update()
            )
            if persisted_run is None or _status_value(persisted_run.status) != (
                AgentRunStatus.RUNNING.value
            ):
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)
            workflow.validate_persisted_run_identity(persisted_run, run)

            interview_session = await self.session.scalar(
                select(InterviewSession)
                .where(
                    InterviewSession.id == payload.session_id,
                    InterviewSession.user_id == run.user_id,
                )
                .with_for_update()
            )
            if interview_session is None:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
            if (
                interview_session.planning_run_id != run.id
                or interview_session.status != "generatingQuestion"
                or interview_session.version != payload.session_version + 1
                or interview_session.target_role_id != payload.target_role_id
                or interview_session.language != payload.interaction_language
                or workflow.session_configuration(interview_session)
                != payload.interview_planning_input.configuration
            ):
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)

            workflow.validate_output_for_duration(
                output,
                interview_session.duration_minutes,
            )

            existing_plan = await self.session.scalar(
                select(InterviewPlan)
                .where(
                    InterviewPlan.session_id == interview_session.id,
                    InterviewPlan.revision == 1,
                )
                .with_for_update()
            )
            if existing_plan is not None:
                if existing_plan.source_agent_run_id != run.id:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)
                existing_question = await self.session.scalar(
                    select(InterviewQuestion).where(
                        InterviewQuestion.session_id == interview_session.id,
                        InterviewQuestion.order == 1,
                    )
                )
                if existing_question is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                await self.session.commit()
                return existing_plan

            now = self.clock()
            _require_aware_datetime(now)
            plan = InterviewPlan(
                id=uuid4(),
                session_id=interview_session.id,
                revision=1,
                source_agent_run_id=run.id,
                total_main_questions=output.total_main_questions,
                questions=cast(
                    list[dict[str, object]],
                    [
                        question.model_dump(mode="json", by_alias=True)
                        for question in output.questions
                    ],
                ),
                created_at=now,
            )
            self.session.add(plan)
            await self.session.flush()

            first_question = output.questions[0]
            self.session.add(
                InterviewQuestion(
                    id=uuid4(),
                    session_id=interview_session.id,
                    source_plan_id=plan.id,
                    plan_revision=1,
                    order=first_question.order,
                    prompt=first_question.prompt,
                    question_type=first_question.question_type.value,
                    assessed_capabilities=list(first_question.assessed_capabilities),
                    created_at=now,
                )
            )
            interview_session.plan_revision = 1
            interview_session.total_main_questions = output.total_main_questions
            interview_session.status = "question"
            interview_session.version += 1
            await self.session.commit()
            return plan
        except InterviewPlanningStateError:
            await self.session.rollback()
            raise
        except InterviewPlanningWorkflowError as error:
            await self.session.rollback()
            raise _state_error(error) from None
        except TypeError, ValueError:
            await self.session.rollback()
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    def _workflow(self) -> InterviewPlanningWorkflow:
        return InterviewPlanningWorkflow(
            self.session,
            llm_model=self.llm_model,
            training_memory_service_factory=self.training_memory_service_factory,
        )

    async def _lock_user(self, user_id: UUID) -> None:
        exists = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if exists is None:
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)


def _state_error(
    error: InterviewPlanningWorkflowError,
) -> InterviewPlanningStateError:
    return InterviewPlanningStateError(
        cast(InterviewPlanningStateErrorCode, error.code)
    )


def _status_value(status: object) -> str:
    return str(getattr(status, "value", status))


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED",
    "INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY",
    "INTERVIEW_PLANNING_PROFILE_INCOMPLETE",
    "INTERVIEW_PLANNING_PROFILE_NOT_FOUND",
    "INTERVIEW_PLANNING_RUN_INVALID",
    "INTERVIEW_PLANNING_SESSION_NOT_FOUND",
    "INTERVIEW_PLANNING_SNAPSHOT_INVALID",
    "INTERVIEW_PLANNING_STATE_INVALID",
    "INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND",
    "INTERVIEW_PLANNING_VERSION_CONFLICT",
    "InterviewPlanningService",
    "InterviewPlanningStateError",
]
