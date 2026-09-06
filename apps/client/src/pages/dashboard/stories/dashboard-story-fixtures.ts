import type { DashboardResponse } from "@/models/dashboard"

export const dashboardStoryFixture: DashboardResponse = {
  currentRole: {
    id: "role_frontend_bytedance",
    title: "Frontend Engineer",
    company: "ByteDance",
    recruitmentType: "experienced",
    location: "Shanghai",
    profileCompleted: true,
    jobDescriptionAdded: false,
  },
  recommendation: {
    id: "dashboard-recommendation-targeted-practice-record-001",
    sourceRecordId: "targeted-practice-record-001",
    targetRoleId: "role_frontend_bytedance",
    recommendation: {
      action: "mockInterview",
      reason: "单题结构已经稳定，可以在连续问答中验证临场表达。",
      round: "technical",
      difficulty: "pressure",
      focusAreas: ["方案取舍", "跨团队协作"],
    },
    estimatedMinutes: 30,
  },
  metrics: {
    roleFit: {
      currentValue: 76,
      previousValue: null,
    },
    practiceTimeMinutes: { currentValue: 15, previousValue: 40 },
    targetedPracticeScore: { currentValue: 86, previousValue: 68 },
    mockInterviewScore: { currentValue: 80, previousValue: null },
  },
  performanceTrend: {
    targetedPractice: [
      { id: "targeted-practice-record-002", occurredAt: "2026-07-18T08:08:00.000Z", score: 68 },
      { id: "targeted-practice-record-001", occurredAt: "2026-07-20T02:15:00.000Z", score: 86 },
    ],
    mockInterview: [
      { id: "mock-interview-record-001", occurredAt: "2026-07-16T03:30:00.000Z", score: 80 },
    ],
  },
  weaknesses: [
    {
      id: "dashboard-weakness-targeted-practice-record-001-1",
      category: "projectExpression",
      description: "复杂方案的取舍说明不够充分",
      recommendedPracticeCount: 1,
    },
  ],
} satisfies DashboardResponse
