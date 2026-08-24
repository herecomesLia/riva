from typing import Annotated

from pydantic import Field

from riva.agents.training.planning_types import TrainingPlanningOutput
from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel, StandardUUID


class StartTrainingPlanningRequest(APIModel):
    request_id: StandardUUID
    target_role_id: StandardUUID


class EnsureCurrentTrainingPlanningRequest(APIModel):
    target_role_id: StandardUUID


class TrainingPlanningResponse(APIModel):
    target_role_id: StandardUUID
    interaction_language: InteractionLanguage
    plan: Annotated[TrainingPlanningOutput, Field(discriminator="action")]
