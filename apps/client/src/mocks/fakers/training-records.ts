import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import type {
  ListTrainingRecordsInput,
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordKind,
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
  records: TrainingRecordDetail[],
  kind: TrainingRecordKind,
): TrainingRecordsOverviewResponse["byKind"][TrainingRecordKind] {
  const matching = records.filter((record) => record.kind === kind)
  return {
    recordCount: matching.length,
    completedRecordCount: matching.filter((record) => record.status === "completed").length,
    averageScore: averageScore(matching),
  }
}

export function createTrainingRecordsFaker() {
  const records: TrainingRecordDetail[] = structuredClone([
    trainingRecordsFixture.practice,
    trainingRecordsFixture.interview,
  ])

  return {
    overview(): TrainingRecordsOverviewResponse {
      return structuredClone({
        totalRecordCount: records.length,
        completedRecordCount: records.filter((record) => record.status === "completed").length,
        totalDurationSeconds: records.reduce((total, record) => total + record.durationSeconds, 0),
        answeredQuestionCount: records.reduce(
          (total, record) => total + record.answeredQuestionCount,
          0,
        ),
        averageScore: averageScore(records),
        targetRoles: records
          .map((record) => record.targetRole)
          .filter((role, index, roles) => roles.findIndex((item) => item.id === role.id) === index)
          .toSorted((a, b) => a.id.localeCompare(b.id)),
        byKind: {
          targetedPractice: kindOverview(records, "targetedPractice"),
          mockInterview: kindOverview(records, "mockInterview"),
        },
      })
    },

    list(input: ListTrainingRecordsInput): TrainingRecordsPageResponse {
      const filtered = records
        .filter((record) => !input.kinds?.length || input.kinds.includes(record.kind))
        .filter((record) => !input.statuses?.length || input.statuses.includes(record.status))
        .filter((record) => !input.targetRoleId || record.targetRole.id === input.targetRoleId)
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
