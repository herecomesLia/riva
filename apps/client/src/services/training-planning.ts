import { env } from "@/app/env"
import * as trainingPlanningMockService from "@/mocks/services/training-planning"
import type {
  EnsureCurrentTrainingPlanningInput,
  StartTrainingPlanningInput,
  TrainingPlanningStatusResponse,
} from "@/models/training-planning"
import { trainingPlanningStatusResponseSchema } from "@/schemas/training-planning"
import { apiRequest } from "@/services/api"

function parseStatusResponse(value: unknown): TrainingPlanningStatusResponse {
  return trainingPlanningStatusResponseSchema.parse(value) as TrainingPlanningStatusResponse
}

async function requestStatusResponse(
  path: string,
  options?: Parameters<typeof apiRequest>[1],
): Promise<TrainingPlanningStatusResponse> {
  return parseStatusResponse(await apiRequest<unknown>(path, options))
}

export async function ensureCurrentTrainingPlanning(
  input: EnsureCurrentTrainingPlanningInput,
): Promise<TrainingPlanningStatusResponse> {
  const response = env.mock
    ? await trainingPlanningMockService.ensureCurrentTrainingPlanning(input)
    : await apiRequest<unknown>("/training-plans/current", {
        json: input,
        method: "POST",
      })
  return parseStatusResponse(response)
}

export async function startTrainingPlanning(
  input: StartTrainingPlanningInput,
): Promise<TrainingPlanningStatusResponse> {
  const response = env.mock
    ? await trainingPlanningMockService.startTrainingPlanning(input)
    : await apiRequest<unknown>("/training-plans", {
        json: input,
        method: "POST",
      })
  return parseStatusResponse(response)
}

export async function getTrainingPlanningStatus(
  runId: string,
): Promise<TrainingPlanningStatusResponse> {
  if (env.mock) {
    return parseStatusResponse(await trainingPlanningMockService.getTrainingPlanningStatus(runId))
  }
  return requestStatusResponse(`/training-plans/${encodeURIComponent(runId)}`)
}
