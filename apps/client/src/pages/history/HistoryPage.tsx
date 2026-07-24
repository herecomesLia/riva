import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useMemo, useRef } from "react"

import type { ListTrainingRecordsInput } from "@/models/training-records"
import { getTrainingRecordsOverview, listTrainingRecords } from "@/services/training-records"

import { trainingRecordCacheTime, trainingRecordQueryKeys } from "./history-query-keys"
import { parseHistorySearch, type HistoryRouteSearch } from "./history-navigation"
import type { HistoryFiltersValue, HistoryTimeRange, HistoryViewState } from "./history-types"
import { HistoryView } from "./HistoryView"

const pageSize = 3

export function HistoryPage() {
  const navigate = useNavigate()
  const search = parseHistorySearch(useSearch({ strict: false }))
  const retryLock = useRef(false)
  const filters = useMemo(
    () => ({
      kind: search.kind,
      targetRoleId: search.targetRoleId,
      timeRange: search.timeRange,
    }),
    [search.kind, search.targetRoleId, search.timeRange],
  )
  const queryInput = useMemo(
    () => createListInput(filters, search.page, Date.now()),
    [filters, search.page],
  )
  const overviewQuery = useQuery({
    queryFn: getTrainingRecordsOverview,
    queryKey: trainingRecordQueryKeys.overview(),
    retry: false,
    staleTime: trainingRecordCacheTime,
  })
  const recordsQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listTrainingRecords(queryInput),
    queryKey: trainingRecordQueryKeys.list(search),
    retry: false,
    staleTime: trainingRecordCacheTime,
  })

  const state = resolveViewState(
    overviewQuery.data,
    recordsQuery.data,
    overviewQuery.isFetching || recordsQuery.isFetching,
    overviewQuery.isError || recordsQuery.isError,
  )

  function setSearch(nextSearch: HistoryRouteSearch) {
    void navigate({ search: nextSearch, to: "/history" })
  }

  function handleFiltersChange(nextFilters: HistoryFiltersValue) {
    setSearch({ ...nextFilters, page: 1 })
  }

  async function handleRetry() {
    if (retryLock.current || overviewQuery.isFetching || recordsQuery.isFetching) return
    retryLock.current = true
    try {
      await Promise.all([overviewQuery.refetch(), recordsQuery.refetch()])
    } finally {
      retryLock.current = false
    }
  }

  return (
    <HistoryView
      filters={filters}
      onClearFilters={() =>
        setSearch({ kind: "all", targetRoleId: "all", timeRange: "all", page: 1 })
      }
      onFiltersChange={handleFiltersChange}
      onPageChange={(page) => setSearch({ ...filters, page })}
      onRetry={() => void handleRetry()}
      search={search}
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
  if (isError) return { status: "error", isRetrying: isFetching }
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
  return { status: "loading" }
}
