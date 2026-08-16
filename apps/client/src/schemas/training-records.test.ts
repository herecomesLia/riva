import { describe, expect, it } from "vitest"

import {
  targetedPracticeTrainingRecordSummarySchema,
  trainingRecordsOverviewResponseSchema,
  trainingRecordsPageResponseSchema,
} from "./training-records"

const recordId = "11111111-1111-4111-8111-111111111111"
const roleId = "22222222-2222-4222-8222-222222222222"
const timestamp = "2026-08-15T08:00:00Z"

function summary() {
  return {
    recordId,
    kind: "targetedPractice" as const,
    language: "en" as const,
    status: "completed" as const,
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 600,
    targetRole: { id: roleId, title: "Backend Engineer", company: "Riva" },
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 86,
    reviewSummary: "Strong ownership evidence.",
    questionType: "behavioral" as const,
    difficulty: "basic" as const,
  }
}

function page() {
  return {
    items: [summary()],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    },
  }
}

function overview() {
  const kind = {
    recordCount: 1,
    completedRecordCount: 1,
    averageScore: 86,
  }
  return {
    totalRecordCount: 1,
    completedRecordCount: 1,
    totalDurationSeconds: 600,
    answeredQuestionCount: 1,
    averageScore: 86,
    targetRoles: [{ id: roleId, title: "Backend Engineer", company: "Riva" }],
    byKind: {
      targetedPractice: kind,
      mockInterview: { recordCount: 0, completedRecordCount: 0, averageScore: null },
    },
  }
}

describe("training record wire schemas", () => {
  it("parses a valid targeted practice page", () => {
    expect(trainingRecordsPageResponseSchema.parse(page())).toEqual(page())
  })

  it("parses a valid overview with both kind entries", () => {
    expect(trainingRecordsOverviewResponseSchema.parse(overview())).toEqual(overview())
    expect(Object.keys(overview().byKind)).toEqual(["targetedPractice", "mockInterview"])
  })

  it("rejects invalid UUIDs", () => {
    expect(() =>
      targetedPracticeTrainingRecordSummarySchema.parse({
        ...summary(),
        recordId: "not-a-uuid",
      }),
    ).toThrow()
  })

  it("rejects datetimes without an offset", () => {
    expect(() =>
      targetedPracticeTrainingRecordSummarySchema.parse({
        ...summary(),
        startedAt: "2026-08-15T08:00:00",
      }),
    ).toThrow()
  })

  it("rejects negative counts and durations", () => {
    expect(() =>
      trainingRecordsPageResponseSchema.parse({
        ...page(),
        items: [{ ...summary(), answeredQuestionCount: -1 }],
      }),
    ).toThrow()
    expect(() =>
      trainingRecordsPageResponseSchema.parse({
        ...page(),
        items: [{ ...summary(), durationSeconds: -1 }],
      }),
    ).toThrow()
  })

  it("rejects scores above 100", () => {
    expect(() =>
      trainingRecordsOverviewResponseSchema.parse({
        ...overview(),
        averageScore: 101,
      }),
    ).toThrow()
  })

  it("rejects unknown fields from strict objects", () => {
    expect(() =>
      trainingRecordsPageResponseSchema.parse({
        ...page(),
        unexpected: true,
      }),
    ).toThrow()
  })

  it("rejects a summary with the wrong kind", () => {
    expect(() =>
      targetedPracticeTrainingRecordSummarySchema.parse({
        ...summary(),
        kind: "mockInterview",
      }),
    ).toThrow()
  })
})
