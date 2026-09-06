import {
  completedTargetedPracticeHistoryStoryFixture,
  partialTargetedPracticeHistoryStoryFixture,
} from "./targeted-practice-history-story-fixtures"
import { completeMockInterviewHistoryStoryFixture } from "./mock-interview-history-story-fixtures"
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
  targetRoles: structuredClone([
    completedTargetedPracticeHistoryStoryFixture.targetRole,
    completeMockInterviewHistoryStoryFixture.targetRole,
  ]),
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
  items: [
    completedTargetedPracticeHistoryStoryFixture,
    partialTargetedPracticeHistoryStoryFixture,
    completeMockInterviewHistoryStoryFixture,
  ].map(toSummary),
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
