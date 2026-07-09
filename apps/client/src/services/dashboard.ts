import { env } from "@/app/env"
import { getPageStateScenario, type PageStateScenario } from "@/mocks/page-state"
import { waitForMockDelay } from "@/mocks/utils"

export type PageViewState = "loading" | "empty" | "error" | "success"

export type DashboardCardIcon = "currentRole" | "nextSession" | "recommendation"

export type DashboardCardData = {
  badgeKey: string
  descriptionKey: string
  icon: DashboardCardIcon
  titleKey: string
}

export type DashboardPageState = {
  cards: DashboardCardData[]
  scenario: PageStateScenario
  state: PageViewState
}

const dashboardDelayMs = 240

const dashboardCards: DashboardCardData[] = [
  {
    badgeKey: "dashboard.cards.currentRole.badge",
    descriptionKey: "dashboard.cards.currentRole.description",
    icon: "currentRole",
    titleKey: "dashboard.cards.currentRole.title",
  },
  {
    badgeKey: "dashboard.cards.nextSession.badge",
    descriptionKey: "dashboard.cards.nextSession.description",
    icon: "nextSession",
    titleKey: "dashboard.cards.nextSession.title",
  },
  {
    badgeKey: "dashboard.cards.recommendation.badge",
    descriptionKey: "dashboard.cards.recommendation.description",
    icon: "recommendation",
    titleKey: "dashboard.cards.recommendation.title",
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
    cards: dashboardCards,
    scenario,
    state: resolvePageState(scenario),
  }
}

async function getDashboardPageStateWithReal(): Promise<DashboardPageState> {
  throw new Error("Real dashboard page state is not implemented.")
}

export async function getDashboardPageState(): Promise<DashboardPageState> {
  return env.mock ? getDashboardPageStateWithMock() : getDashboardPageStateWithReal()
}
