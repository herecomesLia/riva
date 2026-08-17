from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import (
    CompetencyEvidence,
    InterviewReview,
    InterviewSession,
    InterviewTurnAssessment,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeReview,
    PracticeSession,
)
from riva.services.competencies import CompetencyService
from riva.services.competency_catalog import (
    competency_key_for_dimension,
    display_name_for_competency_key,
)


class CompetencyIngestionService:
    """Write existing training artifacts as competency evidence.

    Every public method deliberately participates in the caller's transaction;
    transaction ownership stays with the source-artifact service.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.competency_service = CompetencyService(session)

    async def ingest_practice_evaluation(
        self,
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
    ) -> list[CompetencyEvidence]:
        self._validate_practice_context(user_id, practice_session, attempt)
        details = self._practice_details(evaluation, attempt)
        evidence: list[CompetencyEvidence] = []

        evidence.append(
            await self._add(
                user_id=user_id,
                competency_key="answer_quality",
                source_type="practice",
                source_session_id=practice_session.id,
                source_entity_type="practiceAttempt",
                source_entity_id=attempt.id,
                signal_type="score",
                occurred_at=evaluation.evaluated_at,
                score=evaluation.overall_score,
                details=details,
            )
        )

        for raw_dimension in evaluation.dimension_scores:
            dimension = self._mapping(raw_dimension, "dimension score")
            raw_value = self._required_value(dimension, "dimension")
            key = competency_key_for_dimension(raw_value)
            explanation = self._required_text(dimension, "explanation")
            dimension_details = {
                **details,
                "dimension": self._json_value(raw_value),
                "explanation": explanation,
            }
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key=key,
                    source_type="practice",
                    source_session_id=practice_session.id,
                    source_entity_type="practiceAttempt",
                    source_entity_id=attempt.id,
                    signal_type="score",
                    occurred_at=evaluation.evaluated_at,
                    score=self._required_int(dimension, "score"),
                    details=dimension_details,
                )
            )
        return evidence

    async def ingest_practice_review(
        self,
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        review: PracticeReview,
    ) -> list[CompetencyEvidence]:
        self._validate_practice_context(user_id, practice_session, attempt)
        highlights = self._string_items(review.highlights, "highlights")
        main_issues = self._string_items(review.main_issues, "main_issues")
        exposed_weaknesses = self._string_items(
            review.exposed_weaknesses,
            "exposed_weaknesses",
        )
        evidence: list[CompetencyEvidence] = []
        base_details = {"reviewId": str(review.id)}

        if highlights:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="practice",
                    source_session_id=practice_session.id,
                    source_entity_type="practiceAttempt",
                    source_entity_id=attempt.id,
                    signal_type="strength",
                    occurred_at=review.reviewed_at,
                    evidence_text=self._joined(highlights),
                    details={**base_details, "items": list(review.highlights)},
                )
            )
        if exposed_weaknesses:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="practice",
                    source_session_id=practice_session.id,
                    source_entity_type="practiceAttempt",
                    source_entity_id=attempt.id,
                    signal_type="weakness",
                    occurred_at=review.reviewed_at,
                    evidence_text=self._joined(exposed_weaknesses),
                    details={
                        **base_details,
                        "items": list(review.exposed_weaknesses),
                        "mainIssues": list(review.main_issues),
                    },
                )
            )
        return evidence

    async def ingest_interview_turn(
        self,
        user_id: UUID,
        interview_session: InterviewSession,
        assessment: InterviewTurnAssessment,
    ) -> list[CompetencyEvidence]:
        self._validate_interview_context(user_id, interview_session, assessment)
        strengths = self._string_items(assessment.strengths, "strengths")
        issues = self._string_items(assessment.issues, "issues")
        base_details = {
            "assessmentId": str(assessment.id),
            "questionId": str(assessment.question_id),
            "decision": assessment.decision,
            "strengths": list(assessment.strengths),
            "issues": list(assessment.issues),
        }
        evidence: list[CompetencyEvidence] = [
            await self._add(
                user_id=user_id,
                competency_key="answer_quality",
                source_type="interview",
                source_session_id=interview_session.id,
                source_entity_type="interviewTurn",
                source_entity_id=assessment.id,
                signal_type="score",
                occurred_at=assessment.created_at,
                score=assessment.score,
                details=base_details,
            )
        ]
        if strengths:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="interview",
                    source_session_id=interview_session.id,
                    source_entity_type="interviewTurn",
                    source_entity_id=assessment.id,
                    signal_type="strength",
                    occurred_at=assessment.created_at,
                    evidence_text=self._joined(strengths),
                    details={**base_details, "items": list(assessment.strengths)},
                )
            )
        if issues:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="interview",
                    source_session_id=interview_session.id,
                    source_entity_type="interviewTurn",
                    source_entity_id=assessment.id,
                    signal_type="weakness",
                    occurred_at=assessment.created_at,
                    evidence_text=self._joined(issues),
                    details={**base_details, "items": list(assessment.issues)},
                )
            )
        return evidence

    async def ingest_interview_review(
        self,
        user_id: UUID,
        interview_session: InterviewSession,
        review: InterviewReview,
    ) -> list[CompetencyEvidence]:
        self._validate_review_context(user_id, interview_session, review)
        status = review.status
        if status == "unavailable":
            return []
        if status not in {"partial", "complete"}:
            raise ValueError("interview review status is invalid")
        payload = self._mapping(review.review, "interview review")
        base_details = {
            "reviewId": str(review.id),
            "reviewStatus": status,
        }
        evidence: list[CompetencyEvidence] = []

        overall_score = payload.get("overallScore")
        if status == "complete" and overall_score is not None:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="interview",
                    source_session_id=interview_session.id,
                    source_entity_type="interviewReview",
                    source_entity_id=review.id,
                    signal_type="score",
                    occurred_at=review.created_at,
                    score=self._as_int(overall_score, "overallScore"),
                    details=base_details,
                )
            )

        if status == "complete":
            raw_dimensions = payload.get("dimensionScores")
            if raw_dimensions is not None:
                if not isinstance(raw_dimensions, list):
                    raise ValueError("dimensionScores must be a list")
                for raw_dimension in raw_dimensions:
                    dimension = self._mapping(
                        raw_dimension,
                        "interview review dimension score",
                    )
                    raw_value = self._required_value(dimension, "dimension")
                    key = competency_key_for_dimension(raw_value)
                    explanation = self._required_text(dimension, "explanation")
                    evidence.append(
                        await self._add(
                            user_id=user_id,
                            competency_key=key,
                            source_type="interview",
                            source_session_id=interview_session.id,
                            source_entity_type="interviewReview",
                            source_entity_id=review.id,
                            signal_type="score",
                            occurred_at=review.created_at,
                            score=self._required_int(dimension, "score"),
                            details={
                                **base_details,
                                "dimension": self._json_value(raw_value),
                                "explanation": explanation,
                            },
                        )
                    )

        strengths = self._payload_string_items(payload, "mainStrengths")
        weaknesses = self._payload_string_items(payload, "exposedWeaknesses")
        frequent_issues = self._payload_string_items(payload, "frequentIssues")
        risk_points = self._payload_string_items(payload, "riskPoints")
        if strengths:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="interview",
                    source_session_id=interview_session.id,
                    source_entity_type="interviewReview",
                    source_entity_id=review.id,
                    signal_type="strength",
                    occurred_at=review.created_at,
                    evidence_text=self._joined(strengths),
                    details={
                        **base_details,
                        "items": list(payload.get("mainStrengths", [])),
                    },
                )
            )
        if weaknesses:
            evidence.append(
                await self._add(
                    user_id=user_id,
                    competency_key="answer_quality",
                    source_type="interview",
                    source_session_id=interview_session.id,
                    source_entity_type="interviewReview",
                    source_entity_id=review.id,
                    signal_type="weakness",
                    occurred_at=review.created_at,
                    evidence_text=self._joined(weaknesses),
                    details={
                        **base_details,
                        "items": list(payload.get("exposedWeaknesses", [])),
                        "frequentIssues": list(payload.get("frequentIssues", [])),
                        "riskPoints": list(payload.get("riskPoints", [])),
                    },
                )
            )
        return evidence

    async def _add(
        self,
        *,
        user_id: UUID,
        competency_key: str,
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
        competency = (
            await self.competency_service.get_or_create_competency_in_transaction(
                user_id=user_id,
                competency_key=competency_key,
                display_name=display_name_for_competency_key(competency_key),
            )
        )
        return await self.competency_service.add_evidence_in_transaction(
            user_id=user_id,
            competency_id=competency.id,
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

    @staticmethod
    def _validate_practice_context(
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
    ) -> None:
        if (
            practice_session.user_id != user_id
            or attempt.user_id != user_id
            or attempt.session_id != practice_session.id
        ):
            raise ValueError("practice artifact does not belong to user/session")

    @staticmethod
    def _validate_interview_context(
        user_id: UUID,
        interview_session: InterviewSession,
        assessment: InterviewTurnAssessment,
    ) -> None:
        if (
            interview_session.user_id != user_id
            or assessment.session_id != interview_session.id
        ):
            raise ValueError("interview assessment does not belong to user/session")

    @staticmethod
    def _validate_review_context(
        user_id: UUID,
        interview_session: InterviewSession,
        review: InterviewReview,
    ) -> None:
        if (
            interview_session.user_id != user_id
            or review.session_id != interview_session.id
        ):
            raise ValueError("interview review does not belong to user/session")

    @staticmethod
    def _practice_details(
        evaluation: PracticeEvaluation,
        attempt: PracticeAttempt,
    ) -> dict[str, object]:
        return {
            "evaluationId": str(evaluation.id),
            "questionType": attempt.question_type,
            "difficulty": attempt.difficulty,
        }

    @staticmethod
    def _mapping(value: object, label: str) -> Mapping[str, object]:
        if not isinstance(value, Mapping):
            raise ValueError(f"{label} must be an object")
        return value

    @staticmethod
    def _required_value(value: Mapping[str, object], field: str) -> object:
        if field not in value:
            raise ValueError(f"{field} is required")
        return value[field]

    @classmethod
    def _required_text(cls, value: Mapping[str, object], field: str) -> str:
        raw = cls._required_value(value, field)
        if not isinstance(raw, str) or not raw.strip():
            raise ValueError(f"{field} must be non-empty")
        return raw.strip()

    @classmethod
    def _required_int(cls, value: Mapping[str, object], field: str) -> int:
        return cls._as_int(cls._required_value(value, field), field)

    @staticmethod
    def _as_int(value: object, field: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"{field} must be an integer")
        return value

    @staticmethod
    def _json_value(value: object) -> object:
        if hasattr(value, "value"):
            return getattr(value, "value")
        return value

    @staticmethod
    def _string_items(value: object, field: str) -> list[str]:
        if not isinstance(value, list):
            raise ValueError(f"{field} must be a list")
        for item in value:
            if not isinstance(item, str):
                raise ValueError(f"{field} items must be strings")
        return [item for item in value if item.strip()]

    @classmethod
    def _payload_string_items(
        cls,
        payload: Mapping[str, object],
        field: str,
    ) -> list[str]:
        value = payload.get(field, [])
        return cls._string_items(value, field)

    @staticmethod
    def _joined(items: list[str]) -> str:
        return "\n".join(item.strip() for item in items if item.strip())


__all__ = ["CompetencyIngestionService"]
