import { AlertCircleIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import dashboardRobotDark from "@/assets/dashboard-robot-dark.png"
import dashboardRobot from "@/assets/dashboard-robot.png"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

import { CurrentRoleCard } from "./components/CurrentRoleCard"
import { DashboardMetrics } from "./components/DashboardMetrics"
import { PerformanceTrendCard } from "./components/PerformanceTrendCard"
import { RecommendationCard } from "./components/RecommendationCard"
import { WeaknessesCard } from "./components/WeaknessesCard"

type DashboardViewProps =
  | {
      variant: "default"
      displayName: string
      content: Loadable<DashboardResponse>
    }
  | {
      variant: "error"
      onRetry: () => void
    }

export function DashboardView(props: DashboardViewProps) {
  if (props.variant === "error") {
    return <DashboardErrorView onRetry={props.onRetry} />
  }

  return <DashboardDefaultView displayName={props.displayName} content={props.content} />
}

function DashboardDefaultView({
  content,
  displayName,
}: {
  content: Loadable<DashboardResponse>
  displayName: string
}) {
  const contentState =
    content.status === "loading"
      ? {
          currentRole: { status: "loading" as const },
          recommendation: { status: "loading" as const },
          metrics: { status: "loading" as const },
          performanceTrend: { status: "loading" as const },
          weaknesses: { status: "loading" as const },
        }
      : {
          currentRole: { status: "ready" as const, data: content.data.currentRole },
          recommendation: { status: "ready" as const, data: content.data.recommendation },
          metrics: { status: "ready" as const, data: content.data.metrics },
          performanceTrend: { status: "ready" as const, data: content.data.performanceTrend },
          weaknesses: { status: "ready" as const, data: content.data.weaknesses },
        }

  return (
    <div className="@container/dashboard mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <DashboardHeader displayName={displayName} />

      <div
        className="flex flex-col gap-6"
        data-testid={content.status === "loading" ? "dashboard-loading-state" : undefined}
      >
        <section className="relative grid gap-4 @3xl/dashboard:grid-cols-12">
          {/* At 220px wide, the artwork has 12px of padding below the torso. */}
          <div className="pointer-events-none absolute right-[20%] bottom-[calc(100%-0.75rem)] hidden w-55 @3xl/dashboard:block">
            <img alt="" className="w-full mix-blend-multiply dark:hidden" src={dashboardRobot} />
            <img alt="" className="hidden w-full dark:block" src={dashboardRobotDark} />
          </div>
          <CurrentRoleCard state={contentState.currentRole} />
          <RecommendationCard state={contentState.recommendation} />
        </section>

        <DashboardMetrics state={contentState.metrics} />

        <section className="grid gap-4 @3xl/dashboard:grid-cols-12">
          <PerformanceTrendCard state={contentState.performanceTrend} />
          <WeaknessesCard state={contentState.weaknesses} />
        </section>
      </div>
    </div>
  )
}

function DashboardHeader({ displayName }: { displayName: string }) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-col justify-center @3xl/dashboard:min-h-24 @3xl/dashboard:pr-[calc(20%+14rem)]">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
          {t("dashboard.title")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {t("dashboard.greeting.prefix")}
          <span className="font-semibold text-primary">{displayName}</span>
          {t("dashboard.greeting.suffix")}
        </p>
      </div>
    </header>
  )
}

function DashboardErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Card role="alert">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircleIcon />
            {t("common.pageState.error.title")}
          </CardTitle>
          <CardDescription>{t("common.pageState.error.description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={onRetry}>{t("common.pageState.error.retry")}</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
