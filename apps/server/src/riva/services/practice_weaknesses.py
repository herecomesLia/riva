from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import InteractionLanguage
from riva.models import PracticeAttempt, PracticeReview, PracticeSession, TargetRole
from riva.schemas.practice_sessions import PracticeAttemptStatus
from riva.schemas.question_cards import QuestionCardQuestionType


MAX_PRACTICE_WEAKNESS_FOCUS_ITEMS = 8


class PracticeWeaknessEvidence(BaseModel):
    """One review weakness together with the attempt that exposed it."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    weakness: str
    source_attempt_id: UUID
    source_target_role_id: UUID
    source_question_type: QuestionCardQuestionType
    reviewed_at: datetime


class PracticeWeaknessFocus(BaseModel):
    """Stable, ORM-free weakness context for a later generation snapshot."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    evidence: tuple[PracticeWeaknessEvidence, ...] = ()


@dataclass(frozen=True)
class _WeaknessCandidate:
    attempt_id: UUID
    target_role_id: UUID
    question_type: str
    reviewed_at: datetime
    exposed_weaknesses: object


class PracticeWeaknessService:
    """Derive weakness evidence from completed, reviewed practice attempts."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_focus(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        question_type: QuestionCardQuestionType,
        interaction_language: InteractionLanguage,
    ) -> PracticeWeaknessFocus:
        requested_question_type = self._question_type_value(question_type)
        candidates = await self._load_eligible_candidates(
            user_id=user_id,
            interaction_language=interaction_language,
        )
        candidates = self._sort_candidates(
            candidates,
            target_role_id=target_role_id,
            question_type=requested_question_type,
        )

        evidence: list[PracticeWeaknessEvidence] = []
        seen: set[str] = set()
        for candidate in candidates:
            for weakness in self._normalized_weaknesses(
                candidate.exposed_weaknesses
            ):
                normalized = " ".join(weakness.split()).casefold()
                if normalized in seen:
                    continue
                seen.add(normalized)
                evidence.append(
                    PracticeWeaknessEvidence(
                        weakness=weakness,
                        source_attempt_id=candidate.attempt_id,
                        source_target_role_id=candidate.target_role_id,
                        source_question_type=QuestionCardQuestionType(
                            candidate.question_type
                        ),
                        reviewed_at=candidate.reviewed_at,
                    )
                )
                if len(evidence) == MAX_PRACTICE_WEAKNESS_FOCUS_ITEMS:
                    return PracticeWeaknessFocus(evidence=tuple(evidence))

        return PracticeWeaknessFocus(evidence=tuple(evidence))

    async def has_eligible_weakness(
        self,
        *,
        user_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> bool:
        """Return whether setup can offer weakness prioritization."""

        candidates = await self._load_eligible_candidates(
            user_id=user_id,
            interaction_language=interaction_language,
        )
        return any(
            self._normalized_weaknesses(candidate.exposed_weaknesses)
            for candidate in candidates
        )

    async def _load_eligible_candidates(
        self,
        *,
        user_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> list[_WeaknessCandidate]:
        statement = (
            select(
                PracticeAttempt.id,
                PracticeSession.target_role_id,
                PracticeAttempt.question_type,
                PracticeReview.reviewed_at,
                PracticeReview.exposed_weaknesses,
            )
            .select_from(PracticeAttempt)
            .join(
                PracticeSession,
                and_(
                    PracticeSession.id == PracticeAttempt.session_id,
                    PracticeSession.user_id == PracticeAttempt.user_id,
                ),
            )
            .join(
                TargetRole,
                and_(
                    TargetRole.id == PracticeSession.target_role_id,
                    TargetRole.user_id == PracticeSession.user_id,
                ),
            )
            .join(
                PracticeReview,
                PracticeReview.attempt_id == PracticeAttempt.id,
            )
            .where(
                PracticeAttempt.user_id == user_id,
                PracticeAttempt.status == PracticeAttemptStatus.COMPLETED.value,
                PracticeAttempt.completed_at.is_not(None),
                PracticeSession.user_id == user_id,
                PracticeSession.language == interaction_language,
                TargetRole.user_id == user_id,
                TargetRole.preparation_status != "archived",
            )
            .order_by(PracticeReview.reviewed_at.desc(), PracticeAttempt.id)
        )
        result = await self.session.execute(statement)
        return [
            _WeaknessCandidate(
                attempt_id=attempt_id,
                target_role_id=source_target_role_id,
                question_type=self._question_type_value(source_question_type),
                reviewed_at=reviewed_at,
                exposed_weaknesses=exposed_weaknesses,
            )
            for (
                attempt_id,
                source_target_role_id,
                source_question_type,
                reviewed_at,
                exposed_weaknesses,
            ) in result.all()
        ]

    @staticmethod
    def _question_type_value(question_type: object) -> str:
        if isinstance(question_type, QuestionCardQuestionType):
            return question_type.value
        return str(question_type)

    @staticmethod
    def _sort_candidates(
        candidates: list[_WeaknessCandidate],
        *,
        target_role_id: UUID,
        question_type: str,
    ) -> list[_WeaknessCandidate]:
        candidates.sort(key=lambda candidate: str(candidate.attempt_id))
        candidates.sort(key=lambda candidate: candidate.reviewed_at, reverse=True)
        candidates.sort(
            key=lambda candidate: (
                2
                if candidate.target_role_id != target_role_id
                else (
                    0
                    if candidate.question_type == question_type
                    else 1
                )
            )
        )
        return candidates

    @staticmethod
    def _normalized_weaknesses(value: object) -> list[str]:
        if not isinstance(value, list | tuple):
            return []
        return [
            weakness.strip()
            for weakness in value
            if isinstance(weakness, str) and weakness.strip()
        ]


__all__ = [
    "MAX_PRACTICE_WEAKNESS_FOCUS_ITEMS",
    "PracticeWeaknessEvidence",
    "PracticeWeaknessFocus",
    "PracticeWeaknessService",
]
