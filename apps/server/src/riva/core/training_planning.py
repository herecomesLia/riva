import json
from dataclasses import dataclass
from hashlib import sha256
from typing import TYPE_CHECKING

from fastapi import Depends, Request
from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.agent_execution import get_agent_executor
from riva.db import get_db_session
from riva.schemas.training_planning import (
    TrainingPlanningInput,
    TrainingPlanningMockInterviewOutput,
    TrainingPlanningOutput,
    TrainingPlanningTargetedPracticeOutput,
)

if TYPE_CHECKING:
    from riva.services.training_planning import TrainingPlanningService


@dataclass(frozen=True, slots=True)
class TrainingPlanningContractViolation:
    location: str
    error_type: str


class TrainingPlanningOutputContractError(ValueError):
    def __init__(
        self,
        violations: tuple[TrainingPlanningContractViolation, ...],
    ) -> None:
        self.violations = violations
        super().__init__("training planning output violates its constraints")


def validate_training_planning_output_contract(
    input: TrainingPlanningInput,
    output: object,
) -> TrainingPlanningOutput:
    validated = TypeAdapter(TrainingPlanningOutput).validate_python(output)
    violations: list[TrainingPlanningContractViolation] = []

    if isinstance(validated, TrainingPlanningTargetedPracticeOutput):
        constraints = input.constraints.targeted_practice
        if constraints is None:
            violations.append(
                TrainingPlanningContractViolation(
                    "action",
                    "training_planning_targeted_practice_unavailable",
                )
            )
        else:
            if validated.question_type not in constraints.question_types:
                violations.append(
                    TrainingPlanningContractViolation(
                        "question_type",
                        "training_planning_question_type_not_allowed",
                    )
                )
            if validated.difficulty not in constraints.difficulties:
                violations.append(
                    TrainingPlanningContractViolation(
                        "difficulty",
                        "training_planning_difficulty_not_allowed",
                    )
                )
            if (
                validated.prioritize_weaknesses
                and not constraints.can_prioritize_weaknesses
            ):
                violations.append(
                    TrainingPlanningContractViolation(
                        "prioritize_weaknesses",
                        "training_planning_weakness_prioritization_not_allowed",
                    )
                )
    elif isinstance(validated, TrainingPlanningMockInterviewOutput):
        constraints = input.constraints.mock_interview
        if constraints is None:
            violations.append(
                TrainingPlanningContractViolation(
                    "action",
                    "training_planning_mock_interview_unavailable",
                )
            )
        else:
            if validated.round not in constraints.rounds:
                violations.append(
                    TrainingPlanningContractViolation(
                        "round",
                        "training_planning_round_not_allowed",
                    )
                )
            if validated.difficulty not in constraints.difficulties:
                violations.append(
                    TrainingPlanningContractViolation(
                        "difficulty",
                        "training_planning_difficulty_not_allowed",
                    )
                )
            if validated.duration_minutes not in constraints.duration_minutes:
                violations.append(
                    TrainingPlanningContractViolation(
                        "duration_minutes",
                        "training_planning_duration_not_allowed",
                    )
                )

    if violations:
        raise TrainingPlanningOutputContractError(tuple(violations))
    return validated


def serialize_training_planning_input(input: TrainingPlanningInput) -> str:
    return json.dumps(
        input.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def training_planning_context_fingerprint(input: TrainingPlanningInput) -> str:
    return sha256(serialize_training_planning_input(input).encode("utf-8")).hexdigest()


async def get_training_planning_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> "TrainingPlanningService":
    from riva.services.training_planning import TrainingPlanningService

    settings = request.app.state.settings
    return TrainingPlanningService(
        session,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        agent_executor=get_agent_executor(request),
    )


__all__ = [
    "TrainingPlanningContractViolation",
    "TrainingPlanningOutputContractError",
    "get_training_planning_service",
    "serialize_training_planning_input",
    "training_planning_context_fingerprint",
    "validate_training_planning_output_contract",
]
