import { trainingRecordDetailsMock } from "@/mocks/data/training-records"
import { waitForMockDelay } from "@/mocks/utils"
import {
  TrainingRecordNotFoundError,
  type ListTrainingRecordsInput,
  type MockInterviewRecordDetailResponse,
  type TargetedPracticeRecordDetailResponse,
  type TrainingRecordKind,
  type TrainingRecordsOverviewResponse,
  type TrainingRecordsPageResponse,
  type TrainingRecordStatus,
  type TrainingRecordSummary,
} from "@/models/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

export type TrainingRecordsMockScenario = "default" | "empty"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let records: TrainingRecordDetail[] = copy(trainingRecordDetailsMock)

export function resetTrainingRecordsMockState(
  scenario: TrainingRecordsMockScenario = "default",
): void {
  records = scenario === "empty" ? [] : copy(trainingRecordDetailsMock)
}

function toSummary(record: TrainingRecordDetail): TrainingRecordSummary {
  const base = {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationSeconds: record.durationSeconds,
    targetRole: record.targetRole,
    answeredQuestionCount: record.answeredQuestionCount,
    totalQuestionCount: record.totalQuestionCount,
    overallScore: record.overallScore,
    reviewSummary:
      record.kind === "targetedPractice"
        ? (record.questions.find((question) => question.review)?.review?.summary ?? null)
        : (record.overallReview.content?.summary ?? null),
  }

  return record.kind === "targetedPractice"
    ? {
        ...base,
        kind: record.kind,
        questionType: record.setup.questionType,
        difficulty: record.setup.difficulty,
      }
    : {
        ...base,
        kind: record.kind,
        round: record.setup.round,
        difficulty: record.setup.difficulty,
      }
}

function averageScore(items: TrainingRecordDetail[]): number | null {
  const scores = items.flatMap((record) =>
    record.overallScore === null ? [] : [record.overallScore],
  )
  if (scores.length === 0) return null
  return Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10
}

function kindOverview(
  kind: TrainingRecordKind,
): TrainingRecordsOverviewResponse["byKind"][TrainingRecordKind] {
  const matching = records.filter((record) => record.kind === kind)
  return {
    recordCount: matching.length,
    completedRecordCount: matching.filter((record) => record.status === "completed").length,
    averageScore: averageScore(matching),
  }
}

export async function getTrainingRecordsOverview(): Promise<TrainingRecordsOverviewResponse> {
  await waitForMockDelay()

  const targetRoles = [
    ...new Map(records.map((record) => [record.targetRole.id, record.targetRole])).values(),
  ].toSorted((left, right) => left.id.localeCompare(right.id))

  return copy({
    totalRecordCount: records.length,
    completedRecordCount: records.filter((record) => record.status === "completed").length,
    totalDurationSeconds: records.reduce((total, record) => total + record.durationSeconds, 0),
    answeredQuestionCount: records.reduce(
      (total, record) => total + record.answeredQuestionCount,
      0,
    ),
    averageScore: averageScore(records),
    targetRoles,
    byKind: {
      targetedPractice: kindOverview("targetedPractice"),
      mockInterview: kindOverview("mockInterview"),
    },
  })
}

function assertPagination(input: ListTrainingRecordsInput): void {
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new Error("Training records page must be a positive integer.")
  }
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    throw new Error("Training records page size must be an integer between 1 and 100.")
  }
}

function includesKind(kinds: TrainingRecordKind[] | undefined, kind: TrainingRecordKind): boolean {
  return !kinds || kinds.length === 0 || kinds.includes(kind)
}

function includesStatus(
  statuses: TrainingRecordStatus[] | undefined,
  status: TrainingRecordStatus,
): boolean {
  return !statuses || statuses.length === 0 || statuses.includes(status)
}

export async function listTrainingRecords(
  input: ListTrainingRecordsInput,
): Promise<TrainingRecordsPageResponse> {
  assertPagination(input)
  await waitForMockDelay()

  const filtered = records
    .filter((record) => includesKind(input.kinds, record.kind))
    .filter((record) => includesStatus(input.statuses, record.status))
    .filter((record) => !input.targetRoleId || record.targetRole.id === input.targetRoleId)
    .filter((record) => !input.startedAtFrom || record.startedAt >= input.startedAtFrom)
    .filter((record) => !input.startedAtTo || record.startedAt <= input.startedAtTo)
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))

  const totalItems = filtered.length
  const offset = (input.page - 1) * input.pageSize

  return copy({
    items: filtered.slice(offset, offset + input.pageSize).map(toSummary),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  })
}

export async function getTargetedPracticeRecord(
  recordId: string,
): Promise<TargetedPracticeRecordDetailResponse> {
  await waitForMockDelay()
  const record = records.find(
    (candidate) => candidate.kind === "targetedPractice" && candidate.id === recordId,
  )
  if (!record || record.kind !== "targetedPractice") {
    throw new TrainingRecordNotFoundError("targetedPractice", recordId)
  }
  return copy(record)
}

export async function getMockInterviewRecord(
  recordId: string,
): Promise<MockInterviewRecordDetailResponse> {
  await waitForMockDelay()
  const record = records.find(
    (candidate) => candidate.kind === "mockInterview" && candidate.id === recordId,
  )
  if (!record || record.kind !== "mockInterview") {
    throw new TrainingRecordNotFoundError("mockInterview", recordId)
  }
  return copy(record)
}
