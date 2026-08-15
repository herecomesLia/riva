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
import { targetedPracticeTrainingRecordDetailResponseSchema } from "@/schemas/training-records"
import { apiRequest, ApiError } from "@/services/api"
import { adaptTargetedPracticeRecord } from "@/services/training-records-adapter"

async function realApiUnavailable(): Promise<never> {
  throw new Error("Real training records API is not implemented.")
}

export async function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  return env.mock ? trainingRecordsMockService.getTrainingRecordsOverview() : realApiUnavailable()
}

export async function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  return env.mock ? trainingRecordsMockService.listTrainingRecords(input) : realApiUnavailable()
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
