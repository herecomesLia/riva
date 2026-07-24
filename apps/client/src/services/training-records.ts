import { env } from "@/app/env"
import * as trainingRecordsMockService from "@/mocks/services/training-records"
import type {
  ListTrainingRecordsInput,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
} from "@/models/training-records"

function realApiUnavailable(): never {
  throw new Error("Real training records API is not implemented.")
}

export function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  return env.mock ? trainingRecordsMockService.getTrainingRecordsOverview() : realApiUnavailable()
}

export function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  return env.mock ? trainingRecordsMockService.listTrainingRecords(input) : realApiUnavailable()
}

export function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  return env.mock
    ? trainingRecordsMockService.getTargetedPracticeRecord(recordId)
    : realApiUnavailable()
}

export function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  return env.mock
    ? trainingRecordsMockService.getMockInterviewRecord(recordId)
    : realApiUnavailable()
}
