import { env } from "@/app/env"
import type { DashboardResponse } from "@/models/dashboard"
import {
  dashboardEmptyResponse,
  dashboardFullResponse,
  dashboardPartialResponse,
  type DashboardMockScenario,
} from "@/mocks/data/dashboard"
import { waitForMockDelay } from "@/mocks/utils"

let hasFailedErrorOnce = false

function createDashboardMockError() {
  return new Error("Mock dashboard request failed.")
}

function resolveDashboardResponse(scenario: DashboardMockScenario): DashboardResponse {
  if (scenario === "empty") {
    return dashboardEmptyResponse
  }

  if (scenario === "partial") {
    return dashboardPartialResponse
  }

  return dashboardFullResponse
}

async function getDashboardDataWithMock(): Promise<DashboardResponse> {
  await waitForMockDelay()

  if (env.dashboardMockScenario === "error") {
    throw createDashboardMockError()
  }

  if (env.dashboardMockScenario === "errorOnce" && !hasFailedErrorOnce) {
    hasFailedErrorOnce = true
    throw createDashboardMockError()
  }

  return structuredClone(resolveDashboardResponse(env.dashboardMockScenario))
}

async function getDashboardDataWithReal(): Promise<DashboardResponse> {
  throw new Error("Real dashboard data is not implemented.")
}

export async function getDashboardData(): Promise<DashboardResponse> {
  return env.mock ? getDashboardDataWithMock() : getDashboardDataWithReal()
}
