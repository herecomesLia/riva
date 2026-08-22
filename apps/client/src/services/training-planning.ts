import { env } from "@/app/env"
import * as trainingPlanningMockService from "@/mocks/services/training-planning"
import type {
  EnsureCurrentTrainingPlanningInput,
  StartTrainingPlanningInput,
  TrainingPlanningResponse,
} from "@/models/training-planning"
import { trainingPlanningResponseSchema } from "@/schemas/training-planning"
import { apiRequest } from "@/services/api"

function parseResponse(value: unknown): TrainingPlanningResponse {
  return trainingPlanningResponseSchema.parse(value) as TrainingPlanningResponse
}

export async function ensureCurrentTrainingPlanning(
  input: EnsureCurrentTrainingPlanningInput,
): Promise<TrainingPlanningResponse> {
  const response = env.mock
    ? await trainingPlanningMockService.ensureCurrentTrainingPlanning(input)
    : await apiRequest<unknown>("/training-plans/current", {
        json: input,
        method: "POST",
      })
  return parseResponse(response)
}

export async function startTrainingPlanning(
  input: StartTrainingPlanningInput,
): Promise<TrainingPlanningResponse> {
  const response = env.mock
    ? await trainingPlanningMockService.startTrainingPlanning(input)
    : await apiRequest<unknown>("/training-plans", {
        json: input,
        method: "POST",
      })
  return parseResponse(response)
}
