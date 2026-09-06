import { trainingRecordsFaker } from "@/mocks/fakers/training-records"
import {
  TrainingRecordNotFoundError,
  type ListTrainingRecordsInput,
  type MockInterviewRecordDetailResponse,
  type TargetedPracticeRecordDetailResponse,
  type TrainingRecordReferenceAnswerTarget,
} from "@/models/training-records"

export async function getTrainingRecordsOverview() {
  return trainingRecordsFaker.overview()
}

export async function listTrainingRecords(input: ListTrainingRecordsInput) {
  return trainingRecordsFaker.list(input)
}

export async function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  const record = trainingRecordsFaker.practice(recordId)
  if (record === null) throw new TrainingRecordNotFoundError("targetedPractice", recordId)
  return record
}

export async function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  const record = trainingRecordsFaker.interview(recordId)
  if (record === null) throw new TrainingRecordNotFoundError("mockInterview", recordId)
  return record
}

export async function generateTrainingRecordReferenceAnswer(
  target: TrainingRecordReferenceAnswerTarget,
) {
  const referenceAnswer = trainingRecordsFaker.reference(target)
  if (referenceAnswer === null) {
    throw new Error("Training record reference answer target was not found.")
  }
  return { target: structuredClone(target), referenceAnswer }
}
