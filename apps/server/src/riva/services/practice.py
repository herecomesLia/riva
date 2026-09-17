from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload, selectinload

from riva.ai.checkpoints import delete_checkpoints
from riva.ai.practice import PracticeRoundInput
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeDifficulty,
    PracticeQuestionType,
    PracticeRound,
    PracticeSession,
    PracticeTurn,
)
from riva.models.role import Role, RoleContent
from riva.models.user import User
from riva.services.errors import ConflictError, DomainValidationError, NotFoundError
from riva.services.types import TaskState
from riva.tasks import Task, TaskController, TaskErrorCode, TaskStatus
from riva.tasks.registry import PracticeRunAction
from riva.utils import utc_now


class PracticeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.tasks = TaskController(session)

    async def list(self, user: User) -> list[PracticeSession]:
        return list(
            await self.session.scalars(
                select(PracticeSession)
                .where(PracticeSession.user_id == user.id)
                .options(
                    selectinload(PracticeSession.rounds).raiseload(PracticeRound.turns)
                )
                .order_by(PracticeSession.created_at.desc(), PracticeSession.id.desc())
            )
        )

    async def get(self, user: User, practice_id: UUID) -> PracticeSession:
        practice = await self.session.scalar(
            select(PracticeSession)
            .where(
                PracticeSession.id == practice_id, PracticeSession.user_id == user.id
            )
            .options(
                selectinload(PracticeSession.rounds).selectinload(PracticeRound.turns)
            )
        )
        if practice is None:
            raise NotFoundError("Practice session was not found.")
        return practice

    async def get_active(self, user: User) -> PracticeSession | None:
        if user.active_practice_id is None:
            return None
        return await self.get(user, user.active_practice_id)

    async def get_round(
        self, user: User, practice_id: UUID, round_id: UUID
    ) -> PracticeRound:
        round = await self.session.scalar(
            _round_query(user, practice_id, round_id).options(
                selectinload(PracticeRound.turns)
            )
        )
        if round is None:
            raise NotFoundError("Practice round was not found.")
        return round

    async def create(
        self,
        user: User,
        *,
        role: Role,
        question_type: PracticeQuestionType,
        difficulty: PracticeDifficulty,
        max_follow_ups: int,
    ) -> UUID:
        user = await self._lock_user(user)
        if user.active_practice_id is not None:
            raise ConflictError("An active practice session already exists.")
        role = await self.session.scalar(
            select(Role)
            .where(Role.id == role.id, Role.user_id == user.id)
            .with_for_update(read=True)
            .execution_options(populate_existing=True)
        )
        if role is None:
            raise NotFoundError("Target role was not found.")
        profile = await self.session.get(CareerProfile, user.id)
        if profile is None:
            raise NotFoundError("Career profile was not found.")
        if role.jd is None:
            raise NotFoundError("Job description was not found.")
        try:
            input = PracticeRoundInput(
                profile=CareerProfileContent.model_validate(
                    profile, from_attributes=True
                ),
                role=RoleContent.model_validate(role, from_attributes=True),
                question_type=question_type,
                difficulty=difficulty,
                max_follow_ups=max_follow_ups,
            )
        except ValidationError as exc:
            raise DomainValidationError(
                "Practice context or settings are invalid."
            ) from exc
        practice = PracticeSession(
            id=uuid4(),
            user_id=user.id,
            role_id=role.id,
            role=role,
            role_title_snapshot=role.title,
            role_company_snapshot=role.company,
            profile_snapshot=input.profile,
            role_snapshot=input.role,
            question_type=input.question_type,
            difficulty=input.difficulty,
            max_follow_ups=input.max_follow_ups,
            rounds=[],
        )
        self.session.add(practice)
        await self._new_round(practice, sequence=0)
        user.active_practice = practice
        await self.session.commit()
        return practice.id

    async def answer(
        self,
        user: User,
        practice_id: UUID,
        *,
        round_id: UUID,
        question_id: UUID,
        content: str,
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        try:
            answer = PracticeAnswerTurn(id=uuid4(), content=content)
        except ValidationError as exc:
            raise DomainValidationError("Answer content must not be blank.") from exc
        for index, turn in enumerate(round.turns):
            if turn.id == question_id and turn.role == "assistant":
                if index + 1 < len(round.turns):
                    existing = round.turns[index + 1]
                    if existing.role == "user" and existing.content == answer.content:
                        await self.session.commit()
                        return
                    raise ConflictError("This question already has a different answer.")
                break
        else:
            raise ConflictError("The question is not part of this round.")
        self._require_ready(round)
        if round.result is not None or round.turns[-1].role != "assistant":
            raise ConflictError("Round is not waiting for an answer.")
        round.turns.append(
            PracticeTurn(
                round_id=round.id, sequence=len(round.turns), **answer.model_dump()
            )
        )
        await self._enqueue(practice, round, PracticeRunAction.ANSWER, answer.id)
        await self.session.commit()

    async def skip_round(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        self._require_ready(round)
        if round.result is not None or len(round.turns) != 1:
            raise ConflictError("Only an unanswered main question can be skipped.")
        sequence = round.sequence
        practice.rounds.remove(round)
        await self.session.flush()
        await self._new_round(practice, sequence=sequence)
        await self.session.commit()
        await self._delete_checkpoints([round_id])

    async def finish_round(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        self._require_ready(round)
        if (
            round.result is not None
            or len(round.turns) < 3
            or round.turns[-1].role != "assistant"
        ):
            raise ConflictError("Round must be waiting for a follow-up answer.")
        round.turns.pop()
        await self._enqueue(practice, round, PracticeRunAction.FINISH)
        await self.session.commit()

    async def restart_round(
        self,
        user: User,
        practice_id: UUID,
        *,
        round_id: UUID,
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        self._require_ready(round)
        if round.result is None:
            raise ConflictError("Round must be completed before retrying.")
        replacement = PracticeRound(
            id=uuid4(), practice_id=practice.id, sequence=round.sequence, turns=[]
        )
        practice.rounds.append(replacement)
        main_question = round.turns.pop(0)
        replacement.turns.append(main_question)
        # Move the existing question before deleting the old round and its other turns.
        await self.session.flush()
        practice.rounds.remove(round)
        await self._enqueue(practice, replacement, PracticeRunAction.RESTART)
        await self.session.commit()
        await self._delete_checkpoints([round_id])

    async def next_round(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        self._require_ready(round)
        if round.result is None:
            raise ConflictError(
                "Round must be completed before starting the next round."
            )
        await self._new_round(practice, sequence=round.sequence + 1)
        await self.session.commit()

    async def end_session(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        self._require_ready(round)
        if round.result is None:
            raise ConflictError("Complete the current round before ending the session.")
        practice.ended_at = utc_now()
        user = await self.session.get(User, practice.user_id)
        user.active_practice = None
        await self.session.commit()

    async def get_round_task_state(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> TaskState:
        round = await self.session.scalar(
            _round_query(user, practice_id, round_id).options(
                raiseload(PracticeRound.turns)
            )
        )
        if round is None:
            raise NotFoundError("Practice round was not found.")
        status = await self.tasks.get_status(round.job_id)
        return TaskState(
            status,
            (round.error_code or TaskErrorCode.SERVICE_UNAVAILABLE)
            if status is TaskStatus.FAILED
            else None,
        )

    async def retry_task(
        self, user: User, practice_id: UUID, *, round_id: UUID
    ) -> None:
        practice = await self._lock(user, practice_id)
        round = self._current(practice, round_id)
        await self.tasks.retry(round.job_id)
        round.error_code = None
        await self.session.commit()

    async def delete(self, user: User, practice_id: UUID) -> None:
        practice = await self._lock(user, practice_id)
        round_ids = [round.id for round in practice.rounds]
        user = await self.session.get(User, practice.user_id)
        for round in practice.rounds:
            if await self.tasks.is_active(round.job_id):
                await self.tasks.abort(round.job_id)
        if user.active_practice_id == practice.id:
            user.active_practice = None
        await self.session.delete(practice)
        await self.session.commit()
        await self._delete_checkpoints(round_ids)

    async def _new_round(
        self, practice: PracticeSession, *, sequence: int
    ) -> PracticeRound:
        round = PracticeRound(
            id=uuid4(), practice_id=practice.id, sequence=sequence, turns=[]
        )
        practice.rounds.append(round)
        await self._enqueue(practice, round, PracticeRunAction.START)
        return round

    async def _enqueue(
        self,
        practice: PracticeSession,
        round: PracticeRound,
        action: PracticeRunAction,
        answer_turn_id: UUID | None = None,
    ) -> None:
        await self.session.flush()
        round.job_id = await self.tasks.start(
            Task.RUN_PRACTICE_ROUND,
            round_id=str(round.id),
            action=action.value,
            answer_turn_id=str(answer_turn_id) if answer_turn_id is not None else None,
        )
        round.error_code = None

    async def _lock_user(self, user: User) -> User:
        locked = await self.session.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if locked is None:
            raise NotFoundError("User was not found.")
        return locked

    async def _lock(self, user: User, practice_id: UUID) -> PracticeSession:
        # Match create/end/delete lock order, including updates to active_practice_id.
        await self._lock_user(user)
        practice = await self.session.scalar(
            select(PracticeSession)
            .where(
                PracticeSession.id == practice_id, PracticeSession.user_id == user.id
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if practice is None:
            raise NotFoundError("Practice session was not found.")
        await self.session.execute(
            select(PracticeRound.id)
            .where(PracticeRound.practice_id == practice.id)
            .order_by(PracticeRound.sequence.desc())
            .limit(1)
            .with_for_update()
        )
        return practice

    @staticmethod
    def _current(practice: PracticeSession, round_id: UUID) -> PracticeRound:
        if practice.ended_at is not None:
            raise ConflictError("Practice session has ended.")
        if not practice.rounds or practice.rounds[-1].id != round_id:
            raise ConflictError("The round is not the current round.")
        return practice.rounds[-1]

    @staticmethod
    def _require_ready(round: PracticeRound) -> None:
        if round.job_id is not None:
            raise ConflictError(
                "Round has unfinished work; wait or retry the failed task."
            )

    async def _delete_checkpoints(self, round_ids: list[UUID]) -> None:
        url = self.session.get_bind().engine.url.render_as_string(hide_password=False)
        await delete_checkpoints(url, round_ids)


def _round_query(
    user: User, practice_id: UUID, round_id: UUID
) -> Select[tuple[PracticeRound]]:
    return (
        select(PracticeRound)
        .join(PracticeSession)
        .where(
            PracticeRound.id == round_id,
            PracticeRound.practice_id == practice_id,
            PracticeSession.user_id == user.id,
        )
    )
