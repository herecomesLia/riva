from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import CompetencyEvidence, UserCompetency

_MACHINE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$")
_SOURCE_ENTITY_TYPES = {
    "practice": {"practiceAttempt"},
    "interview": {"interviewTurn", "interviewReview"},
}
_SIGNAL_TYPES = {"score", "weakness", "strength"}


def normalize_competency_key(value: str) -> str:
    """Normalize and validate a stable lowercase competency machine key."""

    if not isinstance(value, str):
        raise ValueError("competency_key must be a string")

    key = value.strip().lower()
    if len(key) > 128 or _MACHINE_KEY_PATTERN.fullmatch(key) is None:
        raise ValueError("competency_key must match ^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$")
    return key


class CompetencyService:
    """Persist user competencies and their source evidence."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create_competency(
        self,
        user_id: UUID,
        competency_key: str,
        display_name: str,
    ) -> UserCompetency:
        try:
            competency = await self.get_or_create_competency_in_transaction(
                user_id=user_id,
                competency_key=competency_key,
                display_name=display_name,
            )
            await self.session.commit()
            return competency
        except Exception:
            await self.session.rollback()
            raise

    async def get_or_create_competency_in_transaction(
        self,
        user_id: UUID,
        competency_key: str,
        display_name: str,
    ) -> UserCompetency:
        """Get or create a competency without committing or rolling back."""

        key = normalize_competency_key(competency_key)
        name = self._display_name(display_name)
        competency = await self._find_competency(
            user_id=user_id,
            competency_key=key,
            for_update=True,
        )
        if competency is None:
            if not name:
                raise ValueError("display_name must be non-empty when creating")
            competency = UserCompetency(
                user_id=user_id,
                competency_key=key,
                display_name=name,
            )
            try:
                async with self.session.begin_nested():
                    self.session.add(competency)
                    await self.session.flush()
            except IntegrityError:
                competency = await self._find_competency(
                    user_id=user_id,
                    competency_key=key,
                    for_update=True,
                )
                if competency is None:
                    raise

        if name and competency.display_name != name:
            competency.display_name = name
        return competency

    async def list_competencies(self, user_id: UUID) -> list[UserCompetency]:
        result = await self.session.scalars(
            select(UserCompetency)
            .where(UserCompetency.user_id == user_id)
            .order_by(UserCompetency.created_at.asc(), UserCompetency.id.asc())
        )
        return list(result.all())

    async def add_evidence(
        self,
        *,
        user_id: UUID,
        competency_id: UUID,
        source_type: str,
        source_session_id: UUID,
        source_entity_type: str,
        source_entity_id: UUID,
        signal_type: str,
        occurred_at: datetime,
        score: int | None = None,
        evidence_text: str | None = None,
        details: Mapping[str, object] | None = None,
    ) -> CompetencyEvidence:
        try:
            evidence = await self.add_evidence_in_transaction(
                user_id=user_id,
                competency_id=competency_id,
                source_type=source_type,
                source_session_id=source_session_id,
                source_entity_type=source_entity_type,
                source_entity_id=source_entity_id,
                signal_type=signal_type,
                occurred_at=occurred_at,
                score=score,
                evidence_text=evidence_text,
                details=details,
            )
            await self.session.commit()
            return evidence
        except Exception:
            await self.session.rollback()
            raise

    async def add_evidence_in_transaction(
        self,
        *,
        user_id: UUID,
        competency_id: UUID,
        source_type: str,
        source_session_id: UUID,
        source_entity_type: str,
        source_entity_id: UUID,
        signal_type: str,
        occurred_at: datetime,
        score: int | None = None,
        evidence_text: str | None = None,
        details: Mapping[str, object] | None = None,
    ) -> CompetencyEvidence:
        """Persist evidence within the caller's transaction."""

        normalized_text = self._validate_evidence(
            source_type=source_type,
            source_entity_type=source_entity_type,
            signal_type=signal_type,
            score=score,
            evidence_text=evidence_text,
            occurred_at=occurred_at,
        )
        normalized_details = self._details(details)

        competency = await self.session.scalar(
            select(UserCompetency)
            .where(
                UserCompetency.id == competency_id,
                UserCompetency.user_id == user_id,
            )
            .with_for_update()
        )
        if competency is None:
            raise ValueError("competency does not belong to user")

        existing = await self._find_evidence(
            user_id=user_id,
            competency_id=competency_id,
            source_entity_type=source_entity_type,
            source_entity_id=source_entity_id,
            signal_type=signal_type,
            for_update=True,
        )
        if existing is not None:
            return existing

        evidence = CompetencyEvidence(
            user_id=user_id,
            competency_id=competency_id,
            source_type=source_type,
            source_session_id=source_session_id,
            source_entity_type=source_entity_type,
            source_entity_id=source_entity_id,
            signal_type=signal_type,
            score=score,
            evidence_text=normalized_text,
            details=normalized_details,
            occurred_at=occurred_at,
        )
        try:
            async with self.session.begin_nested():
                self.session.add(evidence)
                await self.session.flush()
        except IntegrityError:
            existing = await self._find_evidence(
                user_id=user_id,
                competency_id=competency_id,
                source_entity_type=source_entity_type,
                source_entity_id=source_entity_id,
                signal_type=signal_type,
                for_update=True,
            )
            if existing is None:
                raise
            return existing

        competency.evidence_count += 1
        if (
            competency.last_evidence_at is None
            or occurred_at > competency.last_evidence_at
        ):
            competency.last_evidence_at = occurred_at
        return evidence

    async def list_evidence(
        self,
        user_id: UUID,
        competency_id: UUID,
    ) -> list[CompetencyEvidence]:
        result = await self.session.scalars(
            select(CompetencyEvidence)
            .where(
                CompetencyEvidence.user_id == user_id,
                CompetencyEvidence.competency_id == competency_id,
            )
            .order_by(
                CompetencyEvidence.occurred_at.asc(),
                CompetencyEvidence.created_at.asc(),
                CompetencyEvidence.id.asc(),
            )
        )
        return list(result.all())

    async def _find_competency(
        self,
        *,
        user_id: UUID,
        competency_key: str,
        for_update: bool,
    ) -> UserCompetency | None:
        statement = select(UserCompetency).where(
            UserCompetency.user_id == user_id,
            UserCompetency.competency_key == competency_key,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _find_evidence(
        self,
        *,
        user_id: UUID,
        competency_id: UUID,
        source_entity_type: str,
        source_entity_id: UUID,
        signal_type: str,
        for_update: bool,
    ) -> CompetencyEvidence | None:
        statement = select(CompetencyEvidence).where(
            CompetencyEvidence.user_id == user_id,
            CompetencyEvidence.competency_id == competency_id,
            CompetencyEvidence.source_entity_type == source_entity_type,
            CompetencyEvidence.source_entity_id == source_entity_id,
            CompetencyEvidence.signal_type == signal_type,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    @staticmethod
    def _display_name(value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("display_name must be a string")
        return value.strip()

    @staticmethod
    def _details(details: Mapping[str, object] | None) -> dict[str, object]:
        if details is None:
            return {}
        if not isinstance(details, Mapping):
            raise ValueError("details must be a mapping")
        return dict(details)

    @staticmethod
    def _validate_evidence(
        *,
        source_type: str,
        source_entity_type: str,
        signal_type: str,
        score: int | None,
        evidence_text: str | None,
        occurred_at: datetime,
    ) -> str | None:
        if source_entity_type not in _SOURCE_ENTITY_TYPES.get(source_type, set()):
            raise ValueError(
                "source_type and source_entity_type do not describe a valid source"
            )
        if signal_type not in _SIGNAL_TYPES:
            raise ValueError("signal_type is invalid")
        if not isinstance(occurred_at, datetime):
            raise ValueError("occurred_at must be a datetime")
        if score is not None and (not isinstance(score, int) or not 0 <= score <= 100):
            raise ValueError("score must be between 0 and 100")
        if signal_type == "score" and score is None:
            raise ValueError("score signal requires score")

        normalized_text = (
            evidence_text.strip() if isinstance(evidence_text, str) else None
        )
        if signal_type in {"weakness", "strength"} and not normalized_text:
            raise ValueError(
                "weakness and strength signals require non-empty evidence_text"
            )
        return normalized_text
