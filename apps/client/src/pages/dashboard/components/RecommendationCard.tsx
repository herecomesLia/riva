import { Link } from "@tanstack/react-router"
import { Clock3Icon, PlayIcon, RotateCcwIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { mapTrainingPlanToEntry } from "@/app/training-planning-entry"
import { mapTrainingRecommendationToEntry } from "@/app/training-recommendation-entry"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import type { TrainingPlanningPlan } from "@/models/training-planning"
import type { Loadable } from "@/types"

import type { TrainingPlanningRecommendationState } from "../hooks/useTrainingPlanningRecommendation"

type RecommendationCardProps = {
  state?: TrainingPlanningRecommendationState
  legacyState?: Loadable<DashboardResponse["recommendation"]>
}

export function RecommendationCard({ state, legacyState }: RecommendationCardProps) {
  if (state === undefined) {
    return <LegacyRecommendationCard state={legacyState ?? { status: "ready", data: null }} />
  }
  return <TrainingPlanningRecommendationCard state={state} />
}

function TrainingPlanningRecommendationCard({
  state,
}: {
  state: TrainingPlanningRecommendationState
}) {
  const { t } = useTranslation()
  const response =
    state.status === "succeeded" || state.status === "failed" ? state.response : undefined
  const plan = response?.plan ?? null

  return (
    <Card className="lg:col-span-7" data-testid="training-planning-recommendation">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon />
          {t("dashboard.recommendation.eyebrow")}
        </CardTitle>
        {state.status === "loading" ? (
          <CardDescription>{t("dashboard.recommendation.generating.description")}</CardDescription>
        ) : state.status === "failed" ? (
          <CardDescription>
            {state.pollingTimedOut
              ? t("common.agentPolling.timeoutDescription")
              : t("dashboard.recommendation.failed.description")}
          </CardDescription>
        ) : plan ? (
          <CardDescription>{plan.reason}</CardDescription>
        ) : (
          <CardDescription>{t("dashboard.recommendation.empty.description")}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === "loading" ? (
          <RecommendationLoadingContent />
        ) : state.status === "failed" ? (
          <p className="font-heading text-xl font-medium">
            {state.pollingTimedOut
              ? t("common.agentPolling.timeoutTitle")
              : t("dashboard.recommendation.failed.title")}
          </p>
        ) : plan ? (
          <TrainingPlanningDataContent plan={plan} />
        ) : (
          <p className="font-heading text-xl font-medium">
            {t("dashboard.recommendation.empty.title")}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {state.status === "loading" ? (
          <RecommendationLoadingFooter />
        ) : state.status === "failed" ? (
          <Button disabled={state.isRetrying} onClick={state.onRetry}>
            <RotateCcwIcon data-icon="inline-start" />
            {state.isRetrying
              ? state.pollingTimedOut
                ? t("common.agentPolling.rechecking")
                : t("dashboard.recommendation.failed.retrying")
              : state.pollingTimedOut
                ? t("common.agentPolling.recheck")
                : t("dashboard.recommendation.failed.retry")}
          </Button>
        ) : plan && response ? (
          <TrainingPlanningDataFooter plan={plan} targetRoleId={response.targetRoleId} />
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

function TrainingPlanningDataContent({ plan }: { plan: TrainingPlanningPlan }) {
  const { t } = useTranslation()

  return (
    <>
      <p className="font-heading text-xl font-medium">
        {t(`dashboard.recommendation.actions.${plan.action}.title`)}
      </p>
      <div className="flex flex-wrap gap-2">
        {plan.focusAreas.map((focusArea) => (
          <Badge key={focusArea} variant="outline">
            {focusArea}
          </Badge>
        ))}
        {plan.action === "targetedPractice" ? (
          <>
            <Badge variant="outline">{t(`history.questionTypes.${plan.questionType}`)}</Badge>
            <Badge variant="outline">{t(`history.difficulty.${plan.difficulty}`)}</Badge>
            {plan.prioritizeWeaknesses && (
              <Badge variant="secondary">
                {t("dashboard.recommendation.prioritizeWeaknesses")}
              </Badge>
            )}
          </>
        ) : (
          <>
            <Badge variant="outline">{t(`history.rounds.${plan.round}`)}</Badge>
            <Badge variant="outline">{t(`history.difficulty.${plan.difficulty}`)}</Badge>
            <Badge variant="outline">
              <Clock3Icon />
              {t("dashboard.recommendation.duration", { minutes: plan.durationMinutes })}
            </Badge>
          </>
        )}
      </div>
    </>
  )
}

function TrainingPlanningDataFooter({
  plan,
  targetRoleId,
}: {
  plan: TrainingPlanningPlan
  targetRoleId: string
}) {
  const { t } = useTranslation()
  const entry = mapTrainingPlanToEntry(plan, targetRoleId)

  return (
    <>
      <Link className={buttonVariants()} search={entry.search} to={entry.to}>
        <PlayIcon data-icon="inline-start" />
        {t(`dashboard.recommendation.actions.${plan.action}.start`)}
      </Link>
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

function RecommendationLoadingFooter() {
  return (
    <>
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-9 w-24" />
    </>
  )
}

function LegacyRecommendationCard({
  state,
}: {
  state: Loadable<DashboardResponse["recommendation"]>
}) {
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
          <CardDescription>{recommendation.recommendation.reason}</CardDescription>
        ) : (
          <CardDescription>{t("dashboard.recommendation.empty.description")}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === "loading" ? (
          <RecommendationLoadingContent />
        ) : recommendation ? (
          <LegacyRecommendationDataContent recommendation={recommendation} />
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
          <LegacyRecommendationDataFooter recommendation={recommendation} />
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

function LegacyRecommendationDataContent({
  recommendation,
}: {
  recommendation: NonNullable<DashboardResponse["recommendation"]>
}) {
  const { t } = useTranslation()
  const content = recommendation.recommendation

  return (
    <>
      <p className="font-heading text-xl font-medium">
        {t(`dashboard.recommendation.actions.${content.action}.title`)}
      </p>
      <div className="flex flex-wrap gap-2">
        {"questionType" in content && (
          <Badge variant="outline">{t(`history.questionTypes.${content.questionType}`)}</Badge>
        )}
        {"round" in content && (
          <Badge variant="outline">{t(`history.rounds.${content.round}`)}</Badge>
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

function LegacyRecommendationDataFooter({
  recommendation,
}: {
  recommendation: NonNullable<DashboardResponse["recommendation"]>
}) {
  const { t } = useTranslation()
  const entry = mapTrainingRecommendationToEntry(
    recommendation.recommendation,
    recommendation.targetRoleId,
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
