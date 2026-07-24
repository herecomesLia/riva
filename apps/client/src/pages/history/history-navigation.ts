import type { HistoryFiltersValue, HistoryKindFilter, HistoryTimeRange } from "./history-types"

const historyKinds: HistoryKindFilter[] = ["all", "targetedPractice", "mockInterview"]
const historyTimeRanges: HistoryTimeRange[] = ["all", "last7Days", "last30Days", "last90Days"]
export const defaultHistorySearch = {
  kind: "all",
  targetRoleId: "all",
  timeRange: "all",
  page: 1,
} satisfies HistoryRouteSearch

export type HistoryRouteSearch = HistoryFiltersValue & {
  page: number
}

export function parseHistorySearch(search: Record<string, unknown>): HistoryRouteSearch {
  return {
    kind: includes(historyKinds, search.kind) ? search.kind : defaultHistorySearch.kind,
    targetRoleId: nonEmptyString(search.targetRoleId) ?? defaultHistorySearch.targetRoleId,
    timeRange: includes(historyTimeRanges, search.timeRange)
      ? search.timeRange
      : defaultHistorySearch.timeRange,
    page: positiveInteger(search.page) ?? defaultHistorySearch.page,
  }
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value
  return typeof number === "number" && Number.isInteger(number) && number > 0 ? number : undefined
}
