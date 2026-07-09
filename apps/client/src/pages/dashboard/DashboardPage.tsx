import { useQuery } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  InboxIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getDashboardPageState,
  type DashboardCardData,
  type DashboardCardIcon,
  type PageViewState,
} from "@/services/dashboard"

const dashboardCardIcons: Record<DashboardCardIcon, typeof ClipboardCheckIcon> = {
  currentRole: ClipboardCheckIcon,
  nextSession: CalendarDaysIcon,
  recommendation: SparklesIcon,
}

export function DashboardPage() {
  const { t } = useTranslation()
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Badge className="w-fit" variant="outline">
          {t("dashboard.badge")}
        </Badge>
        <h1 className="font-heading text-2xl font-medium">{t("dashboard.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("dashboard.description")}</p>
      </div>

      {viewState === "loading" && (
        <DashboardLoadingCards cards={dashboardQuery.data?.cards ?? []} />
      )}
      {viewState === "empty" && (
        <DashboardStateCard
          description={t("common.pageState.empty.description")}
          icon={InboxIcon}
          title={t("common.pageState.empty.title")}
        />
      )}
      {viewState === "error" && (
        <DashboardStateCard
          description={t("common.pageState.error.description")}
          icon={AlertCircleIcon}
          title={t("common.pageState.error.title")}
        />
      )}
      {viewState === "success" && dashboardData && (
        <DashboardSummaryCards cards={dashboardData.cards} />
      )}
    </div>
  )
}

function DashboardLoadingCards({ cards }: { cards: DashboardCardData[] }) {
  const skeletonCardKeys =
    cards.length > 0
      ? cards.map((card) => card.titleKey)
      : ["dashboard-loading-0", "dashboard-loading-1", "dashboard-loading-2"]

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {skeletonCardKeys.map((cardKey) => (
        <Card key={cardKey}>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-5 w-16" />
          </CardFooter>
        </Card>
      ))}
    </section>
  )
}

function DashboardStateCard({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof InboxIcon
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon data-icon="inline-start" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function DashboardSummaryCards({ cards }: { cards: DashboardCardData[] }) {
  const { t } = useTranslation()

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => {
        const Icon = dashboardCardIcons[card.icon]

        return (
          <Card key={card.titleKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon data-icon="inline-start" />
                {t(card.titleKey)}
              </CardTitle>
              <CardDescription>{t(card.descriptionKey)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
            <CardFooter>
              <Badge variant="secondary">{t(card.badgeKey)}</Badge>
            </CardFooter>
          </Card>
        )
      })}
    </section>
  )
}
