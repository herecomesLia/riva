import { trainingRecordDetailsMock } from "@/mocks/data/training-records"
import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
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
    targetRole: structuredClone(record.targetRole),
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

export const historyOverviewStoryFixture: TrainingRecordsOverviewResponse = {
  totalRecordCount: 6,
  completedRecordCount: 2,
  totalDurationSeconds: 4110,
  answeredQuestionCount: 6,
  averageScore: 78,
  targetRoles: [
    {
      id: "role_frontend_engineer_bytedance",
      title: "高级前端工程师",
      company: "星云科技",
    },
    {
      id: "role_product_manager_fintech",
      title: "金融科技产品经理",
      company: "远航金融",
    },
  ],
  byKind: {
    targetedPractice: {
      recordCount: 3,
      completedRecordCount: 1,
      averageScore: 77,
    },
    mockInterview: {
      recordCount: 3,
      completedRecordCount: 1,
      averageScore: 80,
    },
  },
}

export const historyRecordsStoryFixture: TrainingRecordsPageResponse = {
  items: trainingRecordDetailsMock
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 3)
    .map(toSummary),
  pagination: {
    page: 1,
    pageSize: 3,
    totalItems: 6,
    totalPages: 2,
  },
}

export const emptyHistoryOverviewStoryFixture: TrainingRecordsOverviewResponse = {
  totalRecordCount: 0,
  completedRecordCount: 0,
  totalDurationSeconds: 0,
  answeredQuestionCount: 0,
  averageScore: null,
  targetRoles: [],
  byKind: {
    targetedPractice: {
      recordCount: 0,
      completedRecordCount: 0,
      averageScore: null,
    },
    mockInterview: {
      recordCount: 0,
      completedRecordCount: 0,
      averageScore: null,
    },
  },
}

export const emptyHistoryRecordsStoryFixture: TrainingRecordsPageResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 3,
    totalItems: 0,
    totalPages: 0,
  },
}
