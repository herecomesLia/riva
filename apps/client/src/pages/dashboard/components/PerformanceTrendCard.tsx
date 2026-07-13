import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { DashboardPerformanceRecord, DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

const performanceChart = {
  height: 184,
  padding: { bottom: 28, left: 28, right: 12, top: 12 },
  width: 440,
}

const visiblePerformanceDateIndexes = new Set([0, 2, 5, 7, 9])

const performanceTooltip = {
  height: 80,
  offset: 12,
  width: 144,
}

type PerformanceChartPoint = DashboardPerformanceRecord & {
  x: number
  y: number
}

type PerformanceTooltipPosition = {
  left: number
  top: number
}

type PerformanceTrendCardProps = {
  state: Loadable<DashboardResponse["performanceTrend"]>
}

export function PerformanceTrendCard({ state }: PerformanceTrendCardProps) {
  const { i18n, t } = useTranslation()
  const chartRef = useRef<SVGSVGElement>(null)
  const [performanceType, setPerformanceType] =
    useState<keyof DashboardResponse["performanceTrend"]>("targetedPractice")
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<PerformanceTooltipPosition | null>(null)
  const performanceTrend = state.status === "ready" ? state.data : null
  const points = performanceTrend ? performanceTrend[performanceType] : []
  const chartPoints = getPerformanceChartPoints(points)
  const linePath = getLinePath(chartPoints)
  const areaPath = getAreaPath(chartPoints)
  const isLoading = state.status === "loading"
  const hasPoints = points.length > 0
  const activePoint = activeIndex === null ? null : (chartPoints[activeIndex] ?? null)
  const summary = hasPoints
    ? {
        averageScore: points.reduce((total, point) => total + point.score, 0) / points.length,
        highestScore: Math.max(...points.map((point) => point.score)),
        practicedDays: new Set(points.map((point) => point.occurredAt.slice(0, 10))).size,
      }
    : null
  const formatScore = (score: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(score)
  const formatDate = (occurredAt: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(
      new Date(occurredAt),
    )
  const typeLabel = t(`dashboard.performanceTrend.types.${performanceType}`)

  function showTooltip(index: number) {
    const chart = chartRef.current

    if (!chart || chartPoints.length === 0) {
      return
    }

    const bounds = chart.getBoundingClientRect()
    const point = chartPoints[index]
    const chartWidth = bounds.width || performanceChart.width
    const chartHeight = bounds.height || performanceChart.height
    const pointX = (point.x / performanceChart.width) * chartWidth
    const pointY = (point.y / performanceChart.height) * chartHeight
    const canPlaceOnRight =
      pointX + performanceTooltip.offset + performanceTooltip.width <= chartWidth
    const preferredLeft = canPlaceOnRight
      ? pointX + performanceTooltip.offset
      : pointX - performanceTooltip.offset - performanceTooltip.width
    const preferredTop = pointY - performanceTooltip.height / 2

    setActiveIndex(index)
    setTooltipPosition({
      left: clamp(preferredLeft, 0, Math.max(0, chartWidth - performanceTooltip.width)),
      top: clamp(preferredTop, 0, Math.max(0, chartHeight - performanceTooltip.height)),
    })
  }

  function setActivePointFromPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const chart = chartRef.current

    if (!chart || chartPoints.length === 0) {
      return
    }

    const bounds = chart.getBoundingClientRect()
    const pointerRatio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const nextIndex = Math.round(pointerRatio * (chartPoints.length - 1))

    showTooltip(nextIndex)
  }

  function handleChartKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (chartPoints.length === 0 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return
    }

    event.preventDefault()
    const direction = event.key === "ArrowLeft" ? -1 : 1

    const startingIndex = activeIndex ?? chartPoints.length - 1
    const nextIndex = Math.min(chartPoints.length - 1, Math.max(0, startingIndex + direction))

    showTooltip(nextIndex)
  }

  function selectPerformanceType(type: keyof DashboardResponse["performanceTrend"]) {
    setPerformanceType(type)
    setActiveIndex(null)
    setTooltipPosition(null)
  }

  function hideTooltip() {
    setActiveIndex(null)
    setTooltipPosition(null)
  }

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>{t("dashboard.performanceTrend.title")}</CardTitle>
        <CardAction>
          {isLoading ? (
            <Skeleton className="h-10 w-36" />
          ) : (
            <div
              aria-label={t("dashboard.performanceTrend.switchLabel")}
              className="flex items-center rounded-xl bg-card p-1 shadow-xs ring-1 ring-border/70"
              role="group"
            >
              {(["targetedPractice", "mockInterview"] as const).map((type) => (
                <Button
                  aria-pressed={performanceType === type}
                  className={cn(
                    "h-8 rounded-lg px-2.5 text-xs font-normal transition-colors hover:bg-transparent hover:font-medium hover:text-foreground dark:hover:bg-transparent",
                    performanceType === type &&
                      "bg-muted font-medium shadow-xs hover:bg-muted dark:hover:bg-muted",
                  )}
                  key={type}
                  onClick={() => selectPerformanceType(type)}
                  size="sm"
                  variant="ghost"
                >
                  {t(`dashboard.performanceTrend.types.${type}`)}
                </Button>
              ))}
            </div>
          )}
        </CardAction>
        {isLoading ? (
          <Skeleton className="h-4 w-4/5" />
        ) : (
          <CardDescription>
            {t("dashboard.performanceTrend.description", { type: typeLabel })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent
        className={
          isLoading || summary
            ? "grid gap-6 lg:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)] lg:items-end"
            : "flex min-h-46 items-center"
        }
      >
        {isLoading ? (
          <PerformanceTrendLoadingContent />
        ) : summary ? (
          <>
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.performanceTrend.trainingDays")}
                </dt>
                <dd className="font-heading text-3xl font-semibold tracking-tight">
                  {summary.practicedDays}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {t("dashboard.performanceTrend.daysUnit")}
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.performanceTrend.highestScore")}
                </dt>
                <dd className="font-heading text-2xl font-semibold tracking-tight">
                  {t("dashboard.performanceTrend.score", {
                    score: formatScore(summary.highestScore),
                  })}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.performanceTrend.averageScore")}
                </dt>
                <dd className="font-heading text-2xl font-semibold tracking-tight">
                  {t("dashboard.performanceTrend.score", {
                    score: formatScore(summary.averageScore),
                  })}
                </dd>
              </div>
            </dl>

            <div className="relative min-w-0" onMouseLeave={hideTooltip}>
              {activePoint && tooltipPosition && (
                <div
                  className="pointer-events-none absolute z-10 flex min-h-20 w-36 flex-col rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg"
                  style={{
                    left: tooltipPosition.left,
                    top: tooltipPosition.top,
                  }}
                >
                  <p className="text-xs font-medium text-foreground">
                    {t("dashboard.performanceTrend.session", {
                      count: (activeIndex ?? 0) + 1,
                      type: typeLabel,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(activePoint.occurredAt)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {t("dashboard.performanceTrend.score", {
                      score: formatScore(activePoint.score),
                    })}
                  </p>
                </div>
              )}
              <svg
                aria-label={t("dashboard.performanceTrend.chartLabel", { type: typeLabel })}
                className="h-46 w-full overflow-visible"
                onBlur={hideTooltip}
                onFocus={() => showTooltip(chartPoints.length - 1)}
                onKeyDown={handleChartKeyDown}
                onPointerMove={setActivePointFromPointer}
                ref={chartRef}
                role="img"
                tabIndex={0}
                viewBox={`0 0 ${performanceChart.width} ${performanceChart.height}`}
              >
                <defs>
                  <linearGradient id="performance-trend-area" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      className="text-primary"
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity="0.22"
                    />
                    <stop
                      className="text-primary"
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {[0, 5, 10].map((score) => {
                  const y =
                    performanceChart.padding.top +
                    (performanceChart.height -
                      performanceChart.padding.top -
                      performanceChart.padding.bottom) *
                      (1 - score / 10)

                  return (
                    <g key={score}>
                      <line
                        className="text-border"
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                        x1={performanceChart.padding.left}
                        x2={performanceChart.width - performanceChart.padding.right}
                        y1={y}
                        y2={y}
                      />
                      <text
                        className="fill-muted-foreground text-[10px]"
                        textAnchor="end"
                        x={performanceChart.padding.left - 6}
                        y={y + 3}
                      >
                        {score}
                      </text>
                    </g>
                  )
                })}
                <path d={areaPath} fill="url(#performance-trend-area)" />
                <path
                  className="fill-none stroke-primary"
                  d={linePath}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                />
                {activePoint && (
                  <>
                    <line
                      className="text-primary/50"
                      stroke="currentColor"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                      x1={activePoint.x}
                      x2={activePoint.x}
                      y1={performanceChart.padding.top}
                      y2={performanceChart.height - performanceChart.padding.bottom}
                    />
                    <circle
                      className="fill-card stroke-primary"
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r="4"
                      strokeWidth="2"
                    />
                  </>
                )}
                {chartPoints.map((point, index) =>
                  visiblePerformanceDateIndexes.has(index) ? (
                    <text
                      className="fill-muted-foreground text-[10px]"
                      key={point.id}
                      textAnchor="middle"
                      x={point.x}
                      y={performanceChart.height - 7}
                    >
                      {formatDate(point.occurredAt)}
                    </text>
                  ) : null,
                )}
              </svg>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.performanceTrend.empty", { type: typeLabel })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PerformanceTrendLoadingContent() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
        <Skeleton className="h-12 w-20" />
        <Skeleton className="h-12 w-20" />
        <Skeleton className="h-12 w-20" />
      </div>
      <Skeleton className="h-46 w-full" />
    </>
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function getPerformanceChartPoints(points: DashboardPerformanceRecord[]): PerformanceChartPoint[] {
  const { height, padding, width } = performanceChart
  const chartHeight = height - padding.top - padding.bottom
  const chartWidth = width - padding.left - padding.right

  return points.map((point, index) => ({
    ...point,
    x: padding.left + (chartWidth * index) / Math.max(points.length - 1, 1),
    y: padding.top + chartHeight * (1 - point.score / 10),
  }))
}

function getLinePath(points: PerformanceChartPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
}

function getAreaPath(points: PerformanceChartPoint[]) {
  if (points.length === 0) {
    return ""
  }

  const baseline = performanceChart.height - performanceChart.padding.bottom
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]

  return `${getLinePath(points)} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`
}
