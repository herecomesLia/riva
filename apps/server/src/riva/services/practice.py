from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.ai.practice import PracticeInput
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeDifficulty,
    PracticeQuestionType,
    PracticeSession,
    PracticeTurn,
)
from riva.models.role import Role, RoleContent
from riva.models.user import User
from riva.services.errors import ConflictError, DomainValidationError, NotFoundError
from riva.services.types import TaskState
from riva.tasks import Task, TaskController, TaskErrorCode, TaskStatus
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
                .order_by(PracticeSession.created_at.desc(), PracticeSession.id.desc())
            )
        )

    async def get(self, user: User, practice_id: UUID) -> PracticeSession:
        practice = await self.session.scalar(
            select(PracticeSession).where(
                PracticeSession.id == practice_id, PracticeSession.user_id == user.id
            )
        )
        if practice is None:
            raise NotFoundError("Practice session was not found.")
        return practice

    async def create(
        self,
        user: User,
        *,
        role: Role,
        question_type: PracticeQuestionType,
        difficulty: PracticeDifficulty,
        max_follow_ups: int,
    ) -> PracticeSession:
        if role.user_id != user.id:
            raise NotFoundError("Target role was not found.")
        # Serialize context capture with role edits/deletion so display values
        # cannot miss a concurrent update to the live role.
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
            input = PracticeInput(
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
            question_type=input.question_type,
            difficulty=input.difficulty,
            max_follow_ups=input.max_follow_ups,
            turns=[],
        )
        self.session.add(practice)
        await self.session.flush()
        practice.job_id = await self.tasks.start(
            Task.RUN_PRACTICE, practice_id=str(practice.id), answer_turn_id=None
        )
        practice.error_code = None
        await self.session.commit()
        return practice

    async def answer(
        self, user: User, practice_id: UUID, *, question_id: UUID, content: str
    ) -> PracticeSession:
        practice = await self._lock(user, practice_id)
        try:
            answer = PracticeAnswerTurn(id=uuid4(), content=content)
        except ValidationError as exc:
            raise DomainValidationError("Answer content must not be blank.") from exc
        for index, turn in enumerate(practice.turns):
            if turn.id == question_id and turn.role == "assistant":
                if index + 1 < len(practice.turns):
                    existing = practice.turns[index + 1]
                    if existing.role == "user" and existing.content == answer.content:
                        await self.session.commit()
                        return practice
                    raise ConflictError("This question already has a different answer.")
                break
        else:
            raise ConflictError("The question is not part of this practice.")
        if practice.result is not None or await self.tasks.is_active(practice.job_id):
            raise ConflictError("Practice is not accepting a new answer.")
        latest = practice.turns[-1]
        if latest.role != "assistant" or latest.id != question_id:
            raise ConflictError("The question is no longer awaiting an answer.")
        practice.turns.append(
            PracticeTurn(
                sequence=latest.sequence + 1,
                practice_id=practice.id,
                **answer.model_dump(),
            )
        )
        practice.job_id = await self.tasks.start(
            Task.RUN_PRACTICE,
            practice_id=str(practice.id),
            answer_turn_id=str(answer.id),
        )
        practice.error_code = None
        practice.updated_at = utc_now()
        await self.session.commit()
        return practice

    async def get_task_state(self, user: User, practice_id: UUID) -> TaskState:
        practice = await self._lock(user, practice_id, shared=True)
        status = await self.tasks.get_status(practice.job_id)
        return TaskState(
            status,
            (practice.error_code or TaskErrorCode.SERVICE_UNAVAILABLE)
            if status is TaskStatus.FAILED
            else None,
        )

    async def retry(self, user: User, practice_id: UUID) -> None:
        practice = await self._lock(user, practice_id)
        await self.tasks.retry(practice.job_id)
        practice.error_code = None
        await self.session.commit()

    async def delete(self, user: User, practice_id: UUID) -> None:
        practice = await self._lock(user, practice_id)
        if await self.tasks.is_active(practice.job_id):
            await self.tasks.abort(practice.job_id)
        await self.session.delete(practice)
        await self.session.commit()

    async def _lock(
        self, user: User, practice_id: UUID, *, shared: bool = False
    ) -> PracticeSession:
        practice = await self.session.scalar(
            select(PracticeSession)
            .where(
                PracticeSession.id == practice_id, PracticeSession.user_id == user.id
            )
            .with_for_update(read=shared)
            .execution_options(populate_existing=True)
        )
        if practice is None:
            raise NotFoundError("Practice session was not found.")
        return practice
