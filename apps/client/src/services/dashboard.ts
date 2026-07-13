import { env } from "@/app/env"
import { dashboardResponseMock } from "@/mocks/data/dashboard"
import { waitForMockDelay } from "@/mocks/utils"
import type { DashboardResponse } from "@/models/dashboard"

async function getDashboardDataWithMock(): Promise<DashboardResponse> {
  await waitForMockDelay()
  return structuredClone(dashboardResponseMock)
}

async function getDashboardDataWithReal(): Promise<DashboardResponse> {
  throw new Error("Real dashboard data is not implemented.")
}

export async function getDashboardData(): Promise<DashboardResponse> {
  return env.mock ? getDashboardDataWithMock() : getDashboardDataWithReal()
}
