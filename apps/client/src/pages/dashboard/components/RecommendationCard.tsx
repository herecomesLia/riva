import { Link } from "@tanstack/react-router"
import { Clock3Icon, PlayIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardQuestionType, DashboardResponse } from "@/models/dashboard"
import type { Loadable } from "@/types"

const recommendationQuestionTypeKeys: Record<DashboardQuestionType, string> = {
  projectExperience: "dashboard.recommendation.questionTypes.projectExperience",
}

type RecommendationCardProps = {
  state: Loadable<DashboardResponse["recommendation"]>
}

export function RecommendationCard({ state }: RecommendationCardProps) {
  const { t } = useTranslation()
  const recommendation = state.status === "ready" ? state.data : null

  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon />
          {t("dashboard.recommendation.eyebrow")}
        </CardTitle>
        {state.status === "loading" ? (
          <Skeleton className="h-4 w-4/5" />
        ) : recommendation ? (
          <CardDescription>{recommendation.description}</CardDescription>
        ) : (
          <CardDescription>{t("dashboard.recommendation.empty.description")}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === "loading" ? (
          <RecommendationLoadingContent />
        ) : recommendation ? (
          <RecommendationDataContent recommendation={recommendation} />
        ) : (
          <p className="font-heading text-xl font-medium">
            {t("dashboard.recommendation.empty.title")}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {state.status === "loading" ? (
          <RecommendationLoadingFooter />
        ) : recommendation ? (
          <RecommendationDataFooter />
        ) : (
          <Button nativeButton={false} render={<Link to="/history" />} variant="outline">
            {t("dashboard.actions.viewHistory")}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function RecommendationLoadingContent() {
  return (
    <>
      <Skeleton className="h-6 w-4/5" />
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

  return (
    <>
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
    </>
  )
}

function RecommendationLoadingFooter() {
  return (
    <>
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-9 w-24" />
    </>
  )
}

function RecommendationDataFooter() {
  const { t } = useTranslation()

  return (
    <>
      <Button nativeButton={false} render={<Link to="/practice" />}>
        <PlayIcon data-icon="inline-start" />
        {t("dashboard.actions.startPractice")}
      </Button>
      <Button nativeButton={false} render={<Link to="/history" />} variant="outline">
        {t("dashboard.actions.viewHistory")}
      </Button>
    </>
  )
}
