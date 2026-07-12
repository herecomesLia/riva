import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  Clock3Icon,
  ClipboardCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MapPinIcon,
  MessagesSquareIcon,
  MinusIcon,
  PlayIcon,
  SparklesIcon,
  TargetIcon,
  TriangleIcon,
  type LucideIcon,
} from "lucide-react"
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useTranslation } from "react-i18next"

import dashboardRobotDark from "@/assets/dashboard-robot-dark.png"
import dashboardRobot from "@/assets/dashboard-robot.png"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import type {
  DashboardPerformanceRecord,
  DashboardQuestionType,
  DashboardRecruitmentType,
  DashboardResponse,
  DashboardWeaknessCategory,
} from "@/models/dashboard"
import { getDashboardData } from "@/services/dashboard"

import { calculatePercentageChange, type DashboardMetricChangeDirection } from "./dashboard-utils"

type DashboardMetricKey = keyof DashboardResponse["metrics"]

type DashboardMetricDisplayFormat = "percentage" | "duration" | "score"

const metricDefinitions: Record<
  DashboardMetricKey,
  {
    comparisonKey: string
    icon: LucideIcon
    titleKey: string
    valueFormat: DashboardMetricDisplayFormat
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

const metricChangeStyles: Record<DashboardMetricChangeDirection, string> = {
  down: "bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  unchanged: "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  up: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
}

const metricChangeIcons: Record<DashboardMetricChangeDirection, LucideIcon> = {
  down: TriangleIcon,
  unchanged: MinusIcon,
  up: TriangleIcon,
}

const metricChangeIconClasses: Record<DashboardMetricChangeDirection, string> = {
  down: "size-2 rotate-180 fill-current",
  unchanged: "size-3",
  up: "size-2 fill-current",
}

const metricChangeIconStrokeWidths: Record<DashboardMetricChangeDirection, number> = {
  down: 2,
  unchanged: 5,
  up: 2,
}

const currentRoleStatusStyles = {
  complete:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300",
  incomplete:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300",
} as const

const recommendationQuestionTypeKeys: Record<DashboardQuestionType, string> = {
  projectExperience: "dashboard.recommendation.questionTypes.projectExperience",
}

const recruitmentTypeKeys: Record<DashboardRecruitmentType, string> = {
  campus: "dashboard.currentRole.recruitmentTypes.campus",
  experienced: "dashboard.currentRole.recruitmentTypes.experienced",
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const dashboardQuery = useQuery({
    queryFn: getDashboardData,
    queryKey: ["dashboard"],
  })
  const dashboardData = dashboardQuery.data

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <header className="relative flex flex-col gap-2.5 lg:pr-72">
        <div className="pointer-events-none absolute -top-5 right-50 hidden w-55 lg:block">
          <img alt="" className="w-full mix-blend-multiply dark:hidden" src={dashboardRobot} />
          <img alt="" className="hidden w-full dark:block" src={dashboardRobotDark} />
        </div>
        <div className="relative z-10 flex flex-col gap-2.5">
          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            {t("dashboard.title")}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            {t("dashboard.greeting.prefix")}
            <span className="font-semibold text-primary">{currentUser?.displayName}</span>
            {t("dashboard.greeting.suffix")}
          </p>
        </div>
      </header>

      {dashboardQuery.isPending && <DashboardLoadingState />}
      {dashboardQuery.isError && <DashboardErrorState />}
      {dashboardQuery.isSuccess && dashboardData && (
        <DashboardOverview dashboardData={dashboardData} />
      )}
    </div>
  )
}

function DashboardOverview({ dashboardData }: { dashboardData: DashboardResponse }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-12">
        <CurrentRoleCard currentRole={dashboardData.currentRole} />
        <RecommendationCard recommendation={dashboardData.recommendation} />
      </section>

      <DashboardMetrics metrics={dashboardData.metrics} />

      <section className="grid gap-4 lg:grid-cols-12">
        <PerformanceTrendCard performanceTrend={dashboardData.performanceTrend} />
        <WeaknessesCard weaknesses={dashboardData.weaknesses} />
      </section>
    </div>
  )
}

function CurrentRoleCard({ currentRole }: { currentRole: DashboardResponse["currentRole"] }) {
  const { t } = useTranslation()

  if (!currentRole) {
    return (
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle>{t("dashboard.currentRole.eyebrow")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BriefcaseBusinessIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-heading text-2xl font-medium tracking-tight">
                {t("dashboard.currentRole.empty.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.currentRole.empty.description")}
              </p>
            </div>
          </div>
          <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="link">
            {t("dashboard.currentRole.empty.action")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  const context = [
    currentRole.company,
    currentRole.recruitmentType && t(recruitmentTypeKeys[currentRole.recruitmentType]),
  ].filter(Boolean)
  const metadata = [
    currentRole.location,
    currentRole.experienceYears &&
      t("dashboard.currentRole.experienceYears", currentRole.experienceYears),
  ].filter(Boolean)

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.currentRole.eyebrow")}</CardTitle>
        <CardAction>
          <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="outline">
            {t("dashboard.currentRole.actions.adjust")}
          </Button>
        </CardAction>
        {context.length > 0 && <CardDescription>{context.join(" · ")}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BriefcaseBusinessIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-2xl font-medium tracking-tight">
              {currentRole.title}
            </p>
            {metadata.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPinIcon className="size-3.5 shrink-0" />
                {metadata.join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <RoleStatusBadge complete={currentRole.profileCompleted} type="profile" />
            <RoleStatusBadge complete={currentRole.jobDescriptionAdded} type="jobDescription" />
          </div>
          <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="link">
            {t("dashboard.currentRole.actions.addJobDescription")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RoleStatusBadge({
  complete,
  type,
}: {
  complete: boolean
  type: "profile" | "jobDescription"
}) {
  const { t } = useTranslation()
  const status = complete ? "complete" : "incomplete"
  const Icon = complete ? CircleCheckIcon : CircleAlertIcon

  return (
    <Badge className={currentRoleStatusStyles[status]} variant="outline">
      <Icon className="size-3.5" />
      {t(`dashboard.currentRole.status.${type}.${status}`)}
    </Badge>
  )
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: DashboardResponse["recommendation"]
}) {
  const { t } = useTranslation()

  if (!recommendation) {
    return (
      <Card className="lg:col-span-7">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon />
            {t("dashboard.recommendation.eyebrow")}
          </CardTitle>
          <CardDescription>{t("dashboard.recommendation.empty.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-xl font-medium">
            {t("dashboard.recommendation.empty.title")}
          </p>
        </CardContent>
        <CardFooter>
          <Button nativeButton={false} render={<Link to="/history" />} variant="outline">
            {t("dashboard.actions.viewHistory")}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon />
          {t("dashboard.recommendation.eyebrow")}
        </CardTitle>
        <CardDescription>{recommendation.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="font-heading text-xl font-medium">{recommendation.title}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {t(recommendationQuestionTypeKeys[recommendation.questionType])}
          </Badge>
          <Badge variant="outline">
            <Clock3Icon />
            {t("dashboard.recommendation.duration", {
              minutes: recommendation.estimatedMinutes,
            })}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link to="/practice" />}>
          <PlayIcon data-icon="inline-start" />
          {t("dashboard.actions.startPractice")}
        </Button>
        <Button nativeButton={false} render={<Link to="/history" />} variant="outline">
          {t("dashboard.actions.viewHistory")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function DashboardMetrics({ metrics }: { metrics: DashboardResponse["metrics"] }) {
  const { i18n, t } = useTranslation()
  const formatMetricNumber = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const formatMetricValue = (valueKey: string, value: number) =>
    t(valueKey, { value: formatMetricNumber(value) })

  return (
    <section
      aria-label={t("dashboard.metrics.eyebrow")}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {metricOrder.map((key) => {
        const metric = metrics[key]
        const definition = metricDefinitions[key]
        const Icon = definition.icon
        const change = calculatePercentageChange(metric.currentValue, metric.previousValue)
        const ChangeIcon = change ? metricChangeIcons[change.direction] : null
        const hasComparison =
          metric.currentValue !== null &&
          metric.previousValue !== null &&
          metric.previousValue !== 0

        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium">{t(definition.titleKey)}</CardTitle>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
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
                {change && ChangeIcon && (
                  <Badge className={metricChangeStyles[change.direction]} variant="secondary">
                    <span aria-hidden="true" className="flex shrink-0 items-center">
                      <ChangeIcon
                        className={metricChangeIconClasses[change.direction]}
                        strokeWidth={metricChangeIconStrokeWidths[change.direction]}
                      />
                    </span>
                    {new Intl.NumberFormat(i18n.language, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: change.percentage === 0 ? 0 : 1,
                    }).format(change.percentage)}
                    %
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs leading-5">
                {metric.currentValue === null
                  ? t("dashboard.metrics.noData")
                  : !hasComparison
                    ? t("dashboard.metrics.noComparison")
                    : t(definition.comparisonKey, {
                        value: formatMetricValue(definition.valueKey, metric.previousValue!),
                      })}
              </CardDescription>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}

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

function PerformanceTrendCard({
  performanceTrend,
}: {
  performanceTrend: DashboardResponse["performanceTrend"]
}) {
  const { i18n, t } = useTranslation()
  const chartRef = useRef<SVGSVGElement>(null)
  const [performanceType, setPerformanceType] =
    useState<keyof DashboardResponse["performanceTrend"]>("targetedPractice")
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<PerformanceTooltipPosition | null>(null)
  const points = performanceTrend[performanceType]
  const chartPoints = getPerformanceChartPoints(points)
  const linePath = getLinePath(chartPoints)
  const areaPath = getAreaPath(chartPoints)
  const hasPoints = points.length > 0
  const activePoint = activeIndex === null ? null : (chartPoints[activeIndex] ?? null)
  const practicedDays = hasPoints
    ? new Set(points.map((point) => point.occurredAt.slice(0, 10))).size
    : null
  const highestScore = hasPoints ? Math.max(...points.map((point) => point.score)) : null
  const averageScore = hasPoints
    ? points.reduce((total, point) => total + point.score, 0) / points.length
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
        </CardAction>
        <CardDescription>
          {t("dashboard.performanceTrend.description", { type: typeLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={
          hasPoints
            ? "grid gap-6 lg:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)] lg:items-end"
            : "flex min-h-46 items-center"
        }
      >
        {hasPoints ? (
          <>
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.performanceTrend.trainingDays")}
                </dt>
                <dd className="font-heading text-3xl font-semibold tracking-tight">
                  {practicedDays}
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
                  {t("dashboard.performanceTrend.score", { score: formatScore(highestScore!) })}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.performanceTrend.averageScore")}
                </dt>
                <dd className="font-heading text-2xl font-semibold tracking-tight">
                  {t("dashboard.performanceTrend.score", { score: formatScore(averageScore!) })}
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
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                        x1={performanceChart.padding.left}
                        x2={performanceChart.width - performanceChart.padding.right}
                        y1={y}
                        y2={y}
                        className="text-border"
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

const weaknessTitleKeys: Record<DashboardWeaknessCategory, string> = {
  pressureResponse: "dashboard.weaknesses.categories.pressureResponse",
  projectExpression: "dashboard.weaknesses.categories.projectExpression",
  quantifiedResults: "dashboard.weaknesses.categories.quantifiedResults",
}

function WeaknessesCard({ weaknesses }: { weaknesses: DashboardResponse["weaknesses"] }) {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.weaknesses.eyebrow")}</CardTitle>
        <CardDescription>{t("dashboard.weaknesses.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {weaknesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.weaknesses.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {weaknesses.map((weakness, index) => (
              <li className="flex flex-col gap-3" key={weakness.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{t(weaknessTitleKeys[weakness.category])}</p>
                    <p className="text-sm text-muted-foreground">{weakness.description}</p>
                  </div>
                  <Badge className="shrink-0" variant="outline">
                    {t("dashboard.weaknesses.recommendedPracticeCount", {
                      count: weakness.recommendedPracticeCount,
                    })}
                  </Badge>
                </div>
                {index < weaknesses.length - 1 && <Separator />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/practice" />} size="sm" variant="link">
          {t("dashboard.actions.startPractice")}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

function DashboardLoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-12">
        <DashboardSkeletonCard className="lg:col-span-5" />
        <DashboardSkeletonCard className="lg:col-span-7" />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <DashboardSkeletonCard key={index} />
        ))}
      </section>
    </div>
  )
}

function DashboardSkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-7 w-3/5" />
        <Skeleton className="h-5 w-1/3" />
      </CardContent>
    </Card>
  )
}

function DashboardErrorState() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon />
          {t("common.pageState.error.title")}
        </CardTitle>
        <CardDescription>{t("common.pageState.error.description")}</CardDescription>
      </CardHeader>
    </Card>
  )
}
