import { trainingRecordDetailsMock } from "@/mocks/data/training-records"
import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
} from "@/models/training-records"

export type TrainingRecordDetail =
  TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export type TrainingRecordsRepositoryScenario = "default" | "empty"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let records: TrainingRecordDetail[] = copy(trainingRecordDetailsMock)

export function listTrainingRecordSnapshots(): TrainingRecordDetail[] {
  return copy(records)
}

export function getTrainingRecordSnapshot(recordId: string): TrainingRecordDetail | null {
  const record = records.find((candidate) => candidate.id === recordId)
  return record === undefined ? null : copy(record)
}

export function saveTrainingRecordSnapshot(record: TrainingRecordDetail): void {
  const snapshot = copy(record)
  if (records.some((candidate) => candidate.id === snapshot.id)) return
  records = [...records, snapshot]
}

export function resetTrainingRecordsRepository(
  scenario: TrainingRecordsRepositoryScenario = "default",
): void {
  records = scenario === "empty" ? [] : copy(trainingRecordDetailsMock)
}
