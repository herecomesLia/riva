import { describe, expect, it } from "vitest"

import { trainingRecordDetailsMock } from "@/mocks/data/training-records"

import { deriveDashboardTrainingData } from "./dashboard-training"

describe("deriveDashboardTrainingData", () => {
  it("derives raw /100 scores, deterministic periods, trends, weaknesses, and next action", () => {
    const dashboard = deriveDashboardTrainingData(structuredClone(trainingRecordDetailsMock))

    expect(dashboard.metrics).toEqual({
      targetedPracticeScore: { currentValue: 86, previousValue: 68 },
      mockInterviewScore: { currentValue: 80, previousValue: null },
      practiceTimeMinutes: { currentValue: 15, previousValue: 40 },
    })
    expect(dashboard.performanceTrend.targetedPractice.map(({ score }) => score)).toEqual([68, 86])
    expect(dashboard.performanceTrend.mockInterview.map(({ score }) => score)).toEqual([80])
    expect(dashboard.weaknesses.map(({ description }) => description)).toEqual([
      "复杂方案的取舍说明不够充分",
    ])
    expect(dashboard.recommendation).toMatchObject({
      sourceRecordId: "targeted-practice-record-001",
      targetRoleId: "role_frontend_bytedance",
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
    const record = structuredClone(trainingRecordDetailsMock[2]!)
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
