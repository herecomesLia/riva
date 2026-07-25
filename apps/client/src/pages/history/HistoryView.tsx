import { AlertCircleIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import { HistoryFilters } from "./components/HistoryFilters"
import { HistoryOverview } from "./components/HistoryOverview"
import { HistoryRecordList } from "./components/HistoryRecordList"
import type { HistoryFiltersValue, HistoryViewState } from "./history-types"

export function HistoryView({
  filters,
  onClearFilters,
  onFiltersChange,
  onPageChange,
  onRetry,
  state,
}: {
  filters: HistoryFiltersValue
  onClearFilters: () => void
  onFiltersChange: (filters: HistoryFiltersValue) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  state: HistoryViewState
}) {
  const { t } = useTranslation()
  const stateRegionRef = useRef<HTMLDivElement>(null)
  const stateKey = state.status
  const previousStateKey = useRef(stateKey)

  useEffect(() => {
    if (previousStateKey.current === stateKey) return
    previousStateKey.current = stateKey
    stateRegionRef.current?.focus({ preventScroll: true })
  }, [stateKey])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex max-w-3xl flex-col gap-2.5">
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
          {t("history.title")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">{t("history.description")}</p>
      </header>

      <div
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="history-state-region"
        ref={stateRegionRef}
        tabIndex={-1}
      >
        {state.status === "error" ? (
          <HistoryError isRetrying={state.isRetrying} onRetry={onRetry} />
        ) : (
          <div className="flex flex-col gap-6">
            <HistoryOverview
              state={
                state.status === "loading"
                  ? { status: "loading" }
                  : { status: "ready", data: state.data.overview }
              }
            />
            <HistoryFilters
              filters={filters}
              loading={state.status === "loading"}
              onChange={onFiltersChange}
              targetRoles={state.status === "loading" ? [] : state.data.overview.targetRoles}
            />
            <HistoryRecordList
              emptyReason={state.status === "empty" ? state.reason : undefined}
              loading={state.status === "loading"}
              onClearFilters={onClearFilters}
              onPageChange={onPageChange}
              page={state.status === "loading" ? null : state.data.records}
              search={{
                ...filters,
                page: state.status === "loading" ? 1 : state.data.records.pagination.page,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryError({ isRetrying, onRetry }: { isRetrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon aria-hidden="true" />
          {t("history.error.title")}
        </CardTitle>
        <CardDescription>{t("history.error.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {t("common.pageState.error.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}
