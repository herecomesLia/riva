import { CheckCircle2Icon, Clock3Icon, HistoryIcon, StarIcon, type LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { TrainingRecordsOverviewResponse } from "@/models/training-records"
import type { Loadable } from "@/types"

const metrics = [
  { key: "records", icon: HistoryIcon },
  { key: "completed", icon: CheckCircle2Icon },
  { key: "duration", icon: Clock3Icon },
  { key: "averageScore", icon: StarIcon },
] as const satisfies Array<{
  key: "records" | "completed" | "duration" | "averageScore"
  icon: LucideIcon
}>

export function HistoryOverview({ state }: { state: Loadable<TrainingRecordsOverviewResponse> }) {
  const { t } = useTranslation()

  return (
    <section aria-label={t("history.overview.title")}>
      <div className="grid gap-4 @sm/app:grid-cols-2 @4xl/app:grid-cols-4">
        {metrics.map(({ icon: Icon, key }) => (
          <Card key={key} size="sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{t(`history.overview.metrics.${key}`)}</CardTitle>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {state.status === "loading" ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="font-heading text-2xl font-semibold tracking-tight">
                  {formatMetric(key, state.data, t)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function formatMetric(
  key: (typeof metrics)[number]["key"],
  overview: TrainingRecordsOverviewResponse,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (key === "records") {
    return t("history.overview.values.records", { count: overview.totalRecordCount })
  }
  if (key === "completed") {
    return t("history.overview.values.records", { count: overview.completedRecordCount })
  }
  if (key === "averageScore") {
    return overview.averageScore === null
      ? t("history.overview.values.noScore")
      : t("history.overview.values.score", { score: overview.averageScore })
  }

  const minutes = Math.round(overview.totalDurationSeconds / 60)
  return minutes >= 60
    ? t("history.overview.values.hours", { count: Math.round((minutes / 60) * 10) / 10 })
    : t("history.overview.values.minutes", { count: minutes })
}
