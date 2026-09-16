from uuid import UUID

from procrastinate import JobContext
from pydantic import TypeAdapter

from riva.ai.practice import PracticeRoundInput
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeQuestionTurn,
    PracticeRound,
    PracticeSession,
    PracticeTurn,
    PracticeTurnContent,
)
from riva.tasks import Task, TaskAttempt, TaskErrorCode, app, get_task_resources
from riva.tasks.errors import TaskError
from riva.tasks.registry import PracticeRunAction
from riva.utils import utc_now

_TURN_ADAPTER = TypeAdapter(PracticeTurnContent)


@app.task(
    name=Task.RUN_PRACTICE_ROUND.name,
    queue=Task.RUN_PRACTICE_ROUND.queue,
    pass_context=True,
    retry=False,
)
async def run_practice_round(
    context: JobContext,
    *,
    round_id: str,
    action: str,
    answer_turn_id: str | None = None,
) -> None:
    resources = get_task_resources(context)
    round_id = UUID(round_id)
    attempt = TaskAttempt(context.job)
    try:
        async with resources.database.sessionmaker() as session:
            round = await session.get(PracticeRound, round_id)
            if round is None or not await attempt.is_current(session, round.job_id):
                return
            action = PracticeRunAction(action)
            if (action is PracticeRunAction.ANSWER) != (answer_turn_id is not None):
                raise TaskError("Only answer tasks require an answer turn ID.")
            practice_id = round.practice_id
            if action in (PracticeRunAction.START, PracticeRunAction.RESTART):
                practice = await session.get(PracticeSession, practice_id)
                input = PracticeRoundInput(
                    profile=practice.profile_snapshot,
                    role=practice.role_snapshot,
                    question_type=practice.question_type,
                    difficulty=practice.difficulty,
                    max_follow_ups=practice.max_follow_ups,
                ).model_copy(deep=True)
                if action is PracticeRunAction.RESTART:
                    if len(round.turns) != 1 or round.turns[0].role != "assistant":
                        raise TaskError(
                            "Replacement round requires its original main question."
                        )
                    main_question = PracticeQuestionTurn.model_validate(
                        round.turns[0], from_attributes=True
                    )
            elif action is PracticeRunAction.ANSWER:
                turn = await session.get(PracticeTurn, UUID(answer_turn_id))
                if turn is None or turn.round_id != round_id or turn.role != "user":
                    raise TaskError("Practice answer turn was not found.")
                answer = PracticeAnswerTurn.model_validate(turn, from_attributes=True)

        agent = resources.practice_round_agent
        match action:
            case PracticeRunAction.START:
                output = await agent.start(round_id, input)
            case PracticeRunAction.ANSWER:
                output = await agent.answer(round_id, answer)
            case PracticeRunAction.FINISH:
                output = await agent.finish(round_id)
            case PracticeRunAction.RESTART:
                output = await agent.restart(round_id, input, main_question)

        async with resources.database.sessionmaker() as session:
            # Services use the same parent -> round -> task lock order.
            practice = await session.get(
                PracticeSession, practice_id, with_for_update=True
            )
            round = await session.get(
                PracticeRound, round_id, with_for_update=True, populate_existing=True
            )
            if (
                practice is None
                or round is None
                or not await attempt.lock_for_write(session, round.job_id)
            ):
                return
            existing = [
                _TURN_ADAPTER.validate_python(turn, from_attributes=True)
                for turn in round.turns
            ]
            if (
                len(existing) > len(output.turns)
                or existing != output.turns[: len(existing)]
                or any(turn.sequence != index for index, turn in enumerate(round.turns))
            ):
                raise TaskError(
                    "Stored round turns are not an identical prefix of the agent output."
                )
            for sequence, turn in enumerate(
                output.turns[len(existing) :], start=len(existing)
            ):
                if not isinstance(turn, PracticeQuestionTurn):
                    raise TaskError("Only the service may persist practice answers.")
                round.turns.append(
                    PracticeTurn(
                        round_id=round_id, sequence=sequence, **turn.model_dump()
                    )
                )
            round.result = output.result
            round.job_id = None
            round.error_code = None
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
            round = await session.get(PracticeRound, round_id, with_for_update=True)
            if round is not None and await attempt.lock_for_write(
                session, round.job_id
            ):
                round.error_code = error_code
                await attempt.finish(session, failed=True)
                await session.commit()
        raise
