import type { DashboardResponse } from "@/models/dashboard"

export const dashboardResponse: DashboardResponse = {
  currentRole: {
    id: "role_frontend_engineer_bytedance",
    title: "Frontend Engineer",
    company: "ByteDance",
    recruitmentType: "experienced",
    location: "Shanghai",
    experienceYears: {
      min: 3,
      max: 5,
    },
    profileCompleted: true,
    jobDescriptionAdded: false,
  },
  recommendation: {
    id: "recommendation_project_challenge_solution",
    title: "Retry: A project challenge and solution",
    description:
      "Your recent answer explained the context clearly, but the trade-offs and measurable results can be more specific.",
    questionType: "projectExperience",
    estimatedMinutes: 8,
  },
  metrics: {
    roleFit: {
      currentValue: 76,
      previousValue: 65.8,
    },
    practiceTimeMinutes: {
      currentValue: 45,
      previousValue: 49,
    },
    targetedPracticeScore: {
      currentValue: 8.1,
      previousValue: 7.5,
    },
    mockInterviewScore: {
      currentValue: 7.4,
      previousValue: 7.2,
    },
  },
  performanceTrend: {
    targetedPractice: [
      { id: "targeted-practice-001", occurredAt: "2026-07-02T09:00:00.000Z", score: 6.4 },
      { id: "targeted-practice-002", occurredAt: "2026-07-02T13:00:00.000Z", score: 6.8 },
      { id: "targeted-practice-003", occurredAt: "2026-07-02T16:00:00.000Z", score: 7.1 },
      { id: "targeted-practice-004", occurredAt: "2026-07-04T09:00:00.000Z", score: 6.9 },
      { id: "targeted-practice-005", occurredAt: "2026-07-04T15:00:00.000Z", score: 7.4 },
      { id: "targeted-practice-006", occurredAt: "2026-07-06T10:00:00.000Z", score: 7.6 },
      { id: "targeted-practice-007", occurredAt: "2026-07-07T14:00:00.000Z", score: 7.2 },
      { id: "targeted-practice-008", occurredAt: "2026-07-08T11:00:00.000Z", score: 7.8 },
      { id: "targeted-practice-009", occurredAt: "2026-07-09T15:00:00.000Z", score: 7.5 },
      { id: "targeted-practice-010", occurredAt: "2026-07-11T09:00:00.000Z", score: 8.1 },
    ],
    mockInterview: [
      { id: "mock-interview-001", occurredAt: "2026-07-01T10:00:00.000Z", score: 6.5 },
      { id: "mock-interview-002", occurredAt: "2026-07-02T10:00:00.000Z", score: 6.7 },
      { id: "mock-interview-003", occurredAt: "2026-07-02T16:00:00.000Z", score: 7.3 },
      { id: "mock-interview-004", occurredAt: "2026-07-03T11:00:00.000Z", score: 7 },
      { id: "mock-interview-005", occurredAt: "2026-07-05T09:00:00.000Z", score: 6.9 },
      { id: "mock-interview-006", occurredAt: "2026-07-05T14:00:00.000Z", score: 7.4 },
      { id: "mock-interview-007", occurredAt: "2026-07-07T10:00:00.000Z", score: 7.1 },
      { id: "mock-interview-008", occurredAt: "2026-07-08T14:00:00.000Z", score: 7.7 },
      { id: "mock-interview-009", occurredAt: "2026-07-10T09:00:00.000Z", score: 7.2 },
      { id: "mock-interview-010", occurredAt: "2026-07-11T13:00:00.000Z", score: 7.4 },
    ],
  },
  weaknesses: [
    {
      id: "weakness-project-expression",
      category: "projectExpression",
      description: "Make the structure and key trade-offs clearer.",
      recommendedPracticeCount: 2,
    },
    {
      id: "weakness-quantified-results",
      category: "quantifiedResults",
      description: "Add verifiable business impact and personal contribution.",
      recommendedPracticeCount: 2,
    },
    {
      id: "weakness-pressure-response",
      category: "pressureResponse",
      description: "Explain your actions, collaboration, and reflection more completely.",
      recommendedPracticeCount: 1,
    },
  ],
}
