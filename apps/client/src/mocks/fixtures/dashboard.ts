import type { DashboardResponse } from "@/models/dashboard"

export const dashboardFixture = {
  currentRole: null,
  recommendation: {
    id: "dashboard-recommendation",
    sourceRecordId: "training-practice",
    roleId: "11111111-1111-4111-8111-111111111111",
    recommendation: {
      action: "mockInterview",
      reason: "可以进一步在连续问答中验证表达稳定性。",
      round: "technical",
      difficulty: "pressure",
      focusAreas: ["结果证据"],
    },
    estimatedMinutes: 30,
  },
  metrics: {
    roleFit: { currentValue: null, previousValue: null },
    practiceTimeMinutes: { currentValue: 40, previousValue: null },
    targetedPracticeScore: { currentValue: 84, previousValue: null },
    mockInterviewScore: { currentValue: 82, previousValue: null },
  },
  performanceTrend: {
    targetedPractice: [
      { id: "training-practice", occurredAt: "2026-07-25T07:10:00.000Z", score: 84 },
    ],
    mockInterview: [
      { id: "training-interview", occurredAt: "2026-07-24T07:30:00.000Z", score: 82 },
    ],
  },
  weaknesses: [
    {
      id: "dashboard-weakness",
      category: "quantifiedResults",
      description: "结果证据",
      recommendedPracticeCount: 2,
    },
  ],
} satisfies DashboardResponse
