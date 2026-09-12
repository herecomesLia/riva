import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import type {
  ListTrainingRecordsInput,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordReferenceAnswer,
  TrainingRecordReferenceAnswerTarget,
  TrainingRecordsOverviewResponse,
  TrainingRecordsPageResponse,
  TrainingRecordSummary,
} from "@/models/training-records"

type TrainingRecordDetail = TargetedPracticeRecordDetailResponse | MockInterviewRecordDetailResponse

function toSummary(record: TrainingRecordDetail): TrainingRecordSummary {
  const base = {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationSeconds: record.durationSeconds,
    role: record.role,
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

export function createTrainingRecordsFaker() {
  const records: TrainingRecordDetail[] = structuredClone([
    trainingRecordsFixture.practice,
    trainingRecordsFixture.interview,
  ])

  return {
    overview(): TrainingRecordsOverviewResponse {
      return structuredClone(trainingRecordsFixture.overview)
    },

    list(input: ListTrainingRecordsInput): TrainingRecordsPageResponse {
      const filtered = records
        .filter((record) => !input.kinds?.length || input.kinds.includes(record.kind))
        .filter((record) => !input.statuses?.length || input.statuses.includes(record.status))
        .filter((record) => !input.roleId || record.role.id === input.roleId)
        .filter((record) => !input.startedAtFrom || record.startedAt >= input.startedAtFrom)
        .filter((record) => !input.startedAtTo || record.startedAt <= input.startedAtTo)
        .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
      const offset = (input.page - 1) * input.pageSize
      return structuredClone({
        items: filtered.slice(offset, offset + input.pageSize).map(toSummary),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalItems: filtered.length,
          totalPages: Math.ceil(filtered.length / input.pageSize),
        },
      })
    },

    practice(recordId: string): TargetedPracticeRecordDetailResponse | null {
      const record = records.find((record) => record.id === recordId)
      return record?.kind === "targetedPractice" ? structuredClone(record) : null
    },

    interview(recordId: string): MockInterviewRecordDetailResponse | null {
      const record = records.find((record) => record.id === recordId)
      return record?.kind === "mockInterview" ? structuredClone(record) : null
    },

    reference(target: TrainingRecordReferenceAnswerTarget): TrainingRecordReferenceAnswer | null {
      const record = records.find(
        (record) => record.id === target.recordId && record.kind === target.kind,
      )
      const question = record?.questions.find((question) => question.id === target.questionId)
      const subject =
        target.subject === "mainQuestion"
          ? question
          : question?.followUps.find((followUp) => followUp.id === target.followUpId)
      if (!subject) return null
      subject.referenceAnswer = structuredClone(trainingRecordsFixture.reference)
      return structuredClone(subject.referenceAnswer)
    },
  }
}

export const trainingRecordsFaker = createTrainingRecordsFaker()
