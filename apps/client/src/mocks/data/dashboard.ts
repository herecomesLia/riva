import type {
  DashboardMetric,
  DashboardPerformanceTrend,
  DashboardWeakness,
} from "@/services/dashboard"

export const dashboardPerformanceTrend: DashboardPerformanceTrend = {
  targetedPractice: [
    { date: "2026-07-02", score: 6.4 },
    { date: "2026-07-02", score: 6.8 },
    { date: "2026-07-02", score: 7.1 },
    { date: "2026-07-04", score: 6.9 },
    { date: "2026-07-04", score: 7.4 },
    { date: "2026-07-06", score: 7.6 },
    { date: "2026-07-07", score: 7.2 },
    { date: "2026-07-08", score: 7.8 },
    { date: "2026-07-09", score: 7.5 },
    { date: "2026-07-11", score: 8.1 },
  ],
  mockInterview: [
    { date: "2026-07-01", score: 6.5 },
    { date: "2026-07-02", score: 6.7 },
    { date: "2026-07-02", score: 7.3 },
    { date: "2026-07-03", score: 7.0 },
    { date: "2026-07-05", score: 6.9 },
    { date: "2026-07-05", score: 7.4 },
    { date: "2026-07-07", score: 7.1 },
    { date: "2026-07-08", score: 7.7 },
    { date: "2026-07-10", score: 7.2 },
    { date: "2026-07-11", score: 7.4 },
  ],
}

function getRecentPerformanceScores(type: keyof DashboardPerformanceTrend) {
  const scores = dashboardPerformanceTrend[type]
  const latestScore = scores[scores.length - 1]
  const previousScore = scores[scores.length - 2]

  return {
    currentValue: latestScore.score,
    previousValue: previousScore.score,
  }
}

const targetedPracticeScores = getRecentPerformanceScores("targetedPractice")
const mockInterviewScores = getRecentPerformanceScores("mockInterview")

export const dashboardMetrics: DashboardMetric[] = [
  {
    comparisonKey: "dashboard.metrics.roleFit.comparison",
    currentValue: 76,
    icon: "roleFit",
    previousValue: 65.8,
    titleKey: "dashboard.metrics.roleFit.title",
    valueKey: "dashboard.metrics.values.percentage",
    valueFormat: "percentage",
  },
  {
    comparisonKey: "dashboard.metrics.practiceTime.comparison",
    currentValue: 45,
    icon: "practiceTime",
    previousValue: 49,
    titleKey: "dashboard.metrics.practiceTime.title",
    valueKey: "dashboard.metrics.values.duration",
    valueFormat: "duration",
  },
  {
    comparisonKey: "dashboard.metrics.targetedPractice.comparison",
    icon: "targetedPractice",
    titleKey: "dashboard.metrics.targetedPractice.title",
    valueKey: "dashboard.metrics.values.score",
    valueFormat: "score",
    ...targetedPracticeScores,
  },
  {
    comparisonKey: "dashboard.metrics.mockInterview.comparison",
    icon: "mockInterview",
    titleKey: "dashboard.metrics.mockInterview.title",
    valueKey: "dashboard.metrics.values.score",
    valueFormat: "score",
    ...mockInterviewScores,
  },
]

export const dashboardWeaknesses: DashboardWeakness[] = [
  {
    descriptionKey: "dashboard.weaknesses.items.projectExpression.description",
    practiceCountKey: "dashboard.weaknesses.items.projectExpression.count",
    titleKey: "dashboard.weaknesses.items.projectExpression.title",
  },
  {
    descriptionKey: "dashboard.weaknesses.items.quantifiedResults.description",
    practiceCountKey: "dashboard.weaknesses.items.quantifiedResults.count",
    titleKey: "dashboard.weaknesses.items.quantifiedResults.title",
  },
  {
    descriptionKey: "dashboard.weaknesses.items.pressureResponse.description",
    practiceCountKey: "dashboard.weaknesses.items.pressureResponse.count",
    titleKey: "dashboard.weaknesses.items.pressureResponse.title",
  },
]
