export type DashboardMetricChangeDirection = "up" | "down" | "unchanged"

export type DashboardMetricChange = {
  direction: DashboardMetricChangeDirection
  percentage: number
}

export function calculatePercentageChange(
  currentValue: number | null,
  previousValue: number | null,
): DashboardMetricChange | null {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null
  }

  const percentage = ((currentValue - previousValue) / previousValue) * 100

  return {
    direction: percentage > 0 ? "up" : percentage < 0 ? "down" : "unchanged",
    percentage: Math.abs(percentage),
  }
}
