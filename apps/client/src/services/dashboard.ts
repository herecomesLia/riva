import { env } from "@/app/env"
import { getPageStateScenario, type PageStateScenario } from "@/mocks/page-state"
import { waitForMockDelay } from "@/mocks/utils"

export type PageViewState = "loading" | "empty" | "error" | "success"

export type DashboardRoute = "/profile" | "/roles" | "/practice" | "/interview" | "/history"

export type DashboardMetricIcon = "roleFit" | "practiceTime" | "targetedPractice" | "mockInterview"

export type DashboardMetricChangeDirection = "up" | "down" | "unchanged"

export type DashboardMetricChange = {
  direction: DashboardMetricChangeDirection
  percentage: number
}

export type DashboardMetricValueFormat = "percentage" | "duration" | "score"

export type DashboardMetric = {
  comparisonKey: string
  currentValue: number
  icon: DashboardMetricIcon
  previousValue: number | null
  titleKey: string
  valueKey: string
  valueFormat: DashboardMetricValueFormat
}

export type DashboardPerformanceType = "targetedPractice" | "mockInterview"

export type DashboardPerformancePoint = {
  date: string
  score: number
}

export type DashboardPerformanceTrend = Record<DashboardPerformanceType, DashboardPerformancePoint[]>

export type DashboardWeakness = {
  descriptionKey: string
  practiceCountKey: string
  titleKey: string
}

export type DashboardActivity = {
  descriptionKey: string
  scoreKey: string
  titleKey: string
}

export type DashboardPageState = {
  activities: DashboardActivity[]
  metrics: DashboardMetric[]
  performanceTrend: DashboardPerformanceTrend
  scenario: PageStateScenario
  state: PageViewState
  weaknesses: DashboardWeakness[]
}

const dashboardDelayMs = 240

const dashboardMetrics: DashboardMetric[] = [
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
    currentValue: 7.2,
    icon: "targetedPractice",
    previousValue: 7.2,
    titleKey: "dashboard.metrics.targetedPractice.title",
    valueKey: "dashboard.metrics.values.score",
    valueFormat: "score",
  },
  {
    comparisonKey: "dashboard.metrics.mockInterview.comparison",
    currentValue: 7.4,
    icon: "mockInterview",
    previousValue: 6.9,
    titleKey: "dashboard.metrics.mockInterview.title",
    valueKey: "dashboard.metrics.values.score",
    valueFormat: "score",
  },
]

export function calculatePercentageChange(
  currentValue: number,
  previousValue: number | null,
): DashboardMetricChange | null {
  if (previousValue === null || previousValue === 0) {
    return null
  }

  const percentage = ((currentValue - previousValue) / previousValue) * 100

  return {
    direction: percentage > 0 ? "up" : percentage < 0 ? "down" : "unchanged",
    percentage: Math.abs(percentage),
  }
}

const dashboardPerformanceTrend: DashboardPerformanceTrend = {
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

const dashboardWeaknesses: DashboardWeakness[] = [
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

const dashboardActivities: DashboardActivity[] = [
  {
    descriptionKey: "dashboard.activity.items.project.description",
    scoreKey: "dashboard.activity.items.project.score",
    titleKey: "dashboard.activity.items.project.title",
  },
  {
    descriptionKey: "dashboard.activity.items.behavioral.description",
    scoreKey: "dashboard.activity.items.behavioral.score",
    titleKey: "dashboard.activity.items.behavioral.title",
  },
  {
    descriptionKey: "dashboard.activity.items.mockInterview.description",
    scoreKey: "dashboard.activity.items.mockInterview.score",
    titleKey: "dashboard.activity.items.mockInterview.title",
  },
]

function resolvePageState(scenario: PageStateScenario): PageViewState {
  if (scenario === "loading" || scenario === "submitting") {
    return "loading"
  }

  if (scenario === "empty" || scenario === "firstTime" || scenario === "incomplete") {
    return "empty"
  }

  if (scenario === "error" || scenario === "submitError") {
    return "error"
  }

  return "success"
}

async function getDashboardPageStateWithMock(): Promise<DashboardPageState> {
  const scenario = getPageStateScenario("dashboard")

  await waitForMockDelay(dashboardDelayMs)

  return {
    activities: dashboardActivities,
    metrics: dashboardMetrics,
    performanceTrend: dashboardPerformanceTrend,
    scenario,
    state: resolvePageState(scenario),
    weaknesses: dashboardWeaknesses,
  }
}

async function getDashboardPageStateWithReal(): Promise<DashboardPageState> {
  throw new Error("Real dashboard page state is not implemented.")
}

export async function getDashboardPageState(): Promise<DashboardPageState> {
  return env.mock ? getDashboardPageStateWithMock() : getDashboardPageStateWithReal()
}
