import { Link } from "@tanstack/react-router"
import { Clock3Icon, PlayIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { mapTrainingRecommendationToEntry } from "@/app/training-recommendation-entry"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { defaultHistorySearch } from "@/pages/history/history-navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

type RecommendationCardProps = {
  state: Loadable<DashboardResponse["recommendation"]>
}

export function RecommendationCard({ state }: RecommendationCardProps) {
  const { t } = useTranslation()
  const recommendation = state.status === "ready" ? state.data : null

  return (
    <Card className="@container/recommendation min-w-0 @3xl/dashboard:col-span-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          {t("dashboard.recommendation.eyebrow")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === "loading" ? (
          <RecommendationLoadingContent />
        ) : recommendation ? (
          <RecommendationDataContent recommendation={recommendation} />
        ) : (
          <>
            <p className="font-heading text-xl font-semibold leading-snug">
              {t("dashboard.recommendation.empty.title")}
            </p>
            <CardDescription>{t("dashboard.recommendation.empty.description")}</CardDescription>
          </>
        )}
      </CardContent>
      <CardFooter className="mt-auto flex flex-col items-stretch gap-2 @sm/recommendation:flex-row @sm/recommendation:flex-wrap [&>a]:h-auto [&>a]:min-h-10 [&>a]:min-w-0 [&>a]:whitespace-normal [&>a]:py-2 [&>a]:text-center">
        {state.status === "loading" ? (
          <RecommendationLoadingFooter />
        ) : recommendation ? (
          <RecommendationDataFooter recommendation={recommendation} />
        ) : (
          <Link
            className={buttonVariants({ variant: "outline" })}
            search={defaultHistorySearch}
            to="/history"
          >
            {t("dashboard.actions.viewHistory")}
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}

function RecommendationLoadingContent() {
  return (
    <>
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
    </>
  )
}

function RecommendationDataContent({
  recommendation,
}: {
  recommendation: NonNullable<DashboardResponse["recommendation"]>
}) {
  const { t } = useTranslation()
  const content = recommendation.recommendation

  return (
    <>
      <p className="font-heading text-xl font-semibold leading-snug tracking-tight">
        {t(`dashboard.recommendation.actions.${content.action}.title`)}
      </p>
      <CardDescription className="leading-6">{content.reason}</CardDescription>
      <div className="flex flex-wrap gap-2">
        {"questionType" in content && (
          <Badge variant="outline">{t(`history.questionTypes.${content.questionType}`)}</Badge>
        )}
        {"interviewType" in content && (
          <Badge variant="outline">{t(`history.types.${content.interviewType}`)}</Badge>
        )}
        <Badge variant="outline">
          <Clock3Icon />
          {t("dashboard.recommendation.duration", {
            minutes: recommendation.estimatedMinutes,
          })}
        </Badge>
      </div>
    </>
  )
}

function RecommendationLoadingFooter() {
  return (
    <>
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-10 w-24" />
    </>
  )
}

function RecommendationDataFooter({
  recommendation,
}: {
  recommendation: NonNullable<DashboardResponse["recommendation"]>
}) {
  const { t } = useTranslation()
  const entry = mapTrainingRecommendationToEntry(
    recommendation.recommendation,
    recommendation.roleId,
  )

  return (
    <>
      {entry && (
        <Link className={buttonVariants()} search={entry.search} to={entry.to}>
          <PlayIcon data-icon="inline-start" />
          {t(`history.detail.recommendationActions.${entry.action}`)}
        </Link>
      )}
      <Link
        className={buttonVariants({ variant: "outline" })}
        search={defaultHistorySearch}
        to="/history"
      >
        {t("dashboard.actions.viewHistory")}
      </Link>
    </>
  )
}
