import { env } from "@/app/env"
import {
  dashboardMetrics,
  dashboardPerformanceTrend,
  dashboardWeaknesses,
} from "@/mocks/data/dashboard"
import { waitForMockDelay } from "@/mocks/utils"

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

export type DashboardPerformanceTrend = Record<
  DashboardPerformanceType,
  DashboardPerformancePoint[]
>

export type DashboardWeakness = {
  descriptionKey: string
  practiceCountKey: string
  titleKey: string
}

export type DashboardData = {
  metrics: DashboardMetric[]
  performanceTrend: DashboardPerformanceTrend
  weaknesses: DashboardWeakness[]
}

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

async function getDashboardDataWithMock(): Promise<DashboardData> {
  await waitForMockDelay()

  return {
    metrics: dashboardMetrics,
    performanceTrend: dashboardPerformanceTrend,
    weaknesses: dashboardWeaknesses,
  }
}

async function getDashboardDataWithReal(): Promise<DashboardData> {
  throw new Error("Real dashboard data is not implemented.")
}

export async function getDashboardData(): Promise<DashboardData> {
  return env.mock ? getDashboardDataWithMock() : getDashboardDataWithReal()
}
