import { env } from "@/app/env"
import * as dashboardMockService from "@/mocks/services/dashboard"
import type { DashboardResponse } from "@/models/dashboard"

async function getDashboardDataWithReal(): Promise<DashboardResponse> {
  throw new Error("Real dashboard data is not implemented.")
}

export async function getDashboardData(): Promise<DashboardResponse> {
  return env.mock ? dashboardMockService.getDashboardData() : getDashboardDataWithReal()
}
