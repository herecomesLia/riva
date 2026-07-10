import { env } from "@/app/env"
import { getPageStateScenario, type PageStateScenario } from "@/mocks/page-state"
import { waitForMockDelay } from "@/mocks/utils"

export type PageViewState = "loading" | "empty" | "error" | "success"

export type DashboardRoute = "/profile" | "/roles" | "/practice" | "/interview" | "/history"

export type DashboardMetricIcon = "roleFit" | "training" | "performance" | "weaknesses"

export type DashboardMetric = {
  descriptionKey: string
  icon: DashboardMetricIcon
  titleKey: string
  valueKey: string
}

export type DashboardReadinessStage = {
  labelKey: string
  status: "complete" | "current" | "upcoming"
}

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
  readinessStages: DashboardReadinessStage[]
  scenario: PageStateScenario
  state: PageViewState
  weaknesses: DashboardWeakness[]
}

const dashboardDelayMs = 240

const dashboardMetrics: DashboardMetric[] = [
  {
    descriptionKey: "dashboard.metrics.roleFit.description",
    icon: "roleFit",
    titleKey: "dashboard.metrics.roleFit.title",
    valueKey: "dashboard.metrics.roleFit.value",
  },
  {
    descriptionKey: "dashboard.metrics.training.description",
    icon: "training",
    titleKey: "dashboard.metrics.training.title",
    valueKey: "dashboard.metrics.training.value",
  },
  {
    descriptionKey: "dashboard.metrics.performance.description",
    icon: "performance",
    titleKey: "dashboard.metrics.performance.title",
    valueKey: "dashboard.metrics.performance.value",
  },
  {
    descriptionKey: "dashboard.metrics.weaknesses.description",
    icon: "weaknesses",
    titleKey: "dashboard.metrics.weaknesses.title",
    valueKey: "dashboard.metrics.weaknesses.value",
  },
]

const dashboardReadinessStages: DashboardReadinessStage[] = [
  { labelKey: "dashboard.readiness.stages.profile", status: "complete" },
  { labelKey: "dashboard.readiness.stages.role", status: "complete" },
  { labelKey: "dashboard.readiness.stages.practice", status: "current" },
  { labelKey: "dashboard.readiness.stages.interview", status: "upcoming" },
]

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
    readinessStages: dashboardReadinessStages,
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
