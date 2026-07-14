import {
  ClipboardCheckIcon,
  Clock3Icon,
  MessagesSquareIcon,
  MinusIcon,
  TargetIcon,
  TriangleIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

type DashboardMetricKey = keyof DashboardResponse["metrics"]
type DashboardMetricFormat = "percentage" | "duration" | "score"
type DashboardMetricTrend = "up" | "down" | "unchanged"

type DashboardMetricChange = {
  direction: DashboardMetricTrend
  percentage: number
}

const metricDefinitions: Record<
  DashboardMetricKey,
  {
    comparisonKey: string
    icon: LucideIcon
    titleKey: string
    valueFormat: DashboardMetricFormat
    valueKey: string
  }
> = {
  mockInterviewScore: {
    comparisonKey: "dashboard.metrics.mockInterview.comparison",
    icon: MessagesSquareIcon,
    titleKey: "dashboard.metrics.mockInterview.title",
    valueFormat: "score",
    valueKey: "dashboard.metrics.values.score",
  },
  practiceTimeMinutes: {
    comparisonKey: "dashboard.metrics.practiceTime.comparison",
    icon: Clock3Icon,
    titleKey: "dashboard.metrics.practiceTime.title",
    valueFormat: "duration",
    valueKey: "dashboard.metrics.values.duration",
  },
  roleFit: {
    comparisonKey: "dashboard.metrics.roleFit.comparison",
    icon: TargetIcon,
    titleKey: "dashboard.metrics.roleFit.title",
    valueFormat: "percentage",
    valueKey: "dashboard.metrics.values.percentage",
  },
  targetedPracticeScore: {
    comparisonKey: "dashboard.metrics.targetedPractice.comparison",
    icon: ClipboardCheckIcon,
    titleKey: "dashboard.metrics.targetedPractice.title",
    valueFormat: "score",
    valueKey: "dashboard.metrics.values.score",
  },
}

const metricOrder: DashboardMetricKey[] = [
  "roleFit",
  "practiceTimeMinutes",
  "targetedPracticeScore",
  "mockInterviewScore",
]

const metricChangeStyles: Record<DashboardMetricTrend, string> = {
  down: "bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  unchanged: "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  up: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
}

const metricChangeIcons: Record<DashboardMetricTrend, LucideIcon> = {
  down: TriangleIcon,
  unchanged: MinusIcon,
  up: TriangleIcon,
}

const metricChangeIconClasses: Record<DashboardMetricTrend, string> = {
  down: "size-2 rotate-180 fill-current",
  unchanged: "size-3",
  up: "size-2 fill-current",
}

const metricChangeIconStrokeWidths: Record<DashboardMetricTrend, number> = {
  down: 2,
  unchanged: 5,
  up: 2,
}

type DashboardMetricsProps = {
  state: Loadable<DashboardResponse["metrics"]>
}

type MetricState = Loadable<DashboardResponse["metrics"][DashboardMetricKey]>

export function DashboardMetrics({ state }: DashboardMetricsProps) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t("dashboard.metrics.eyebrow")}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {metricOrder.map((key) => (
        <MetricCard
          key={key}
          definition={metricDefinitions[key]}
          state={getMetricState(state, key)}
        />
      ))}
    </section>
  )
}

function getMetricState(
  state: Loadable<DashboardResponse["metrics"]>,
  key: DashboardMetricKey,
): MetricState {
  return state.status === "loading"
    ? { status: "loading" }
    : { status: "ready", data: state.data[key] }
}

function MetricCard({
  definition,
  state,
}: {
  definition: (typeof metricDefinitions)[DashboardMetricKey]
  state: MetricState
}) {
  const { i18n, t } = useTranslation()
  const Icon = definition.icon
  const metric = state.status === "ready" ? state.data : null
  const comparisonValue =
    metric &&
    metric.currentValue !== null &&
    metric.previousValue !== null &&
    metric.previousValue !== 0
      ? metric.previousValue
      : null
  const change = metric ? calculatePercentageChange(metric.currentValue, comparisonValue) : null

  const formatMetricNumber = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const formatMetricValue = (valueKey: string, value: number) =>
    t(valueKey, { value: formatMetricNumber(value) })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{t(definition.titleKey)}</CardTitle>
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {state.status === "loading" ? (
          <MetricLoadingContent />
        ) : (
          <MetricDataContent
            change={change}
            comparisonValue={comparisonValue}
            definition={definition}
            formatMetricValue={formatMetricValue}
            i18nLanguage={i18n.language}
            metric={state.data}
          />
        )}
      </CardContent>
    </Card>
  )
}

function MetricLoadingContent() {
  return (
    <>
      <Skeleton className="h-9 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
    </>
  )
}

function MetricDataContent({
  change,
  comparisonValue,
  definition,
  formatMetricValue,
  i18nLanguage,
  metric,
}: {
  change: DashboardMetricChange | null
  comparisonValue: number | null
  definition: (typeof metricDefinitions)[DashboardMetricKey]
  formatMetricValue: (valueKey: string, value: number) => string
  i18nLanguage: string
  metric: DashboardResponse["metrics"][DashboardMetricKey]
}) {
  const { t } = useTranslation()
  const formatMetricNumber = (value: number) =>
    new Intl.NumberFormat(i18nLanguage, { maximumFractionDigits: 1 }).format(value)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-heading text-3xl font-semibold leading-none tracking-tight">
          {metric.currentValue === null ? (
            "--"
          ) : definition.valueFormat === "duration" ? (
            <>
              {formatMetricNumber(metric.currentValue)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {t("dashboard.metrics.values.durationUnit")}
              </span>
            </>
          ) : (
            formatMetricValue(definition.valueKey, metric.currentValue)
          )}
        </p>
        {change && <MetricChangeBadge change={change} language={i18nLanguage} />}
      </div>
      <CardDescription className="text-xs leading-5">
        {metric.currentValue === null
          ? t("dashboard.metrics.noData")
          : comparisonValue === null || change === null
            ? t("dashboard.metrics.noComparison")
            : t(definition.comparisonKey, {
                value: formatMetricValue(definition.valueKey, comparisonValue),
              })}
      </CardDescription>
    </>
  )
}

function MetricChangeBadge({
  change,
  language,
}: {
  change: DashboardMetricChange
  language: string
}) {
  const ChangeIcon = metricChangeIcons[change.direction]

  return (
    <Badge className={metricChangeStyles[change.direction]} variant="secondary">
      <span aria-hidden="true" className="flex shrink-0 items-center">
        <ChangeIcon
          className={metricChangeIconClasses[change.direction]}
          strokeWidth={metricChangeIconStrokeWidths[change.direction]}
        />
      </span>
      {new Intl.NumberFormat(language, {
        maximumFractionDigits: 1,
        minimumFractionDigits: change.percentage === 0 ? 0 : 1,
      }).format(change.percentage)}
      %
    </Badge>
  )
}

function calculatePercentageChange(
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
