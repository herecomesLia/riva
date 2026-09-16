from uuid import UUID

from procrastinate import JobContext
from pydantic import TypeAdapter

from riva.ai.practice import PracticeInput
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeQuestionTurn,
    PracticeSession,
    PracticeTurn,
    PracticeTurnContent,
)
from riva.models.role import Role, RoleContent
from riva.tasks import Task, TaskAttempt, TaskErrorCode, app, get_task_resources
from riva.tasks.errors import TaskError
from riva.utils import utc_now

_TURN_ADAPTER = TypeAdapter(PracticeTurnContent)


@app.task(
    name=Task.RUN_PRACTICE.name,
    queue=Task.RUN_PRACTICE.queue,
    pass_context=True,
    retry=False,
)
async def run_practice(
    context: JobContext, *, practice_id: str, answer_turn_id: str | None = None
) -> None:
    resources = get_task_resources(context)
    practice_id = UUID(practice_id)
    attempt = TaskAttempt(context.job)
    try:
        async with resources.database.sessionmaker() as session:
            practice = await session.get(PracticeSession, practice_id)
            if practice is None or not await attempt.is_current(
                session, practice.job_id
            ):
                return
            if answer_turn_id is None:
                profile = await session.get(CareerProfile, practice.user_id)
                role = (
                    await session.get(Role, practice.role_id)
                    if practice.role_id is not None
                    else None
                )
                if (
                    profile is None
                    or role is None
                    or role.jd is None
                    or role.user_id != practice.user_id
                ):
                    raise TaskError(
                        "Practice requires a career profile and target role with a JD."
                    )
                input = PracticeInput(
                    profile=CareerProfileContent.model_validate(
                        profile, from_attributes=True
                    ),
                    role=RoleContent.model_validate(role, from_attributes=True),
                    question_type=practice.question_type,
                    difficulty=practice.difficulty,
                    max_follow_ups=practice.max_follow_ups,
                ).model_copy(deep=True)
            else:
                turn = await session.get(PracticeTurn, UUID(answer_turn_id))
                if (
                    turn is None
                    or turn.practice_id != practice_id
                    or turn.role != "user"
                ):
                    raise TaskError("Practice answer turn was not found.")
                answer = PracticeAnswerTurn.model_validate(turn, from_attributes=True)

        if answer_turn_id is None:
            output = await resources.practice_agent.start(practice_id, input)
        else:
            output = await resources.practice_agent.answer(practice_id, answer)

        async with resources.database.sessionmaker() as session:
            practice = await session.get(
                PracticeSession, practice_id, with_for_update=True
            )
            if practice is None or not await attempt.lock_for_write(
                session, practice.job_id
            ):
                return
            existing = [
                _TURN_ADAPTER.validate_python(turn, from_attributes=True)
                for turn in practice.turns
            ]
            if (
                len(existing) > len(output.turns)
                or existing != output.turns[: len(existing)]
                or any(
                    turn.sequence != index for index, turn in enumerate(practice.turns)
                )
            ):
                raise TaskError(
                    "Stored practice turns are not an identical prefix of the engine output."
                )
            for sequence, turn in enumerate(
                output.turns[len(existing) :], start=len(existing)
            ):
                if not isinstance(turn, PracticeQuestionTurn):
                    raise TaskError("Only the service may persist practice answers.")
                practice.turns.append(
                    PracticeTurn(
                        practice_id=practice_id, sequence=sequence, **turn.model_dump()
                    )
                )
            practice.result = output.result
            practice.job_id = None
            practice.error_code = None
            practice.updated_at = utc_now()
            await attempt.finish(session)
            await session.commit()
    except Exception as exc:
        if isinstance(exc, LLMOutputError):
            error_code = TaskErrorCode.INVALID_OUTPUT
        elif isinstance(exc, LLMUnavailableError):
            error_code = TaskErrorCode.LLM_UNAVAILABLE
        else:
            error_code = TaskErrorCode.INTERNAL_ERROR
        async with resources.database.sessionmaker() as session:
            practice = await session.get(
                PracticeSession, practice_id, with_for_update=True
            )
            if practice is not None and await attempt.lock_for_write(
                session, practice.job_id
            ):
                practice.error_code = error_code
                await attempt.finish(session, failed=True)
                await session.commit()
        raise
