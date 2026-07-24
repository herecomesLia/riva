import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import type { ListTrainingRecordsInput } from "@/models/training-records"
import { getTrainingRecordsOverview, listTrainingRecords } from "@/services/training-records"

import type { HistoryFiltersValue, HistoryTimeRange, HistoryViewState } from "./history-types"
import { HistoryView } from "./HistoryView"

const defaultFilters: HistoryFiltersValue = {
  kind: "all",
  targetRoleId: "all",
  timeRange: "all",
}

const pageSize = 3

export function HistoryPage() {
  const [filters, setFilters] = useState(defaultFilters)
  const [page, setPage] = useState(1)
  const [referenceTime] = useState(() => Date.now())
  const queryInput = useMemo(
    () => createListInput(filters, page, referenceTime),
    [filters, page, referenceTime],
  )
  const overviewQuery = useQuery({
    queryFn: getTrainingRecordsOverview,
    queryKey: ["training-records", "overview"],
    retry: false,
  })
  const recordsQuery = useQuery({
    queryFn: () => listTrainingRecords(queryInput),
    queryKey: ["training-records", "list", queryInput],
    retry: false,
  })

  const state = resolveViewState(
    overviewQuery.data,
    recordsQuery.data,
    overviewQuery.isFetching || recordsQuery.isFetching,
    overviewQuery.isError || recordsQuery.isError,
  )

  function handleFiltersChange(nextFilters: HistoryFiltersValue) {
    setFilters(nextFilters)
    setPage(1)
  }

  function handleRetry() {
    void Promise.all([overviewQuery.refetch(), recordsQuery.refetch()])
  }

  return (
    <HistoryView
      filters={filters}
      onClearFilters={() => handleFiltersChange(defaultFilters)}
      onFiltersChange={handleFiltersChange}
      onPageChange={setPage}
      onRetry={handleRetry}
      state={state}
    />
  )
}

function createListInput(
  filters: HistoryFiltersValue,
  page: number,
  referenceTime: number,
): ListTrainingRecordsInput {
  return {
    kinds: filters.kind === "all" ? undefined : [filters.kind],
    targetRoleId: filters.targetRoleId === "all" ? undefined : filters.targetRoleId,
    startedAtFrom: toStartedAtFrom(filters.timeRange, referenceTime),
    page,
    pageSize,
  }
}

function toStartedAtFrom(timeRange: HistoryTimeRange, referenceTime: number): string | undefined {
  if (timeRange === "all") return undefined
  const days = {
    last7Days: 7,
    last30Days: 30,
    last90Days: 90,
  }[timeRange]
  return new Date(referenceTime - days * 24 * 60 * 60 * 1000).toISOString()
}

function resolveViewState(
  overview: Awaited<ReturnType<typeof getTrainingRecordsOverview>> | undefined,
  records: Awaited<ReturnType<typeof listTrainingRecords>> | undefined,
  isFetching: boolean,
  isError: boolean,
): HistoryViewState {
  if (overview && records) {
    const data = { overview, records }
    if (overview.totalRecordCount === 0) {
      return { status: "empty", reason: "neverTrained", data }
    }
    if (records.items.length === 0) {
      return { status: "empty", reason: "noMatches", data }
    }
    return { status: "ready", data }
  }
  if (isFetching) return { status: "loading" }
  if (isError) return { status: "error" }
  return { status: "loading" }
}
