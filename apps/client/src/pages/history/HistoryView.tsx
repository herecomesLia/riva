import { AlertCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex max-w-3xl flex-col gap-2.5">
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
          {t("history.title")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">{t("history.description")}</p>
      </header>

      {state.status === "error" ? (
        <HistoryError onRetry={onRetry} />
      ) : (
        <>
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
          />
        </>
      )}
    </div>
  )
}

function HistoryError({ onRetry }: { onRetry: () => void }) {
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
        <Button onClick={onRetry}>{t("common.pageState.error.retry")}</Button>
      </CardFooter>
    </Card>
  )
}
