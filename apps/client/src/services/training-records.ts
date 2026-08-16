import { env } from "@/app/env"
import * as trainingRecordsMockService from "@/mocks/services/training-records"
import { TrainingRecordNotFoundError } from "@/models/training-records"
import type {
  ListTrainingRecordsInput,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
  TrainingRecordReferenceAnswerGenerationResponse,
  TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"
import {
  targetedPracticeTrainingRecordDetailResponseSchema,
  trainingRecordsOverviewResponseSchema,
  trainingRecordsPageResponseSchema,
} from "@/schemas/training-records"
import { apiRequest, ApiError } from "@/services/api"
import {
  adaptTargetedPracticeRecord,
  adaptTrainingRecordsOverview,
  adaptTrainingRecordsPage,
} from "@/services/training-records-adapter"

async function realApiUnavailable(): Promise<never> {
  throw new Error("Real training records API is not implemented.")
}

export async function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  if (env.mock) return trainingRecordsMockService.getTrainingRecordsOverview()

  const wire = trainingRecordsOverviewResponseSchema.parse(
    await apiRequest<unknown>("/training-records/overview", { method: "GET" }),
  )
  return adaptTrainingRecordsOverview(wire)
}

export async function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  if (env.mock) return trainingRecordsMockService.listTrainingRecords(input)

  const query = new URLSearchParams()
  for (const kind of input.kinds ?? []) query.append("kinds", kind)
  for (const status of input.statuses ?? []) query.append("statuses", status)
  if (input.targetRoleId !== undefined) query.set("targetRoleId", input.targetRoleId)
  if (input.startedAtFrom !== undefined) query.set("startedAtFrom", input.startedAtFrom)
  if (input.startedAtTo !== undefined) query.set("startedAtTo", input.startedAtTo)
  query.set("page", String(input.page))
  query.set("pageSize", String(input.pageSize))

  const wire = trainingRecordsPageResponseSchema.parse(
    await apiRequest<unknown>(`/training-records?${query.toString()}`, { method: "GET" }),
  )
  return adaptTrainingRecordsPage(wire)
}

export async function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  if (env.mock) return trainingRecordsMockService.getTargetedPracticeRecord(recordId)

  try {
    const wire = targetedPracticeTrainingRecordDetailResponseSchema.parse(
      await apiRequest<unknown>(`/training-records/practice/${encodeURIComponent(recordId)}`),
    )
    return adaptTargetedPracticeRecord(wire)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new TrainingRecordNotFoundError("targetedPractice", recordId)
    }
    throw error
  }
}

export async function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  return env.mock
    ? trainingRecordsMockService.getMockInterviewRecord(recordId)
    : realApiUnavailable()
}

export async function requestTrainingRecordReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  return env.mock
    ? trainingRecordsMockService.requestTrainingRecordReferenceAnswer(target)
    : realApiUnavailable()
}

export async function getTrainingRecordReferenceAnswerGenerationStatus(
  target: TrainingRecordReferenceAnswerTarget,
): Promise<TrainingRecordReferenceAnswerGenerationResponse> {
  return env.mock
    ? trainingRecordsMockService.getTrainingRecordReferenceAnswerGenerationStatus(target)
    : realApiUnavailable()
}
