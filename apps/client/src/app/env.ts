import { isDashboardMockScenario, type DashboardMockScenario } from "@/mocks/data/dashboard"

function readDashboardMockScenario(value: string | undefined): DashboardMockScenario {
  return isDashboardMockScenario(value) ? value : "full"
}

export const env = {
  dashboardMockScenario: readDashboardMockScenario(import.meta.env.DASHBOARD_MOCK_SCENARIO),
  mock: import.meta.env.MOCK === "true",
} as const
