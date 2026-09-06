import { describe, expect, it } from "vitest"

import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import type { TargetedPracticeRecordDetailResponse } from "@/models/training-records"

import { deriveDashboardTrainingData } from "./dashboard-training"

describe("deriveDashboardTrainingData", () => {
  it("derives raw /100 scores, deterministic periods, trends, weaknesses, and next action", () => {
    const dashboard = deriveDashboardTrainingData(
      structuredClone([trainingRecordsFixture.practice, trainingRecordsFixture.interview]),
    )

    expect(dashboard.metrics).toEqual({
      targetedPracticeScore: { currentValue: 84, previousValue: null },
      mockInterviewScore: { currentValue: 82, previousValue: null },
      practiceTimeMinutes: { currentValue: 40, previousValue: null },
    })
    expect(dashboard.performanceTrend.targetedPractice.map(({ score }) => score)).toEqual([84])
    expect(dashboard.performanceTrend.mockInterview.map(({ score }) => score)).toEqual([82])
    expect(dashboard.weaknesses).toMatchObject([
      { description: "结果证据", recommendedPracticeCount: 2 },
    ])
    expect(dashboard.recommendation).toMatchObject({
      sourceRecordId: "training-practice",
      targetRoleId: "11111111-1111-4111-8111-111111111111",
      recommendation: { action: "mockInterview" },
    })
  })

  it("returns real empty training state without demo values", () => {
    expect(deriveDashboardTrainingData([])).toEqual({
      recommendation: null,
      metrics: {
        practiceTimeMinutes: { currentValue: null, previousValue: null },
        targetedPracticeScore: { currentValue: null, previousValue: null },
        mockInterviewScore: { currentValue: null, previousValue: null },
      },
      performanceTrend: { targetedPractice: [], mockInterview: [] },
      weaknesses: [],
    })
  })

  it("keeps one-kind, unscored, early-ended records meaningful", () => {
    const record = structuredClone<TargetedPracticeRecordDetailResponse>(
      trainingRecordsFixture.practice,
    )
    record.status = "endedEarly"
    record.overallScore = null
    record.durationSeconds = 120
    record.endedAt = "2026-07-18T08:00:00.000Z"
    record.recommendation = null
    record.exposedWeaknesses = []
    const dashboard = deriveDashboardTrainingData([record])

    expect(dashboard.metrics.targetedPracticeScore).toEqual({
      currentValue: null,
      previousValue: null,
    })
    expect(dashboard.metrics.mockInterviewScore).toEqual({
      currentValue: null,
      previousValue: null,
    })
    expect(dashboard.metrics.practiceTimeMinutes).toEqual({
      currentValue: null,
      previousValue: 2,
    })
    expect(dashboard.performanceTrend).toEqual({
      targetedPractice: [],
      mockInterview: [],
    })
    expect(dashboard.weaknesses).toEqual([])
  })
})
