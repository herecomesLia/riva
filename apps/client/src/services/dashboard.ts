import { env } from "@/app/env"
import * as dashboardMockService from "@/mocks/services/dashboard"
import type { DashboardResponse } from "@/models/dashboard"
import { dashboardResponseSchema } from "@/schemas/dashboard"
import { apiRequest } from "@/services/api"

async function getDashboardDataWithReal(): Promise<DashboardResponse> {
  return dashboardResponseSchema.parse(await apiRequest<unknown>("/dashboard")) as DashboardResponse
}

export async function getDashboardData(): Promise<DashboardResponse> {
  return env.mock ? dashboardMockService.getDashboardData() : getDashboardDataWithReal()
}
