import { env } from "@/app/env"
import type { DashboardResponse } from "@/models/dashboard"
import { dashboardResponse } from "@/mocks/data/dashboard"
import { waitForMockDelay } from "@/mocks/utils"

async function getDashboardDataWithMock(): Promise<DashboardResponse> {
  await waitForMockDelay()

  return structuredClone(dashboardResponse)
}

async function getDashboardDataWithReal(): Promise<DashboardResponse> {
  throw new Error("Real dashboard data is not implemented.")
}

export async function getDashboardData(): Promise<DashboardResponse> {
  return env.mock ? getDashboardDataWithMock() : getDashboardDataWithReal()
}
