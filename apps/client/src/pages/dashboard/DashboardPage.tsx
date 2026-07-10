import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BarChart3Icon,
  CalendarCheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  ClipboardCheckIcon,
  HistoryIcon,
  PlayIcon,
  SparklesIcon,
  TargetIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import {
  getDashboardPageState,
  type DashboardMetric,
  type DashboardMetricIcon,
  type DashboardPageState,
  type DashboardReadinessStage,
  type PageViewState,
} from "@/services/dashboard"

const metricIcons: Record<DashboardMetricIcon, LucideIcon> = {
  performance: BarChart3Icon,
  roleFit: TargetIcon,
  training: CalendarCheckIcon,
  weaknesses: CircleAlertIcon,
}

const readinessBadgeVariants = {
  complete: "secondary",
  current: "default",
  upcoming: "outline",
} as const

export function DashboardPage() {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const dashboardQuery = useQuery({
    queryFn: getDashboardPageState,
    queryKey: ["dashboard-page-state"],
  })
  const dashboardData = dashboardQuery.data
  const viewState: PageViewState = dashboardQuery.isPending
    ? "loading"
    : dashboardQuery.isError
      ? "error"
      : (dashboardData?.state ?? "error")

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="relative flex flex-col gap-2.5 py-2 lg:pr-72">
        <img
          alt=""
          className="pointer-events-none absolute -top-3 right-50 hidden w-64 mix-blend-multiply lg:block"
          src={dashboardRobot}
        />
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

      {viewState === "loading" && <DashboardLoadingState />}
      {viewState === "empty" && <DashboardEmptyState />}
      {viewState === "error" && <DashboardErrorState />}
      {viewState === "success" && dashboardData && (
        <DashboardOverview dashboardData={dashboardData} />
      )}
    </div>
  )
}

function DashboardOverview({ dashboardData }: { dashboardData: DashboardPageState }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-12">
        <CurrentRoleCard />
        <RecommendationCard />
      </section>

      <DashboardMetrics metrics={dashboardData.metrics} />

      <section className="grid gap-4 lg:grid-cols-12">
        <ReadinessCard stages={dashboardData.readinessStages} />
        <WeaknessesCard dashboardData={dashboardData} />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <NextSessionCard />
        <ActivityCard dashboardData={dashboardData} />
      </section>
    </div>
  )
}

function CurrentRoleCard() {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.currentRole.eyebrow")}</CardTitle>
        <CardAction>
          <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="outline">
            {t("dashboard.actions.adjustRole")}
          </Button>
        </CardAction>
        <CardDescription>{t("dashboard.currentRole.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TargetIcon className="text-muted-foreground" />
          <p className="font-heading text-xl font-medium">{t("dashboard.currentRole.title")}</p>
        </div>
        <Badge className="w-fit" variant="secondary">
          {t("dashboard.currentRole.status")}
        </Badge>
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="link">
          {t("dashboard.actions.analyzeRole")}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

function RecommendationCard() {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon />
          {t("dashboard.recommendation.eyebrow")}
        </CardTitle>
        <CardDescription>{t("dashboard.recommendation.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="font-heading text-xl font-medium">{t("dashboard.recommendation.title")}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t("dashboard.recommendation.type")}</Badge>
          <Badge variant="outline">
            <Clock3Icon />
            {t("dashboard.recommendation.duration")}
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

function DashboardMetrics({ metrics }: { metrics: DashboardMetric[] }) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t("dashboard.metrics.eyebrow")}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {metrics.map((metric) => {
        const Icon = metricIcons[metric.icon]

        return (
          <Card key={metric.titleKey} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="text-muted-foreground" />
                {t(metric.titleKey)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="font-heading text-2xl font-medium">{t(metric.valueKey)}</p>
              <CardDescription>{t(metric.descriptionKey)}</CardDescription>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}

function ReadinessCard({ stages }: { stages: DashboardReadinessStage[] }) {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>{t("dashboard.readiness.eyebrow")}</CardTitle>
        <CardDescription>{t("dashboard.readiness.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="font-heading text-xl font-medium">{t("dashboard.readiness.title")}</p>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, index) => (
            <li className="flex flex-col gap-2" key={stage.labelKey}>
              <div className="flex items-center gap-2">
                <Badge variant={readinessBadgeVariants[stage.status]}>{index + 1}</Badge>
                <span className="text-sm font-medium">{t(stage.labelKey)}</span>
              </div>
              <Badge className="w-fit" variant={readinessBadgeVariants[stage.status]}>
                {t(`dashboard.readiness.${stage.status}`)}
              </Badge>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/interview" />} size="sm" variant="outline">
          {t("dashboard.actions.startMockInterview")}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

function WeaknessesCard({ dashboardData }: { dashboardData: DashboardPageState }) {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.weaknesses.eyebrow")}</CardTitle>
        <CardDescription>{t("dashboard.weaknesses.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {dashboardData.weaknesses.map((weakness, index) => (
            <li className="flex flex-col gap-3" key={weakness.titleKey}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">{t(weakness.titleKey)}</p>
                  <p className="text-sm text-muted-foreground">{t(weakness.descriptionKey)}</p>
                </div>
                <Badge className="shrink-0" variant="outline">
                  {t(weakness.practiceCountKey)}
                </Badge>
              </div>
              {index < dashboardData.weaknesses.length - 1 && <Separator />}
            </li>
          ))}
        </ul>
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

function NextSessionCard() {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.nextSession.eyebrow")}</CardTitle>
        <CardDescription>{t("dashboard.nextSession.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-heading text-xl font-medium">{t("dashboard.nextSession.title")}</p>
        <Badge className="w-fit" variant="outline">
          <Clock3Icon />
          {t("dashboard.nextSession.meta")}
        </Badge>
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/practice" />}>
          <PlayIcon data-icon="inline-start" />
          {t("dashboard.actions.continueTraining")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ActivityCard({ dashboardData }: { dashboardData: DashboardPageState }) {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>{t("dashboard.activity.eyebrow")}</CardTitle>
        <CardDescription>{t("dashboard.activity.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {dashboardData.activities.map((activity, index) => (
            <li className="flex flex-col gap-3" key={activity.titleKey}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-medium">{t(activity.titleKey)}</p>
                  <p className="text-sm text-muted-foreground">{t(activity.descriptionKey)}</p>
                </div>
                <Badge className="shrink-0" variant="secondary">
                  {t(activity.scoreKey)}
                </Badge>
              </div>
              {index < dashboardData.activities.length - 1 && <Separator />}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/history" />} size="sm" variant="link">
          <HistoryIcon data-icon="inline-start" />
          {t("dashboard.actions.viewHistory")}
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
      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardSkeletonCard />
        <DashboardSkeletonCard />
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

function DashboardEmptyState() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheckIcon />
            </EmptyMedia>
            <EmptyTitle>{t("dashboard.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("dashboard.empty.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link to="/profile" />}>
              {t("dashboard.empty.action")}
            </Button>
          </EmptyContent>
        </Empty>
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
